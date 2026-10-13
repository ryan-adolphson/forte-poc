import { Inject, Injectable } from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  DocumentFile,
  DocumentIngest,
  DocumentListItem,
  DocumentReference,
  DocumentText,
} from './document.js';

const MAX_RESULTS = 5;

/** Makes user text match literally in ILIKE (backslash is Postgres's default escape). */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/**
 * The only data access the assistant and the PDF endpoint have to documents.
 *
 * Every read starts from `current()`, which puts two conditions in the SQL: the revision
 * is the current one (`is_current`), and its product is visible to the bot
 * (`visible_to_bot`). A superseded revision, a document of a hidden product and a
 * non-existent document are therefore indistinguishable to callers. New read methods must
 * start from `current()` too. There is deliberately no way to ask for a given revision.
 */
@Injectable()
export class DocumentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private current() {
    return this.prisma.db.orm.public.Document.where({ isCurrent: true }).where((d) =>
      d.product.some((p) => p.visibleToBot.eq(true)),
    );
  }

  /**
   * The current data sheet of the product with this SKU (case-insensitive), or null.
   * If a product has several document numbers, the most recently issued one wins.
   */
  async getCurrentForSku(sku: string): Promise<DocumentText | null> {
    const pattern = escapeLike(sku.trim());
    const row = await this.current()
      .where((d) => d.product.some((p) => p.sku.ilike(pattern)))
      .select('documentNumber', 'revision', 'issueDate', 'title', 'text')
      .include('product', (p) => p.select('sku', 'name'))
      .orderBy([(d) => d.issueDate.desc(), (d) => d.documentNumber.asc()])
      .first();
    return row === null ? null : toDocumentText(row);
  }

  /**
   * The reference (no text) of the current data sheet of each of these exact SKUs, keyed by
   * SKU, in one query. A SKU with no data sheet, a hidden one and an unknown one are all
   * simply absent. As in `getCurrentForSku`, the most recently issued document number wins.
   */
  async getCurrentReferences(skus: string[]): Promise<Map<string, DocumentReference>> {
    const references = new Map<string, DocumentReference>();
    if (skus.length === 0) return references;
    const rows = await this.current()
      .where((d) => d.product.some((p) => p.sku.in(skus)))
      .select('documentNumber', 'revision', 'issueDate')
      .include('product', (p) => p.select('sku'))
      .orderBy([(d) => d.issueDate.desc(), (d) => d.documentNumber.asc()])
      .all();
    for (const { product, ...reference } of rows) {
      // Rows arrive newest first, so the first one seen for a SKU is the one to keep.
      if (!references.has(product!.sku)) references.set(product!.sku, reference);
    }
    return references;
  }

  /**
   * Current revisions whose title or text contains every whitespace-separated word of
   * `query`, case-insensitively. Ordered by document number, at most 5. Blank returns [].
   */
  async searchCurrent(query: string): Promise<DocumentText[]> {
    const words = query.split(/\s+/).filter((word) => word !== '');
    if (words.length === 0) return [];
    const patterns = words.map((word) => `%${escapeLike(word)}%`);

    const rows = await this.current()
      .where((d) =>
        and(...patterns.map((pattern) => or(d.title.ilike(pattern), d.text.ilike(pattern)))),
      )
      .select('documentNumber', 'revision', 'issueDate', 'title', 'text')
      .include('product', (p) => p.select('sku', 'name'))
      .orderBy((d) => d.documentNumber.asc())
      .limit(MAX_RESULTS)
      .all();
    return rows.map(toDocumentText);
  }

  /**
   * Every current document of a visible product, for the documents page: no text, no bytes.
   * Ordered by product category, then product name, then document number. Not capped.
   *
   * `revisionCount` is how many revisions are stored for the document number, superseded
   * ones included. It is only a number about a document that is already listed: nothing of
   * a superseded revision is read, and a document that `current()` leaves out gets no count.
   */
  async listCurrent(): Promise<DocumentListItem[]> {
    const rows = await this.current()
      .select('documentNumber', 'revision', 'issueDate', 'title')
      .include('product', (p) => p.select('sku', 'name', 'category'))
      .orderBy([
        (d) => d.product.category.asc(),
        (d) => d.product.name.asc(),
        (d) => d.documentNumber.asc(),
      ])
      .all();
    if (rows.length === 0) return [];

    // One grouped count for the listed numbers only; deliberately not through `current()`.
    const counts = await this.prisma.db.orm.public.Document.where((d) =>
      d.documentNumber.in(rows.map((row) => row.documentNumber)),
    )
      .groupBy('documentNumber')
      .aggregate((aggregate) => ({ revisionCount: aggregate.count() }));
    const revisionCounts = new Map(counts.map((c) => [c.documentNumber, c.revisionCount]));

    return rows.map(({ product, ...document }) => ({
      ...document,
      // Typed nullable by the ORM, but `product_id` is NOT NULL and `current()` requires the product.
      sku: product!.sku,
      productName: product!.name,
      category: product!.category,
      // The listed row itself is one of the counted revisions, so the number is always there.
      revisionCount: revisionCounts.get(document.documentNumber)!,
    }));
  }

  /** The current revision's PDF for this exact document number, or null. */
  async getCurrentFile(documentNumber: string): Promise<DocumentFile | null> {
    return this.current()
      .where({ documentNumber: documentNumber.trim() })
      .select('documentNumber', 'revision', 'fileName', 'content')
      .first();
  }

  /**
   * For the ingestion script only; never expose to a tool or an endpoint.
   *
   * Inserts or updates one revision by (documentNumber, revision) and, in the same
   * transaction, recomputes which revision of that document number is current: the latest
   * `issueDate`, then the higher `revision`. The caller has no say in it, so a newer
   * revision replaces the older one atomically and a late-arriving older one changes nothing.
   */
  async ingest(input: DocumentIngest): Promise<void> {
    await this.prisma.db.transaction(async (tx) => {
      // Locking the product row makes concurrent ingests for the same product queue up.
      const product = await tx.orm.public.Product.where({ sku: input.sku })
        .select('id')
        .forNoKeyUpdate()
        .first();
      if (product === null) {
        throw new Error(`Cannot ingest ${input.documentNumber}: unknown SKU "${input.sku}"`);
      }

      const { documentNumber, revision } = input;
      const fields = {
        title: input.title,
        productId: product.id,
        issueDate: input.issueDate,
        changeNote: input.changeNote ?? null,
        text: input.text,
        fileName: input.fileName,
        content: input.content,
      };
      // A new row starts as not current (the column default); an update leaves the flag alone.
      await tx.orm.public.Document.upsert({
        create: { documentNumber, revision, ...fields },
        update: fields,
        conflictOn: { documentNumber, revision },
      });

      const revisions = tx.orm.public.Document.where({ documentNumber });
      const latest = await revisions
        .select('id')
        .orderBy([(d) => d.issueDate.desc(), (d) => d.revision.desc()])
        .first();
      // Clear before set, so the one-current-per-document unique index never sees two.
      await revisions
        .where((d) => and(d.isCurrent.eq(true), d.id.neq(latest!.id)))
        .updateAll({ isCurrent: false });
      await revisions
        .where((d) => and(d.isCurrent.eq(false), d.id.eq(latest!.id)))
        .updateAll({ isCurrent: true });
    });
  }
}

function toDocumentText(row: {
  documentNumber: string;
  revision: string;
  issueDate: string;
  title: string;
  text: string;
  // Typed nullable by the ORM, but `product_id` is NOT NULL and `current()` requires the product.
  product: { sku: string; name: string } | null;
}): DocumentText {
  const product = row.product!;
  return {
    documentNumber: row.documentNumber,
    revision: row.revision,
    issueDate: row.issueDate,
    title: row.title,
    sku: product.sku,
    productName: product.name,
    text: row.text,
  };
}
