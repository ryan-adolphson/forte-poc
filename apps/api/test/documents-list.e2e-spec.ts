import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { DocumentListResponse, ProductListResponse } from '@forte/chat-contract';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { hiddenSkus } from '../src/prisma/seed-data.js';

/**
 * Read-only, against the dev database after `npm run db:ingest-docs -w api`.
 *
 * documents.e2e-spec.ts runs at the same time and briefly stores fake documents numbered
 * `TEST-DS-…` (some of them current, on FRT-MAS-AAC100). They are filtered out here, and
 * nothing is asserted about the order of that SKU's entry.
 */
const SWAPPED_SKU = 'FRT-MAS-AAC100';

describe('GET /api/documents', () => {
  let app: INestApplication<App>;
  let headers: Record<string, string>;
  let documents: DocumentListResponse['documents'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const response = await request(app.getHttpServer()).get('/api/documents').expect(200);
    headers = response.headers;
    expect(Object.keys(response.body as object)).toEqual(['documents']);
    documents = (response.body as DocumentListResponse).documents.filter(
      (document) => !document.documentNumber.startsWith('TEST-DS-'),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers JSON that must not be cached', () => {
    expect(headers['content-type']).toMatch(/application\/json/);
    expect(headers['cache-control']).toBe('no-store');
  });

  it('lists each of the 19 current documents once, and no hidden product', () => {
    expect(documents).toHaveLength(19);
    expect(new Set(documents.map((document) => document.documentNumber)).size).toBe(19);
    expect(new Set(documents.map((document) => document.sku)).size).toBe(19);
    for (const sku of hiddenSkus) {
      expect(documents.map((document) => document.sku)).not.toContain(sku);
    }
  });

  it.each([
    ['DS-FRT-CON-C3240', 'FRT-CON-C3240', '2026-01-19'],
    ['DS-FRT-INS-PIR080', 'FRT-INS-PIR080', '2026-03-02'],
  ])('lists %s once, at revision C and never A or B', (documentNumber, sku, issueDate) => {
    const entries = documents.filter((document) => document.documentNumber === documentNumber);

    expect(entries).toEqual([
      {
        documentNumber,
        revision: 'C',
        issueDate,
        title: expect.any(String),
        sku,
        productName: expect.any(String),
        category: expect.any(String),
        revisionCount: 3,
        url: `/api/documents/${documentNumber}/file`,
      },
    ]);
  });

  it('counts every stored revision: 3 for the two revised sheets, 1 for the others', () => {
    const multiRevision = ['DS-FRT-CON-C3240', 'DS-FRT-INS-PIR080'];
    // The swapped SKU's entry may be a fake of documents.e2e-spec.ts, or the real one.
    const listed = documents.filter((document) => document.sku !== SWAPPED_SKU);

    expect(listed.filter((document) => document.revisionCount === 3).map((d) => d.documentNumber)).toEqual(
      expect.arrayContaining(multiRevision),
    );
    for (const document of listed) {
      expect(Number.isInteger(document.revisionCount)).toBe(true);
      expect(document.revisionCount).toBeGreaterThan(0);
      expect(document.revisionCount).toBe(multiRevision.includes(document.documentNumber) ? 3 : 1);
    }
  });

  it('gives every item exactly the keys of the contract, with a link to its PDF', async () => {
    for (const document of documents) {
      expect(Object.keys(document).sort()).toEqual([
        'category',
        'documentNumber',
        'issueDate',
        'productName',
        'revision',
        'revisionCount',
        'sku',
        'title',
        'url',
      ]);
      expect(document.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(document.url).toBe(`/api/documents/${document.documentNumber}/file`);
    }

    const linked = documents.find((document) => document.documentNumber === 'DS-FRT-INS-PIR080')!;
    const file = await request(app.getHttpServer()).get(linked.url).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
  });

  it('is ordered by category, then product name', async () => {
    const listed = documents.filter((document) => document.sku !== SWAPPED_SKU);

    const categories = listed.map((document) => document.category);
    expect(categories).toEqual(categories.toSorted());

    // The product list is ordered the same way by the same database, so there is no
    // need to imitate its collation here. Every visible product has one data sheet.
    const response = await request(app.getHttpServer()).get('/api/products').expect(200);
    const products = (response.body as ProductListResponse).products.filter(
      (product) => product.sku !== SWAPPED_SKU,
    );
    expect(listed.map(({ sku, productName, category }) => ({ sku, productName, category }))).toEqual(
      products.map(({ sku, name, category }) => ({ sku, productName: name, category })),
    );
  });
});
