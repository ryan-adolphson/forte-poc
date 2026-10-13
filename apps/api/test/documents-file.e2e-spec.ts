import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { extractPdfText } from '../src/documents/pdf-text.js';
import { signIn } from './sign-in.js';

/**
 * Read-only, against the dev database after `npm run db:ingest-docs -w api`.
 * FRT-MAS-AAC100 is left alone: documents.e2e-spec.ts swaps its data sheet while it runs.
 */
const SAMPLES = resolve(import.meta.dirname, '../../../sample-documents/datasheets');
const sample = async (revision: string) =>
  new Uint8Array(await readFile(resolve(SAMPLES, `FRT-CON-C3240_rev-${revision}.pdf`)));

describe('GET /api/documents/:documentNumber/file', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (documentNumber: string) =>
    request(app.getHttpServer())
      .get(`/api/documents/${documentNumber}/file`)
      .set('Cookie', signIn(app))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('serves the current revision (Rev C) as an inline PDF that must not be cached', async () => {
    const response = await get('DS-FRT-CON-C3240').expect(200);
    const body = new Uint8Array(response.body as Buffer);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toBe('inline; filename="FRT-CON-C3240_rev-C.pdf"');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(response.headers['content-length'])).toBe(body.byteLength);
    expect(new TextDecoder().decode(body.slice(0, 4))).toBe('%PDF');

    // Byte for byte the Rev C sample, and neither of the superseded files.
    expect(Buffer.compare(body, await sample('C'))).toBe(0);
    expect(Buffer.compare(body, await sample('A'))).not.toBe(0);
    expect(Buffer.compare(body, await sample('B'))).not.toBe(0);

    const text = await extractPdfText(body);
    expect(text).toContain('DS-FRT-CON-C3240 · Revision C');
    expect(text).toContain('Density 2380 kg/m³ EN 12390-7');
    expect(text).toContain('Exposure class XC4, XD1 EN 206');
  });

  it.each([
    ['an unknown document number', 'DS-FRT-NOPE-0000'],
    ['a SKU instead of a document number', 'FRT-CON-C3240'],
    ['a document number with a revision appended', 'DS-FRT-CON-C3240_rev-A'],
    // A hidden product's document gives this same 404 because getCurrentFile returns null for
    // it; documents.e2e-spec.ts proves that with a document it creates for a hidden product.
  ])('answers %s with the same 404', async (_case, documentNumber) => {
    const unknown = await get('DS-NOTHING-HERE').expect(404);
    const response = await get(documentNumber).expect(404);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((response.body as Buffer).toString()).toBe((unknown.body as Buffer).toString());
  });

  it.each([
    ['characters outside the allowed set', 'DS-FRT%25'],
    ['a space', 'DS%20FRT'],
    ['more than 64 characters', 'D'.repeat(65)],
  ])('rejects %s with 400 before any lookup', async (_case, documentNumber) => {
    const response = await get(documentNumber).expect(400);

    expect((response.body as Buffer).toString()).not.toContain('%PDF');
  });
});
