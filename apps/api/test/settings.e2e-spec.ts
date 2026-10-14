import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { ALLOWED_MODELS } from '../src/chat/models.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SettingsService } from '../src/settings/settings.service.js';
import { createApp, parseEvents } from './chat-app.js';
import { claudeTextTurn, claudeToolTurn, fakeClaude } from './fake-claude.js';
import { fakeGemini, textTurn } from './fake-gemini.js';
import { signIn } from './sign-in.js';

type Row = { id: number; provider: string; model: string; updatedAt: string };

// Against the dev database. `assistant_settings` holds one shared row. Every e2e test that
// reads or writes it is in THIS file: vitest runs the files in parallel but the tests of one
// file in order, so nothing else races these tests for the row (chat.e2e-spec.ts uses an
// in-memory setting). The row is saved before the first test and restored exactly after
// the last one (or deleted if there was none), even when a test fails.
let rowModule: TestingModule;
let prisma: PrismaService;
let saved: Row | null = null;

const table = () => prisma.db.orm.public.AssistantSetting;
const clearRow = () => table().where({ id: 1 }).deleteAll();

beforeAll(async () => {
  rowModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  prisma = rowModule.get(PrismaService);
  saved = await table().select('id', 'provider', 'model', 'updatedAt').first();
});

afterAll(async () => {
  try {
    await clearRow();
    if (saved !== null) {
      await table().create(saved);
      const restored = await table().select('id', 'provider', 'model', 'updatedAt').first();
      expect(restored).toEqual(saved);
    }
  } finally {
    await rowModule.close();
  }
});

describe('SettingsService', () => {
  let settings: SettingsService;

  beforeAll(() => {
    settings = rowModule.get(SettingsService);
  });

  it('returns null when the setting was never saved', async () => {
    await clearRow();

    expect(await settings.getAssistant()).toBeNull();
  });

  it('saves the setting and reads it back with a recent ISO timestamp', async () => {
    const before = Date.now();
    const result = await settings.setAssistant({ provider: 'claude', model: 'claude-sonnet-5-5' });

    expect(result).toEqual({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    expect(Math.abs(Date.parse(result.updatedAt) - before)).toBeLessThan(60_000);
    expect(await settings.getAssistant()).toEqual(result);
  });

  it('overwrites the one row on a second save', async () => {
    const first = await settings.setAssistant({ provider: 'claude', model: 'claude-sonnet-5-5' });
    const second = await settings.setAssistant({ provider: 'gemini', model: 'gemini-test-model' });

    expect(second).toMatchObject({ provider: 'gemini', model: 'gemini-test-model' });
    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));
    expect(await settings.getAssistant()).toEqual(second);
    expect(await table().select('id').all()).toEqual([{ id: 1 }]);
  });

  it('refuses a second row in the database', async () => {
    await settings.setAssistant({ provider: 'claude', model: 'claude-sonnet-5-5' });

    await expect(table().create({ id: 2, provider: 'gemini', model: 'x' })).rejects.toThrow();
    expect(await table().select('id').all()).toEqual([{ id: 1 }]);
  });
});

// Needs the data sheets in the dev database: `npm run db:ingest-docs -w api`.
// Four chat requests.
describe('/api/settings/assistant with both providers configured', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(textTurn('v1_a', ['first']), textTurn('v1_b', ['second']));
  const claude = fakeClaude(
    claudeToolTurn('msg_1', [{ id: 'toolu_1', name: 'get_data_sheet', argumentsJson: '{"sku":"FRT-CON-C3240"}' }]),
    claudeTextTurn('msg_2', ['Cure for at least 7 days ', '(data sheet DS-FRT-CON-C3240, Rev C, issued 2026-01-19).']),
  );

  beforeAll(async () => {
    await clearRow();
    app = await createApp(gemini, undefined, claude, { geminiModel: 'gemini-3.8-flash', claudeModel: 'claude-sonnet-5-5' }, true);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const put = (body: object) => request(server()).put('/api/settings/assistant').set('Cookie', signIn(app)).send(body);
  const chat = async (body: object) => {
    const response = await request(server()).post('/api/chat/stream').set('Cookie', signIn(app)).send(body).expect(200);
    return parseEvents(response.text);
  };

  it('is 401 when signed out, for GET and PUT', async () => {
    await request(server()).get('/api/settings/assistant').expect(401);
    await request(server()).put('/api/settings/assistant').send({ provider: 'gemini', model: 'gemini-3.8-flash' }).expect(401);
  });

  it('shows the server default while nothing is saved, and both providers as configured', async () => {
    const response = await request(server()).get('/api/settings/assistant').set('Cookie', signIn(app)).expect(200);

    expect(response.body).toEqual({
      current: { provider: 'gemini', model: 'gemini-3.8-flash' },
      options: [
        { id: 'gemini', label: 'Gemini', configured: true, models: ALLOWED_MODELS.gemini },
        { id: 'claude', label: 'Claude', configured: true, models: ALLOWED_MODELS.claude },
      ],
      updatedAt: null,
    });
  });

  it('answers the first chat turn with the default and says so in done', async () => {
    const events = await chat({ message: 'hi' });

    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: { interactionId: 'gemini-3.8-flash:v1_a', provider: 'gemini', model: 'gemini-3.8-flash' },
    });
  });

  it('saves Claude Opus 5.5, and the next turn runs on it and cites the current data sheet', async () => {
    const saved = await put({ provider: 'claude', model: 'claude-opus-5-5' }).expect(200);

    expect(saved.body).toMatchObject({ current: { provider: 'claude', model: 'claude-opus-5-5' }, updatedAt: expect.any(String) });
    const events = await chat({ message: 'How should the C32/40 concrete be cured according to the data sheet?' });

    expect(events.map((event) => event.event)).toEqual(['start', 'tool', 'tool', 'text', 'text', 'done']);
    expect(events.at(-1)!.data).toEqual({
      interactionId: expect.stringMatching(/^claude_/),
      usage: { inputTokens: 14, outputTokens: 24, totalTokens: 38 },
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
      provider: 'claude',
      model: 'claude-opus-5-5',
    });
    expect(claude.requests.map((sent) => sent.model)).toEqual(['claude-opus-5-5', 'claude-opus-5-5']);
    expect(claude.requests[0]).toMatchObject({ fallbacks: 'default' });
    // What Claude was given: the Rev C sheet from the real DocumentsService, as a tool_result.
    const results = claude.requests[1]!.messages.at(-1)!.content as { type: string; content: string }[];
    const given = JSON.parse(results[0]!.content) as { dataSheet: Record<string, string> };
    expect(given.dataSheet).toMatchObject({ documentNumber: 'DS-FRT-CON-C3240', revision: 'C' });
    expect(given.dataSheet.text).toContain('Density 2380 kg/m³ EN 12390-7');
    expect(gemini.requests).toHaveLength(1);
  });

  it('saves another Gemini model; a conversation from the previous Gemini model starts fresh on it', async () => {
    await put({ provider: 'gemini', model: 'gemini-3.5-flash-lite' }).expect(200);

    const events = await chat({ message: 'and now?', previousInteractionId: 'gemini-3.8-flash:v1_a' });

    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: { interactionId: 'gemini-3.5-flash-lite:v1_b', provider: 'gemini', model: 'gemini-3.5-flash-lite' },
    });
    expect(gemini.requests.at(-1)!.model).toBe('gemini-3.5-flash-lite');
    expect(gemini.requests.at(-1)).not.toHaveProperty('previous_interaction_id');
  });

  it.each([
    ['a model of the other provider', { provider: 'gemini', model: 'claude-opus-5-5' }],
    ['an unknown model', { provider: 'claude', model: 'claude-opus-9' }],
  ])('refuses %s with 400 invalid_setting and keeps the saved value', async (_case, body) => {
    const response = await put(body).expect(400);

    expect(response.body).toEqual({ code: 'invalid_setting', message: expect.any(String) });
    expect(await rowModule.get(SettingsService).getAssistant()).toMatchObject({ model: 'gemini-3.5-flash-lite' });
  });

  it.each([
    ['an unknown provider', { provider: 'openai', model: 'gpt' }],
    ['an empty model', { provider: 'gemini', model: '' }],
    ['an over-long model', { provider: 'gemini', model: 'x'.repeat(101) }],
    ['an extra field', { provider: 'gemini', model: 'gemini-3.8-flash', scope: 'me' }],
  ])('rejects %s with a validation 400', async (_case, body) => {
    await put(body).expect(400);
  });

  it('has no /api/chat/providers any more', async () => {
    await request(server()).get('/api/chat/providers').set('Cookie', signIn(app)).expect(404);
  });
});

// One chat request.
describe('/api/settings/assistant with Claude not configured', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(textTurn('v1_a', ['ok']));

  beforeAll(async () => {
    // A Claude value saved earlier, whose key is gone now.
    await rowModule.get(SettingsService).setAssistant({ provider: 'claude', model: 'claude-haiku-5-5' });
    // No Claude fake: the Claude seam is null, as with no ANTHROPIC_API_KEY.
    app = await createApp(gemini, undefined, undefined, { geminiModel: 'gemini-3.8-flash', anthropicApiKey: undefined }, true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows Claude as not configured and the default as current, not the unusable saved value', async () => {
    const response = await request(app.getHttpServer()).get('/api/settings/assistant').set('Cookie', signIn(app)).expect(200);

    expect(response.body).toMatchObject({
      current: { provider: 'gemini', model: 'gemini-3.8-flash' },
      options: [
        { id: 'gemini', configured: true },
        { id: 'claude', configured: false },
      ],
      updatedAt: expect.any(String),
    });
  });

  it('answers a chat turn with the default instead of failing', async () => {
    const response = await request(app.getHttpServer()).post('/api/chat/stream').set('Cookie', signIn(app)).send({ message: 'hi' }).expect(200);

    expect(parseEvents(response.text).at(-1)).toMatchObject({ event: 'done', data: { provider: 'gemini', model: 'gemini-3.8-flash' } });
  });

  it('refuses to save Claude with 400 invalid_setting', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/settings/assistant')
      .set('Cookie', signIn(app))
      .send({ provider: 'claude', model: 'claude-sonnet-5-5' })
      .expect(400);

    expect(response.body).toEqual({ code: 'invalid_setting', message: 'Claude is not configured on the server.' });
  });
});
