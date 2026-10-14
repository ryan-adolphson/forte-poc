import type { ChatSource, DataSheetReference } from '@forte/chat-contract';
import type { DocumentReference, DocumentText } from '../documents/document.js';
import { documentUrl } from '../documents/document-url.js';

/** Most sources attached to one answer. */
export const MAX_SOURCES = 8;

/**
 * A source as a tool returns it. A catalogue entry also carries `dataSheet`, the reference
 * of the product's current data sheet, when it has one; `selectSources` turns it into a
 * data sheet source, so the field never leaves the server.
 */
export type CandidateSource =
  | Extract<ChatSource, { kind: 'datasheet' }>
  | (Extract<ChatSource, { kind: 'catalogue' }> & { dataSheet?: DataSheetReference });

/**
 * A record a tool handed to the model in this turn. `direct` is true when the tool
 * fetched that one record on purpose (get_data_sheet, get_product) and false when it
 * came back as one of several search results.
 */
export type SourceCandidate = { source: CandidateSource; direct: boolean };

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
 * `DocumentsService.getCurrentReferences`, when it has one.
 */
export function catalogueSource(
  product: { sku: string; name: string },
  dataSheet?: DocumentReference,
): CandidateSource {
  const source: CandidateSource = { kind: 'catalogue', sku: product.sku, productName: product.name };
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
 * 3. A product that has a current data sheet is shown as that data sheet, once, and never
 *    as a catalogue line: a chosen catalogue product with a `dataSheet` reference becomes
 *    a data sheet source, and one whose data sheet is itself a source is dropped. Only a
 *    product without a data sheet is shown as a catalogue source.
 * 4. Data sheets are de-duplicated by document number and come before catalogue products,
 *    each group in order of first mention, and the list is cut at MAX_SOURCES.
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

  // Deliberate presentation rule: an answer read from the catalogue is shown with the
  // product's current data sheet as its source, so each product has one clear source line.
  const shown = chosen.map(({ source }): ChatSource => {
    if (source.kind === 'datasheet') return source;
    const { dataSheet, ...entry } = source;
    return dataSheet ? { ...entry, ...dataSheet, kind: 'datasheet' } : entry;
  });
  const sheetSkus = new Set(shown.filter((source) => source.kind === 'datasheet').map((source) => source.sku));
  const documentNumbers = new Set<string>();
  // Array.sort is stable, so each kind keeps the order established above.
  return shown
    .filter((source) => {
      if (source.kind === 'catalogue') return !sheetSkus.has(source.sku);
      if (documentNumbers.has(source.documentNumber)) return false;
      documentNumbers.add(source.documentNumber);
      return true;
    })
    .sort((a, b) => Number(a.kind !== 'datasheet') - Number(b.kind !== 'datasheet'))
    .slice(0, MAX_SOURCES);
}
