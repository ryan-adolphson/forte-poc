import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { validateEnv } from '../src/config/app.config.js';
import { hiddenSkus } from '../src/prisma/seed-data.js';
import { createApp, parseEvents } from './chat-app.js';
import { fakeGemini, functionCallTurn, textTurn } from './fake-gemini.js';
import { signIn } from './sign-in.js';

// No test here calls a real model, and none reads or writes the shared assistant-setting
// row: `createApp` gives an in-memory setting with nothing saved, so every turn uses the
// server default (Gemini with GEMINI_MODEL). The Settings endpoints, and chat turns under
// a saved setting (Claude included), are tested in settings.e2e-spec.ts.
const MODEL = validateEnv(process.env).geminiModel;

describe('POST /api/chat/stream', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(
    functionCallTurn('v1_a', [{ id: 'call_1', name: 'get_product', argumentsJson: '{"sku":"FRT-CON-C3240"}' }]),
    textTurn('v1_b', ['C32/40 has ', '40 MPa.']),
  );

  beforeAll(async () => {
    app = await createApp(gemini);
  });

  afterAll(async () => {
    await app.close();
  });

  it('streams the contract events in order, with the tool reading the seeded database', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/chat/stream')
      .set('Cookie', signIn(app))
      .send({ message: '  What is the cube strength of C32/40?  ' })
      .expect(200)
      .expect('Content-Type', /^text\/event-stream/)
      .expect('X-Accel-Buffering', 'no');

    expect(parseEvents(response.text)).toEqual([
      { event: 'start', data: {} },
      { event: 'tool', data: { name: 'get_product', status: 'started' } },
      { event: 'tool', data: { name: 'get_product', status: 'finished' } },
      { event: 'text', data: { delta: 'C32/40 has ' } },
      { event: 'text', data: { delta: '40 MPa.' } },
      {
        event: 'done',
        data: {
          interactionId: `${MODEL}:v1_b`,
          usage: { inputTokens: 14, outputTokens: 24, totalTokens: 38 },
          // A catalogue answer for a product that has a data sheet: the one source is that
          // data sheet at its current revision, and there is no catalogue source
          // (needs the ingested data sheets: `npm run db:ingest-docs -w api`).
          sources: [
            {
              kind: 'datasheet',
              sku: 'FRT-CON-C3240',
              productName: 'Ready-Mix Concrete C32/40',
              documentNumber: 'DS-FRT-CON-C3240',
              revision: 'C',
              issueDate: '2026-01-19',
              url: '/api/documents/DS-FRT-CON-C3240/file',
            },
          ],
          provider: 'gemini',
          model: MODEL,
        },
      },
    ]);

    expect(gemini.requests[0]!.model).toBe(MODEL);
    expect(gemini.requests[0]!.input).toBe('What is the cube strength of C32/40?');
    // The function result sent back to the model came from the real ProductsService, with
    // the reference from the real DocumentsService: the current revision, and no sheet text.
    const [functionResult] = gemini.requests[1]!.input as { result: { text: string }[] }[];
    const given = JSON.parse(functionResult!.result[0]!.text) as { product: Record<string, unknown> };
    expect(given.product).toMatchObject({
      name: 'Ready-Mix Concrete C32/40',
      dataSheet: { documentNumber: 'DS-FRT-CON-C3240', revision: 'C', issueDate: '2026-01-19' },
    });
    expect(Object.keys(given.product.dataSheet as object)).toHaveLength(3);
    // No raw provider event reaches the client.
    expect(response.text).not.toMatch(/event_type|step\.delta|interaction\./);
  });

  it.each([
    ['an empty message', { message: '' }],
    ['a blank message', { message: '   ' }],
    ['an over-long message', { message: 'x'.repeat(2001) }],
    ['a missing message', {}],
    ['an over-long previousInteractionId', { message: 'hi', previousInteractionId: 'x'.repeat(201) }],
    ['an unknown property', { message: 'hi', model: 'other' }],
    ['an over-long productSku', { message: 'hi', productSku: 'x'.repeat(65) }],
    ['an empty productSku', { message: 'hi', productSku: '' }],
    // The provider and model are the server-wide setting now, never part of the request.
    ['a provider field', { message: 'hi', provider: 'claude' }],
  ])('rejects %s with 400 and does not call the model', async (_case, body) => {
    const callsBefore = gemini.requests.length;

    const response = await request(app.getHttpServer()).post('/api/chat/stream').set('Cookie', signIn(app)).send(body).expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(gemini.requests).toHaveLength(callsBefore);
  });
});

describe('POST /api/chat/stream with productSku', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(textTurn('v1_a', ['ok']));
  const DONE = {
    event: 'done',
    data: { interactionId: `${MODEL}:v1_a`, usage: expect.any(Object) as unknown, sources: [], provider: 'gemini', model: MODEL },
  };

  beforeAll(async () => {
    app = await createApp(gemini);
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (body: object) => request(app.getHttpServer()).post('/api/chat/stream').set('Cookie', signIn(app)).send(body).expect(200);

  it('gives the model the viewed product, named from the database row', async () => {
    const response = await send({ message: 'What is its compressive strength?', productSku: ' frt-con-c3240 ' });

    expect(parseEvents(response.text).at(-1)).toEqual(DONE);
    expect(gemini.requests.at(-1)!.input).toBe(
      '[Context from the product page: the user is viewing "Ready-Mix Concrete C32/40" (SKU FRT-CON-C3240).]' +
        '\n\nWhat is its compressive strength?',
    );
  });

  it.each([
    ['a hidden SKU', hiddenSkus[0]!],
    ['an unknown SKU', 'FRT-NOPE-0000'],
  ])('answers %s exactly like a message with no productSku', async (_case, productSku) => {
    const plain = await send({ message: 'What is this product?' });
    const plainRequest = gemini.requests.at(-1)!;
    const response = await send({ message: 'What is this product?', productSku });

    expect(response.text).toBe(plain.text);
    expect(gemini.requests.at(-1)).toEqual(plainRequest);
    expect(gemini.requests.at(-1)!.input).toBe('What is this product?');
    expect(JSON.stringify(gemini.requests.at(-1))).not.toMatch(/Heritage|H28/);
  });
});

// Needs the data sheets in the dev database: `npm run db:ingest-docs -w api`. Read-only.
describe('POST /api/chat/stream with data sheets', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  const ask = async (gemini: ReturnType<typeof fakeGemini>, message: string) => {
    app = await createApp(gemini);
    const response = await request(app.getHttpServer()).post('/api/chat/stream').set('Cookie', signIn(app)).send({ message }).expect(200);
    return parseEvents(response.text);
  };

  it('reads the current revision through get_data_sheet and cites it in done', async () => {
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [{ id: 'call_1', name: 'get_data_sheet', argumentsJson: '{"sku":"FRT-CON-C3240"}' }]),
      textTurn('v1_b', ['Cure for at least 7 days ', '(data sheet DS-FRT-CON-C3240, Rev C, issued 2026-01-19).']),
    );

    const events = await ask(gemini, 'How should the C32/40 concrete be cured?');

    // What the model was given: the Rev C sheet from the real DocumentsService.
    const [functionResult] = gemini.requests[1]!.input as { result: { text: string }[] }[];
    const given = JSON.parse(functionResult!.result[0]!.text) as { found: boolean; dataSheet: Record<string, string> };
    expect(given.found).toBe(true);
    expect(given.dataSheet).toMatchObject({
      documentNumber: 'DS-FRT-CON-C3240',
      revision: 'C',
      issueDate: '2026-01-19',
      sku: 'FRT-CON-C3240',
      productName: 'Ready-Mix Concrete C32/40',
    });
    const text = given.dataSheet.text!;
    expect(text).toContain('Density 2380 kg/m³ EN 12390-7');
    expect(text).toContain('cure for at least 7 days');
    expect(text).toContain('Exposure class XC4, XD1 EN 206');
    // Rev A's values are not the stated ones: no property row carries them.
    expect(text).not.toContain('Exposure class XC3, XC4');
    expect(text).not.toMatch(/Density 2400/);
    expect(text).not.toMatch(/Revision [AB]\b/);

    expect(events.map((event) => event.event)).toEqual(['start', 'tool', 'tool', 'text', 'text', 'done']);
    expect(events.at(-1)!.data).toMatchObject({
      sources: [
        {
          kind: 'datasheet',
          sku: 'FRT-CON-C3240',
          productName: 'Ready-Mix Concrete C32/40',
          documentNumber: 'DS-FRT-CON-C3240',
          revision: 'C',
          issueDate: '2026-01-19',
          url: '/api/documents/DS-FRT-CON-C3240/file',
        },
      ],
    });
    // The cited link serves a PDF.
    await request(app.getHttpServer())
      .get('/api/documents/DS-FRT-CON-C3240/file')
      .set('Cookie', signIn(app))
      .expect(200)
      .expect('Content-Type', 'application/pdf');
  });

  it("treats a hidden product's data sheet like one that does not exist, with no sources", async () => {
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [
        { id: 'call_1', name: 'get_data_sheet', argumentsJson: JSON.stringify({ sku: hiddenSkus[0] }) },
        { id: 'call_2', name: 'get_data_sheet', argumentsJson: '{"sku":"FRT-NOPE-0000"}' },
        { id: 'call_3', name: 'search_data_sheets', argumentsJson: '{"query":"Heritage"}' },
      ]),
      textTurn('v1_b', ['I do not have that information.']),
    );

    const events = await ask(gemini, 'What does the data sheet of Heritage Mix H28 say?');

    const results = (gemini.requests[1]!.input as { result: { text: string }[] }[]).map(
      (step) => step.result[0]!.text,
    );
    expect(results).toEqual(['{"found":false}', '{"found":false}', '{"count":0,"dataSheets":[]}']);
    expect(events.at(-1)!.data).toMatchObject({ sources: [] });
  });
});

describe('POST /api/chat/stream rate limit', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(textTurn('v1_a', ['ok']));

  beforeAll(async () => {
    app = await createApp(gemini, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the third request in the window with 429, Retry-After and ChatErrorBody', async () => {
    const send = () => request(app.getHttpServer()).post('/api/chat/stream').set('Cookie', signIn(app)).send({ message: 'hi' });

    await send().expect(200);
    await send().expect(200);
    const limited = await send().expect(429);

    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(limited.body).toEqual({ code: 'rate_limited', message: expect.any(String) });
    expect(gemini.requests).toHaveLength(2);
  });
});
