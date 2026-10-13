import { DOCUMENTS } from '../testing/documents';
import { filterDocuments } from './filter-documents';

describe('filterDocuments', () => {
  const numbers = (query: string) => filterDocuments(DOCUMENTS, query).map((d) => d.documentNumber);

  it('returns every document for an empty or blank query', () => {
    expect(filterDocuments(DOCUMENTS, '')).toEqual(DOCUMENTS);
    expect(filterDocuments(DOCUMENTS, '   ')).toEqual(DOCUMENTS);
  });

  it('matches the product name, document number, SKU and title, in any letter case', () => {
    expect(numbers('pir')).toEqual(['DS-FRT-INS-PIR100']);
    expect(numbers('ds-frt-con')).toEqual(['DS-FRT-CON-C3240']);
    expect(numbers('FRT-INS-MW100')).toEqual(['DS-FRT-INS-MW100']);
    expect(numbers('data sheet')).toHaveLength(3);
  });

  it('matches the category label', () => {
    expect(numbers('Insulation')).toEqual(['DS-FRT-INS-PIR100', 'DS-FRT-INS-MW100']);
  });

  it('needs every word, in any order', () => {
    expect(numbers('100 wool')).toEqual(['DS-FRT-INS-MW100']);
    expect(numbers('concrete pir')).toEqual([]);
  });

  it('does not search the revision or the date', () => {
    expect(numbers('2026-01-19')).toEqual([]);
  });
});
