import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { GEMINI_STREAM } from '../src/chat/gemini.js';
import { appConfig, validateEnv } from '../src/config/app.config.js';
import { configureApp } from '../src/configure-app.js';
import { hiddenSkus } from '../src/prisma/seed-data.js';
import { fakeGemini, functionCallTurn, textTurn } from './fake-gemini.js';

// The Gemini seam is replaced by a fake, so no test here calls the real model.
async function createApp(gemini: ReturnType<typeof fakeGemini>, chatRateLimit?: number) {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GEMINI_STREAM)
    .useValue(gemini.stream);
  if (chatRateLimit !== undefined) {
    // AppModule's ConfigModule has already loaded .env into process.env.
    builder.overrideProvider(appConfig.KEY).useValue({ ...validateEnv(process.env), chatRateLimit });
  }
  const app: INestApplication<App> = (await builder.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Parses an SSE body into `{ event, data }` pairs. */
function parseEvents(body: string) {
  return body
    .trim()
    .split('\n\n')
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n');
      return {
        event: eventLine!.replace(/^event: /, ''),
        data: JSON.parse(dataLine!.replace(/^data: /, '')) as unknown,
      };
    });
}

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
        data: { interactionId: 'v1_b', usage: { inputTokens: 14, outputTokens: 24, totalTokens: 38 } },
      },
    ]);

    expect(gemini.requests[0]!.input).toBe('What is the cube strength of C32/40?');
    // The function result sent back to the model came from the real ProductsService.
    expect(JSON.stringify(gemini.requests[1]!.input)).toContain('Ready-Mix Concrete C32/40');
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
  ])('rejects %s with 400 and does not call the model', async (_case, body) => {
    const callsBefore = gemini.requests.length;

    const response = await request(app.getHttpServer()).post('/api/chat/stream').send(body).expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(gemini.requests).toHaveLength(callsBefore);
  });
});

describe('POST /api/chat/stream with productSku', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(textTurn('v1_a', ['ok']));
  const DONE = { event: 'done', data: { interactionId: 'v1_a', usage: expect.any(Object) as unknown } };

  beforeAll(async () => {
    app = await createApp(gemini);
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (body: object) => request(app.getHttpServer()).post('/api/chat/stream').send(body).expect(200);

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
    const send = () => request(app.getHttpServer()).post('/api/chat/stream').send({ message: 'hi' });

    await send().expect(200);
    await send().expect(200);
    const limited = await send().expect(429);

    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(limited.body).toEqual({ code: 'rate_limited', message: expect.any(String) });
    expect(gemini.requests).toHaveLength(2);
  });
});
