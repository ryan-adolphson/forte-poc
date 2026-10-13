import type { ChatSource } from '@forte/chat-contract';
import type { DocumentReference, DocumentText } from '../documents/document.js';

/** Most sources attached to one answer. */
export const MAX_SOURCES = 8;

/**
 * A record a tool handed to the model in this turn. `direct` is true when the tool
 * fetched that one record on purpose (get_data_sheet, get_product) and false when it
 * came back as one of several search results.
 */
export type SourceCandidate = { source: ChatSource; direct: boolean };

export function dataSheetSource(sheet: Omit<DocumentText, 'text' | 'title'>): ChatSource {
  return {
    kind: 'datasheet',
    sku: sheet.sku,
    productName: sheet.productName,
    documentNumber: sheet.documentNumber,
    revision: sheet.revision,
    issueDate: sheet.issueDate,
    url: documentUrl(sheet.documentNumber),
  };
}

/**
 * `dataSheet` is the reference of the product's current data sheet, from
 * `DocumentsService.getCurrentReferences`, when it has one. It is attached as the document
 * of record; the source stays a catalogue source because that is where the answer was read.
 */
export function catalogueSource(
  product: { sku: string; name: string },
  dataSheet?: DocumentReference,
): ChatSource {
  const source: ChatSource = { kind: 'catalogue', sku: product.sku, productName: product.name };
  if (dataSheet) {
    source.dataSheet = {
      documentNumber: dataSheet.documentNumber,
      revision: dataSheet.revision,
      issueDate: dataSheet.issueDate,
      url: documentUrl(dataSheet.documentNumber),
    };
  }
  return source;
}

// No revision in the link: the endpoint serves whatever is current when it is opened.
function documentUrl(documentNumber: string): string {
  return `/api/documents/${encodeURIComponent(documentNumber)}/file`;
}

/**
 * Picks the sources shown under an answer. The model's text only decides WHICH of the
 * records the tools returned are shown; every field of a source comes from the tool
 * result, so a document or revision the model made up can never appear.
 *
 * 1. A candidate counts when the answer mentions it (case-insensitive): a data sheet by
 *    its document number, its product's SKU or its product's exact name; a catalogue
 *    product by its SKU or exact name.
 * 2. If nothing is mentioned, the directly fetched records count (`direct`), in the
 *    order they were fetched. Search results alone then give no source.
 * 3. A catalogue product that only turned up in a search is dropped when the data sheet
 *    of the same product is a source: the search was then the way to find the SKU, and
 *    the product's name in the answer refers to the sheet. One fetched with get_product stays.
 *    That product keeps its `dataSheet` reference even though the same sheet is listed too.
 * 4. Duplicates are dropped, data sheets come before catalogue products, each group in
 *    order of first mention, and the list is cut at MAX_SOURCES.
 */
export function selectSources(answer: string, candidates: SourceCandidate[]): ChatSource[] {
  const text = answer.toLowerCase();
  const unique = new Map<string, SourceCandidate & { mentionedAt: number }>();
  for (const candidate of candidates) {
    const { source } = candidate;
    const key = source.kind === 'datasheet' ? `d:${source.documentNumber}` : `c:${source.sku}`;
    const earlier = unique.get(key);
    if (earlier) {
      earlier.direct ||= candidate.direct;
      continue;
    }
    const names = [source.sku, source.productName];
    if (source.kind === 'datasheet') names.push(source.documentNumber);
    const positions = names.map((name) => text.indexOf(name.toLowerCase())).filter((at) => at >= 0);
    unique.set(key, { ...candidate, mentionedAt: positions.length > 0 ? Math.min(...positions) : -1 });
  }

  const all = [...unique.values()];
  let chosen = all.filter((candidate) => candidate.mentionedAt >= 0);
  if (chosen.length > 0) {
    chosen.sort((a, b) => a.mentionedAt - b.mentionedAt);
  } else {
    chosen = all.filter((candidate) => candidate.direct);
  }
  const sheetSkus = new Set(
    chosen.filter(({ source }) => source.kind === 'datasheet').map(({ source }) => source.sku),
  );
  // Array.sort is stable, so each kind keeps the order established above.
  return chosen
    .filter(({ source, direct }) => source.kind === 'datasheet' || direct || !sheetSkus.has(source.sku))
    .map((candidate) => candidate.source)
    .sort((a, b) => Number(a.kind !== 'datasheet') - Number(b.kind !== 'datasheet'))
    .slice(0, MAX_SOURCES);
}
