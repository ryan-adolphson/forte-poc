import type { ChatSource } from '@forte/chat-contract';
import {
  catalogueSource,
  dataSheetSource,
  MAX_SOURCES,
  selectSources,
  type CandidateSource,
  type SourceCandidate,
} from './sources.js';

const sheet = (code: string, productName: string, revision = 'A'): ChatSource =>
  dataSheetSource({
    documentNumber: `DS-FRT-${code}`,
    revision,
    issueDate: '2026-01-19',
    sku: `FRT-${code}`,
    productName,
  });
/** A catalogue entry of a product that has no data sheet. */
const product = (code: string, name: string): CandidateSource => catalogueSource({ sku: `FRT-${code}`, name });
/** The catalogue entry of the product this data sheet belongs to, carrying its reference. */
const productOf = (of: ChatSource): CandidateSource => {
  if (of.kind !== 'datasheet') throw new Error('not a data sheet');
  return catalogueSource({ sku: of.sku, name: of.productName }, of);
};

const concreteSheet = sheet('CON-C3240', 'Ready-Mix Concrete C32/40', 'C');
const pirSheet = sheet('INS-PIR080', 'PIR Insulation Board 80 mm', 'C');
const concrete = productOf(concreteSheet);
const pir = productOf(pirSheet);
// Two products without a data sheet.
const mortar = product('CEM-M12', 'Masonry Mortar M12');
const glulam = product('TIM-GL28H', 'Glulam Beam GL28h 140 x 405');

const direct = (source: CandidateSource): SourceCandidate => ({ source, direct: true });
const searched = (source: CandidateSource): SourceCandidate => ({ source, direct: false });

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

  it('has no sources for a decline, even after a search', () => {
    expect(selectSources('I can only help with Forte products.', [searched(concrete), searched(glulam)])).toEqual([]);
  });

  describe('one source per product: its data sheet when it has one', () => {
    it('shows the data sheet once when get_product and get_data_sheet both ran for one product', () => {
      const candidates = [direct(concrete), direct(concreteSheet)];
      const answer =
        'Ready-Mix Concrete C32/40 (FRT-CON-C3240): 40 MPa (catalogue; data sheet DS-FRT-CON-C3240, Rev C, ' +
        'issued 2026-01-19). Cure for 7 days (data sheet DS-FRT-CON-C3240, Rev C, issued 2026-01-19).';

      expect(selectSources(answer, candidates)).toEqual([concreteSheet]);
      // The same through the fallback, and whichever tool ran first.
      expect(selectSources('40 MPa. Cure for 7 days.', candidates)).toEqual([concreteSheet]);
      expect(selectSources(answer, [direct(concreteSheet), direct(concrete)])).toEqual([concreteSheet]);
    });

    it('shows a catalogue-only answer as the data sheet of the product, with no catalogue source', () => {
      expect(selectSources('FRT-CON-C3240: 40 MPa.', [direct(concrete)])).toEqual([concreteSheet]);
      expect(selectSources('40 MPa.', [direct(concrete)])).toEqual([concreteSheet]);
      expect(selectSources('FRT-CON-C3240: 40 MPa.', [searched(concrete), searched(pir)])).toEqual([concreteSheet]);
    });

    it('shows a product without a data sheet as a catalogue source', () => {
      const expected = { kind: 'catalogue', sku: 'FRT-TIM-GL28H', productName: 'Glulam Beam GL28h 140 x 405' };

      expect(selectSources('FRT-TIM-GL28H is timber.', [searched(glulam)])).toEqual([expected]);
      expect(selectSources('It is timber.', [direct(glulam)])).toEqual([expected]);
    });

    it('mixes both: data sheets first, then the products without one', () => {
      const candidates = [searched(glulam), searched(concrete), searched(pir)];
      const answer = 'FRT-TIM-GL28H is timber, FRT-INS-PIR080 is insulation, FRT-CON-C3240 is concrete.';

      expect(selectSources(answer, candidates)).toEqual([pirSheet, concreteSheet, glulam]);
    });

    it('keeps two catalogue products that share nothing as two sources', () => {
      expect(selectSources('Nothing named.', [direct(glulam), direct(mortar)])).toEqual([glulam, mortar]);
      expect(selectSources('Nothing named.', [direct(concrete), direct(pir)])).toEqual([concreteSheet, pirSheet]);
    });

    it('keeps the first position when a data sheet turns up twice', () => {
      // Concrete is named first (as a catalogue entry), its sheet again after the PIR board.
      const answer = 'FRT-CON-C3240: 40 MPa. FRT-INS-PIR080: store flat. See DS-FRT-CON-C3240.';

      expect(selectSources(answer, [direct(pir), direct(concreteSheet), direct(concrete)])).toEqual([
        concreteSheet,
        pirSheet,
      ]);
      expect(selectSources('Nothing named.', [direct(concrete), direct(pir), direct(concreteSheet)])).toEqual([
        concreteSheet,
        pirSheet,
      ]);
    });

    it('drops the catalogue line of a product whose data sheet is a source, even without a reference on it', () => {
      const bare = product('CON-C3240', 'Ready-Mix Concrete C32/40');

      expect(selectSources('Nothing named.', [direct(bare), direct(concreteSheet)])).toEqual([concreteSheet]);
    });

    it('never sends the dataSheet field', () => {
      const sources = selectSources('Nothing named.', [direct(concrete), direct(glulam)]);

      expect(sources).toHaveLength(2);
      for (const source of sources) expect(source).not.toHaveProperty('dataSheet');
    });
  });

  it('keeps the searched records the answer mentions and drops the rest', () => {
    const candidates = [searched(concrete), searched(pir), searched(glulam)];

    expect(selectSources('The PIR Insulation Board 80 mm has 0.022 W/m·K.', candidates)).toEqual([pirSheet]);
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
    const candidates = [searched(pir), direct(glulam), direct(concreteSheet), searched(pirSheet)];

    expect(selectSources('It must cure for at least 7 days.', candidates)).toEqual([concreteSheet, glulam]);
  });

  it('gives no source for search results alone when the answer names none of them', () => {
    expect(selectSources('I do not have that information.', [searched(concrete), searched(pirSheet)])).toEqual([]);
  });

  it('does not use the fallback once anything is mentioned', () => {
    const candidates = [direct(concrete), searched(glulam)];

    expect(selectSources('Glulam Beam GL28h 140 x 405 (FRT-TIM-GL28H).', candidates)).toEqual([glulam]);
  });

  it('drops duplicates from repeated lookups, and a repeat fetched on purpose still counts for the fallback', () => {
    const candidates = [searched(glulam), direct(glulam), searched(concreteSheet), direct(concreteSheet)];

    expect(selectSources('FRT-CON-C3240 and FRT-TIM-GL28H.', candidates)).toEqual([concreteSheet, glulam]);
    expect(selectSources('2380 kg/m³.', candidates)).toEqual([concreteSheet, glulam]);
  });

  it('orders data sheets first, then catalogue products, each by first mention', () => {
    const candidates = [direct(mortar), direct(concrete), direct(pirSheet), searched(glulam)];
    const answer =
      'Glulam Beam GL28h 140 x 405 is timber. FRT-INS-PIR080: store flat (data sheet DS-FRT-INS-PIR080, Rev C). ' +
      'FRT-CON-C3240: 40 MPa. FRT-CEM-M12 is mortar.';

    expect(selectSources(answer, candidates)).toEqual([pirSheet, concreteSheet, glulam, mortar]);
  });

  it('takes every field from the tool result, not from what the answer claims', () => {
    const wrong = '(data sheet DS-FRT-CON-C3240, Rev A, issued 2024-03-11)';

    expect(selectSources(wrong, [direct(concreteSheet)])).toEqual([concreteSheet]);
    // The same for the reference a catalogue entry carries.
    expect(selectSources(`FRT-CON-C3240 (catalogue; ${wrong})`, [searched(concrete)])).toEqual([concreteSheet]);
  });

  it(`caps the list at ${MAX_SOURCES}`, () => {
    const many = Array.from({ length: 12 }, (_unused, i) => direct(product(`X-${i}`, `Product ${i}`)));
    const sheets = Array.from({ length: 12 }, (_unused, i) => direct(productOf(sheet(`Y-${i}`, `Sheeted ${i}`))));

    const selected = selectSources('Nothing named.', many);

    expect(selected).toHaveLength(MAX_SOURCES);
    expect(selected[0]).toEqual(many[0]!.source);
    expect(selectSources('Nothing named.', sheets)).toHaveLength(MAX_SOURCES);
    expect(selectSources('Nothing named.', [...many, ...sheets]).every((source) => source.kind === 'datasheet')).toBe(true);
  });

  it('is deterministic and does not change its input', () => {
    const candidates = [direct(concrete), searched(pirSheet)];
    const copy = structuredClone(candidates);

    expect(selectSources('FRT-INS-PIR080', candidates)).toEqual(selectSources('FRT-INS-PIR080', candidates));
    expect(selectSources('Nothing named.', candidates)).toEqual([concreteSheet]);
    expect(candidates).toEqual(copy);
  });
});
