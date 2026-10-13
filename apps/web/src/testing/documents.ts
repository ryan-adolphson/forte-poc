import type { DocumentSummary } from '@forte/chat-contract';

/**
 * Three current data sheets in two categories, in the order the API sends them. The first has
 * three revisions, the others one.
 */
export const DOCUMENTS: DocumentSummary[] = [
  {
    documentNumber: 'DS-FRT-CON-C3240',
    revision: 'C',
    issueDate: '2026-01-19',
    url: '/api/documents/DS-FRT-CON-C3240/file',
    title: 'Ready-Mix Concrete C32/40 - Product data sheet',
    sku: 'FRT-CON-C3240',
    productName: 'Ready-Mix Concrete C32/40',
    category: 'concrete',
    revisionCount: 3,
  },
  {
    documentNumber: 'DS-FRT-INS-PIR100',
    revision: 'A',
    issueDate: '2025-06-02',
    url: '/api/documents/DS-FRT-INS-PIR100/file',
    title: 'PIR Insulation Board 100 mm - Product data sheet',
    sku: 'FRT-INS-PIR100',
    productName: 'PIR Insulation Board 100 mm',
    category: 'insulation',
    revisionCount: 1,
  },
  {
    documentNumber: 'DS-FRT-INS-MW100',
    revision: 'B',
    issueDate: '2025-11-03',
    url: 'https://example.com/DS-FRT-INS-MW100.pdf',
    title: 'Mineral Wool Slab 100 mm - Product data sheet',
    sku: 'FRT-INS-MW100',
    productName: 'Mineral Wool Slab 100 mm',
    category: 'insulation',
    revisionCount: 1,
  },
];
