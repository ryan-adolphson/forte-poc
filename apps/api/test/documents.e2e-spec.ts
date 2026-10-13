import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import type { DocumentIngest } from '../src/documents/document.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hiddenSkus } from '../src/prisma/seed-data.js';

/**
 * Against the dev database. Every row this file writes has a document number starting
 * with `TEST-DS-<run>-` and is deleted in `afterAll`; `products` is never written.
 *
 * Isolation from real data sheets: the fake texts and titles are made of random tokens,
 * so no realistic search matches them, and they are looked up by their own document
 * numbers and tokens. The one shared question is "the current data sheet of OWNED_SKU":
 * `getCurrentForSku` returns the most recently issued one, so the fakes that must win use
 * issue dates in the year 2999 and the others use 1990. While this file runs (about a
 * second), OWNED_SKU's current data sheet is a fake; other e2e files must not assert on
 * the data sheet of that SKU.
 */
const OWNED_SKU = 'FRT-MAS-AAC100';
const HIDDEN_SKU = hiddenSkus[0]!;

const run = randomBytes(4).toString('hex');
const prefix = `TEST-DS-${run}-`;
const token = (name: string) => `zq${name}${run}`;

function sheet(
  name: string,
  revision: string,
  issueDate: string,
  extra: Partial<DocumentIngest> = {},
): DocumentIngest {
  return {
    documentNumber: `${prefix}${name}`,
    revision,
    title: `${token('title')} ${name}`,
    sku: OWNED_SKU,
    issueDate,
    changeNote: `note ${revision}`,
    text: `${token(`only${name}${revision}`)} body`,
    fileName: `${prefix}${name}_rev-${revision}.pdf`,
    content: new TextEncoder().encode(`%PDF-fake ${name} ${revision}`),
    ...extra,
  };
}

describe('DocumentsService', () => {
  let app: INestApplication;
  let documents: DocumentsService;
  let prisma: PrismaService;

  /** Every stored revision of a test document, bypassing the service's read rules. */
  const stored = (name: string) =>
    prisma.db.orm.public.Document.where({ documentNumber: `${prefix}${name}` })
      .select('revision', 'isCurrent')
      .orderBy((d) => d.revision.asc())
      .all();

  const currentRevision = async (name: string) =>
    (await documents.getCurrentFile(`${prefix}${name}`))?.revision ?? null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    documents = app.get(DocumentsService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      // `run` is hex and the prefix has no LIKE wildcards.
      await prisma.db.orm.public.Document.where((d) => d.documentNumber.like(`${prefix}%`)).deleteAll();
    } finally {
      await app.close();
    }
  });

  describe('current revision only', () => {
    const a = sheet('MAIN', 'A', '2999-01-01');
    const b = sheet('MAIN', 'B', '2999-02-01');
    const c = sheet('MAIN', 'C', '2999-03-01');

    it('serves only B after A then B', async () => {
      await documents.ingest(a);
      expect(await currentRevision('MAIN')).toBe('A');
      await documents.ingest(b);

      const file = await documents.getCurrentFile(a.documentNumber);
      expect(file?.revision).toBe('B');
      expect(Buffer.from(file!.content).equals(Buffer.from(b.content))).toBe(true);

      expect((await documents.getCurrentForSku(OWNED_SKU))?.revision).toBe('B');
      expect((await documents.searchCurrent(token('onlyMAINB'))).map((d) => d.revision)).toEqual(['B']);
      expect(await documents.searchCurrent(token('onlyMAINA'))).toEqual([]);
      expect((await documents.searchCurrent(`${token('title')} MAIN`)).map((d) => d.revision)).toEqual(['B']);
    });

    it('returns exactly the documented keys, without id, flag, timestamps or bytes', async () => {
      const text = await documents.getCurrentForSku(OWNED_SKU.toLowerCase());
      expect(text).toEqual({
        documentNumber: b.documentNumber,
        revision: 'B',
        issueDate: '2999-02-01',
        title: b.title,
        sku: OWNED_SKU,
        productName: expect.any(String),
        text: b.text,
      });
      const [found] = await documents.searchCurrent(token('onlyMAINB'));
      expect(found).toEqual(text);
      expect(Object.keys(found!).sort()).toEqual([
        'documentNumber',
        'issueDate',
        'productName',
        'revision',
        'sku',
        'text',
        'title',
      ]);

      const file = await documents.getCurrentFile(b.documentNumber);
      expect(Object.keys(file!).sort()).toEqual(['content', 'documentNumber', 'fileName', 'revision']);
      expect(file!.fileName).toBe(b.fileName);
    });

    it('serves only C after C, and out-of-order A and B do not take over', async () => {
      await documents.ingest(c);
      expect(await currentRevision('MAIN')).toBe('C');

      await documents.ingest(a);
      await documents.ingest(b);
      expect(await currentRevision('MAIN')).toBe('C');
      expect((await documents.getCurrentForSku(OWNED_SKU))?.revision).toBe('C');
      expect(await documents.searchCurrent(token('onlyMAINA'))).toEqual([]);
      expect(await documents.searchCurrent(token('onlyMAINB'))).toEqual([]);
    });

    it('is idempotent when C is ingested again, and updates its content', async () => {
      await documents.ingest({ ...c, text: `${c.text} ${token('edited')}` });

      expect(await stored('MAIN')).toEqual([
        { revision: 'A', isCurrent: false },
        { revision: 'B', isCurrent: false },
        { revision: 'C', isCurrent: true },
      ]);
      expect((await documents.searchCurrent(token('edited'))).map((d) => d.revision)).toEqual(['C']);
    });

    it('moves currency when a re-ingested revision gets a later date', async () => {
      await documents.ingest({ ...a, issueDate: '2999-04-01' });
      expect(await currentRevision('MAIN')).toBe('A');
      await documents.ingest(a);
      expect(await currentRevision('MAIN')).toBe('C');
    });

    it('is refused by the database when a second revision is written as current', async () => {
      const product = await prisma.db.orm.public.Product.where({ sku: OWNED_SKU }).select('id').first();
      const { sku: _sku, changeNote: _changeNote, ...row } = sheet('MAIN', 'D', '2999-05-01');

      const write = prisma.db.orm.public.Document.create({ ...row, productId: product!.id, isCurrent: true });
      await expect(write).rejects.toSatisfy((error: unknown) =>
        /documents_one_current|23505/.test(describeError(error)),
      );
      expect((await stored('MAIN')).map((d) => d.revision)).toEqual(['A', 'B', 'C']);
    });

    it('picks the higher revision when issue dates tie, in either arrival order', async () => {
      await documents.ingest(sheet('TIE', 'B', '1990-01-01'));
      await documents.ingest(sheet('TIE', 'A', '1990-01-01'));
      expect(await currentRevision('TIE')).toBe('B');

      await documents.ingest(sheet('TIE2', 'A', '1990-01-01'));
      await documents.ingest(sheet('TIE2', 'B', '1990-01-01'));
      expect(await currentRevision('TIE2')).toBe('B');
    });

    it('answers getCurrentForSku with the most recently issued document number', async () => {
      await documents.ingest(sheet('OTHER', 'A', '2999-06-01'));
      expect((await documents.getCurrentForSku(OWNED_SKU))?.documentNumber).toBe(`${prefix}OTHER`);
      // Both documents stay current and findable under their own numbers.
      expect(await currentRevision('MAIN')).toBe('C');
      expect(await currentRevision('OTHER')).toBe('A');
    });
  });

  describe('visibility', () => {
    it('treats a document of a hidden product exactly like one that does not exist', async () => {
      const hidden = sheet('HIDDEN', 'A', '2999-12-31', { sku: HIDDEN_SKU });
      await documents.ingest(hidden);
      // It is stored and current; only the read rules keep it out.
      expect(await stored('HIDDEN')).toEqual([{ revision: 'A', isCurrent: true }]);

      expect(await documents.getCurrentFile(hidden.documentNumber)).toBeNull();
      expect(await documents.getCurrentFile(`${prefix}NOPE`)).toBeNull();
      expect(await documents.searchCurrent(token('onlyHIDDENA'))).toEqual([]);
      expect(await documents.searchCurrent(`${token('title')} HIDDEN`)).toEqual([]);
      expect(await documents.searchCurrent(token('nope'))).toEqual([]);
      expect(await documents.getCurrentForSku(HIDDEN_SKU)).toBeNull();
      expect(await documents.getCurrentForSku(HIDDEN_SKU.toLowerCase())).toBeNull();
      expect(await documents.getCurrentForSku('FRT-NOPE-0000')).toBeNull();
      expect(await documents.getCurrentReferences([HIDDEN_SKU, 'FRT-NOPE-0000'])).toEqual(new Map());
    });

    it('does not treat LIKE wildcards in a SKU as wildcards', async () => {
      expect(await documents.getCurrentForSku('FRT-MAS-AAC___')).toBeNull();
      expect(await documents.getCurrentForSku('%')).toBeNull();
    });
  });

  // Read-only, against the real data sheets (`npm run db:ingest-docs -w api`): three
  // revisions each of the C32/40 and PIR sheets are stored, and only C is current.
  describe('getCurrentReferences', () => {
    it('returns the current revision of each SKU in one map, as reference fields only', async () => {
      const references = await documents.getCurrentReferences([
        'FRT-CON-C3240',
        'FRT-INS-PIR080',
        HIDDEN_SKU,
        'FRT-NOPE-0000',
      ]);

      expect(references).toEqual(
        new Map([
          ['FRT-CON-C3240', { documentNumber: 'DS-FRT-CON-C3240', revision: 'C', issueDate: '2026-01-19' }],
          ['FRT-INS-PIR080', { documentNumber: 'DS-FRT-INS-PIR080', revision: 'C', issueDate: '2026-03-02' }],
        ]),
      );
      // It agrees with what the assistant reads as the sheet itself.
      const full = await documents.getCurrentForSku('FRT-CON-C3240');
      expect(references.get('FRT-CON-C3240')).toEqual({
        documentNumber: full!.documentNumber,
        revision: full!.revision,
        issueDate: full!.issueDate,
      });
    });

    it('matches SKUs exactly and returns nothing for none', async () => {
      expect(await documents.getCurrentReferences([])).toEqual(new Map());
      expect(await documents.getCurrentReferences(['frt-con-c3240', 'FRT-CON-C32%', '%'])).toEqual(new Map());
    });
  });

  describe('searchCurrent', () => {
    beforeAll(async () => {
      await documents.ingest(
        sheet('S0', 'A', '1990-01-01', {
          title: `${token('intitle')} sheet`,
          text: `${token('intext')} ${token('pct')}100%done ${token('und')}a_b`,
        }),
      );
      for (const name of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
        await documents.ingest(sheet(name, 'A', '1990-01-01', { text: `${token('bulk')} ${name}` }));
      }
    });

    it('requires every word, in title or text, in any case', async () => {
      const numbers = async (query: string) => (await documents.searchCurrent(query)).map((d) => d.documentNumber);

      expect(await numbers(`${token('intitle')}   ${token('intext')}`)).toEqual([`${prefix}S0`]);
      expect(await numbers(`${token('intext')}\t${token('intitle')}`.toUpperCase())).toEqual([`${prefix}S0`]);
      expect(await numbers(`${token('intitle')} ${token('absent')}`)).toEqual([]);
    });

    it('matches % and _ literally', async () => {
      const count = async (query: string) => (await documents.searchCurrent(query)).length;

      expect(await count(`${token('pct')}100%done`)).toBe(1);
      expect(await count(`${token('pct')}1%done`)).toBe(0);
      expect(await count(`${token('und')}a_b`)).toBe(1);
      expect(await count(`${token('und')}a__`)).toBe(0);
    });

    it('returns at most 5, ordered by document number', async () => {
      const results = await documents.searchCurrent(token('bulk'));
      expect(results.map((d) => d.documentNumber)).toEqual(
        ['S1', 'S2', 'S3', 'S4', 'S5'].map((name) => `${prefix}${name}`),
      );
    });

    it('returns nothing for a blank query', async () => {
      expect(await documents.searchCurrent('')).toEqual([]);
      expect(await documents.searchCurrent(' \t\n ')).toEqual([]);
    });
  });

  describe('ingest', () => {
    it('rejects an unknown SKU by name and writes nothing', async () => {
      await expect(documents.ingest(sheet('NOSKU', 'A', '2999-01-01', { sku: 'FRT-NOPE-0000' }))).rejects.toThrow(
        'FRT-NOPE-0000',
      );
      expect(await stored('NOSKU')).toEqual([]);
    });
  });
});

/** The error's own text plus that of its causes, where the database's message ends up. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  for (let e = error; e instanceof Error; e = e.cause) {
    parts.push(e.message, JSON.stringify(e));
  }
  return parts.join(' ');
}
