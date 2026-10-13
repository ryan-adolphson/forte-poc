import type { ChatSource } from '@forte/chat-contract';
import { catalogueSource, dataSheetSource, MAX_SOURCES, selectSources, type SourceCandidate } from './sources.js';

const sheet = (code: string, productName: string, revision = 'A'): ChatSource =>
  dataSheetSource({
    documentNumber: `DS-FRT-${code}`,
    revision,
    issueDate: '2026-01-19',
    sku: `FRT-${code}`,
    productName,
  });
const product = (code: string, name: string): ChatSource => catalogueSource({ sku: `FRT-${code}`, name });

const concreteSheet = sheet('CON-C3240', 'Ready-Mix Concrete C32/40', 'C');
const pirSheet = sheet('INS-PIR080', 'PIR Insulation Board 80 mm', 'C');
const concrete = product('CON-C3240', 'Ready-Mix Concrete C32/40');
const pir = product('INS-PIR080', 'PIR Insulation Board 80 mm');
const glulam = product('TIM-GL28H', 'Glulam Beam GL28h 140 x 405');

const direct = (source: ChatSource): SourceCandidate => ({ source, direct: true });
const searched = (source: ChatSource): SourceCandidate => ({ source, direct: false });

describe('dataSheetSource', () => {
  it('links to the document without a revision and carries no text', () => {
    expect(concreteSheet).toEqual({
      kind: 'datasheet',
      sku: 'FRT-CON-C3240',
      productName: 'Ready-Mix Concrete C32/40',
      documentNumber: 'DS-FRT-CON-C3240',
      revision: 'C',
      issueDate: '2026-01-19',
      url: '/api/documents/DS-FRT-CON-C3240/file',
    });
  });
});

describe('catalogueSource', () => {
  const entry = { sku: 'FRT-CON-C3240', name: 'Ready-Mix Concrete C32/40' };

  it("attaches the product's current data sheet as a reference with its link", () => {
    const reference = { documentNumber: 'DS-FRT-CON-C3240', revision: 'C', issueDate: '2026-01-19' };

    expect(catalogueSource(entry, reference)).toEqual({
      kind: 'catalogue',
      sku: 'FRT-CON-C3240',
      productName: 'Ready-Mix Concrete C32/40',
      dataSheet: { ...reference, url: '/api/documents/DS-FRT-CON-C3240/file' },
    });
  });

  it('copies only the reference fields, whatever else the object carries', () => {
    const reference = { documentNumber: 'DS-1', revision: 'B', issueDate: '2025-02-03', text: 'full text' };

    expect(catalogueSource(entry, reference)).toHaveProperty('dataSheet', {
      documentNumber: 'DS-1',
      revision: 'B',
      issueDate: '2025-02-03',
      url: '/api/documents/DS-1/file',
    });
  });

  it('has no dataSheet key when the product has no data sheet', () => {
    expect(catalogueSource(entry)).toEqual({ kind: 'catalogue', sku: 'FRT-CON-C3240', productName: 'Ready-Mix Concrete C32/40' });
    expect(catalogueSource(entry, undefined)).not.toHaveProperty('dataSheet');
  });
});

describe('selectSources', () => {
  it('has no sources when no tool returned anything, whatever the answer says', () => {
    expect(selectSources('I can only help with Forte products.', [])).toEqual([]);
    expect(selectSources('See data sheet DS-FRT-CON-C3240, Rev C.', [])).toEqual([]);
  });

  it('keeps the searched records the answer mentions and drops the rest', () => {
    const candidates = [searched(concrete), searched(pir), searched(glulam)];

    expect(selectSources('The PIR Insulation Board 80 mm has 0.022 W/m·K.', candidates)).toEqual([pir]);
    expect(selectSources('That is frt-tim-gl28h.', candidates)).toEqual([glulam]);
  });

  it('counts a data sheet by document number, by SKU or by exact product name', () => {
    const candidates = [searched(concreteSheet), searched(pirSheet)];

    expect(selectSources('(data sheet DS-FRT-INS-PIR080, Rev C)', candidates)).toEqual([pirSheet]);
    expect(selectSources('FRT-CON-C3240 cures in 7 days.', candidates)).toEqual([concreteSheet]);
    expect(selectSources('ready-mix concrete c32/40 cures in 7 days.', candidates)).toEqual([concreteSheet]);
    // A partial name is not a mention.
    expect(selectSources('The concrete cures in 7 days.', candidates)).toEqual([]);
  });

  it('falls back to the records fetched on purpose when the answer names nothing', () => {
    const candidates = [searched(pir), direct(concrete), direct(concreteSheet), searched(pirSheet)];

    expect(selectSources('It must cure for at least 7 days.', candidates)).toEqual([concreteSheet, concrete]);
  });

  it('gives no source for search results alone when the answer names none of them', () => {
    expect(selectSources('I do not have that information.', [searched(concrete), searched(pirSheet)])).toEqual([]);
  });

  it('does not use the fallback once anything is mentioned', () => {
    const candidates = [direct(concrete), searched(pir)];

    expect(selectSources('PIR Insulation Board 80 mm (FRT-INS-PIR080).', candidates)).toEqual([pir]);
  });

  it('drops duplicates from repeated lookups, and a repeat fetched on purpose still counts for the fallback', () => {
    const candidates = [searched(concreteSheet), direct(concreteSheet), direct(concrete), direct(concrete)];

    expect(selectSources('FRT-CON-C3240: 2380 kg/m³.', candidates)).toEqual([concreteSheet, concrete]);
    expect(selectSources('2380 kg/m³.', candidates)).toEqual([concreteSheet, concrete]);
  });

  it('orders data sheets first, then catalogue products, each by first mention', () => {
    const candidates = [direct(concrete), direct(pir), direct(concreteSheet), direct(pirSheet), searched(glulam)];
    const answer =
      'Glulam Beam GL28h 140 x 405 is timber. FRT-INS-PIR080: store flat (data sheet DS-FRT-INS-PIR080, Rev C). ' +
      'FRT-CON-C3240: cure 7 days (data sheet DS-FRT-CON-C3240, Rev C).';

    expect(selectSources(answer, candidates)).toEqual([pirSheet, concreteSheet, glulam, pir, concrete]);
  });

  it('drops a product that a search only helped to find when its data sheet is the source', () => {
    const answer = 'Ready-Mix Concrete C32/40 (FRT-CON-C3240): cure 7 days (data sheet DS-FRT-CON-C3240, Rev C).';

    // search_products found the SKU, get_data_sheet answered.
    expect(selectSources(answer, [searched(concrete), searched(pir), direct(concreteSheet)])).toEqual([concreteSheet]);
    // get_product was called on purpose: the catalogue entry stays.
    expect(selectSources(answer, [direct(concrete), direct(concreteSheet)])).toEqual([concreteSheet, concrete]);
    // Another product from the same search that the answer names is unaffected.
    expect(
      selectSources(`${answer} PIR Insulation Board 80 mm is insulation.`, [
        searched(concrete),
        searched(pir),
        direct(concreteSheet),
      ]),
    ).toEqual([concreteSheet, pir]);
  });

  it('keeps the data sheet reference on a fetched catalogue product even when that sheet is a source too', () => {
    const reference = { documentNumber: 'DS-FRT-CON-C3240', revision: 'C', issueDate: '2026-01-19' };
    const withSheet = catalogueSource({ sku: 'FRT-CON-C3240', name: 'Ready-Mix Concrete C32/40' }, reference);

    expect(selectSources('FRT-CON-C3240: 40 MPa.', [direct(withSheet), direct(concreteSheet)])).toEqual([
      concreteSheet,
      withSheet,
    ]);
    // A wrong revision in the answer changes nothing: the reference is the tool's.
    const [only] = selectSources('FRT-CON-C3240 (catalogue; data sheet DS-FRT-CON-C3240, Rev A)', [searched(withSheet)]);
    expect(only).toEqual(withSheet);
  });

  it('takes every field from the tool result, not from what the answer claims', () => {
    const [source] = selectSources('(data sheet DS-FRT-CON-C3240, Rev A, issued 2024-03-11)', [direct(concreteSheet)]);

    expect(source).toEqual(concreteSheet);
  });

  it(`caps the list at ${MAX_SOURCES}`, () => {
    const many = Array.from({ length: 12 }, (_unused, i) => direct(product(`X-${i}`, `Product ${i}`)));

    const selected = selectSources('Nothing named.', many);

    expect(selected).toHaveLength(MAX_SOURCES);
    expect(selected[0]).toEqual(many[0]!.source);
  });

  it('is deterministic and does not change its input', () => {
    const candidates = [direct(concrete), searched(pirSheet)];
    const copy = structuredClone(candidates);

    expect(selectSources('FRT-INS-PIR080', candidates)).toEqual(selectSources('FRT-INS-PIR080', candidates));
    expect(candidates).toEqual(copy);
  });
});
