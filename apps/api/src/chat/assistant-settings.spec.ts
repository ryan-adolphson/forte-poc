import { BadRequestException, Logger } from '@nestjs/common';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { ChatEvent } from '@forte/chat-contract';
import { claudeTextTurn, fakeClaude } from '../../test/fake-claude.js';
import { fakeGemini, textTurn } from '../../test/fake-gemini.js';
import { testResolver } from '../../test/fake-settings.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { ProductsService } from '../products/products.service.js';
import { ChatService } from './chat.service.js';
import { ClaudeConversations } from './claude-conversations.js';
import { buildClaudeRequest, claudeModel } from './claude.js';
import { continuedInteraction, geminiModel } from './gemini.js';
import { ALLOWED_MODELS, modelsFor } from './models.js';
import type { ChatModels } from './provider.js';

const gemini = () => fakeGemini(textTurn('v1_a', ['ok']));
const claude = () => fakeClaude(claudeTextTurn('msg_1', ['ok']));

function models(withGemini: boolean, withClaude: boolean): ChatModels {
  return {
    gemini: withGemini ? geminiModel(gemini().stream) : null,
    claude: withClaude ? claudeModel(claude().stream, new ClaudeConversations()) : null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ALLOWED_MODELS', () => {
  it('is the fixed list, checked against the two skills', () => {
    expect(ALLOWED_MODELS).toEqual({
      gemini: [
        { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      ],
      claude: [
        { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
        { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
        { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      ],
    });
  });

  it('adds an unlisted configured default, labelled with its id, so the override keeps working', () => {
    expect(modelsFor('gemini', 'gemini-3.8-flash')).toEqual(ALLOWED_MODELS.gemini);
    expect(modelsFor('claude', 'claude-opus-5')).toEqual([
      ...ALLOWED_MODELS.claude,
      { id: 'claude-opus-5', label: 'claude-opus-5' },
    ]);
  });
});

describe('buildClaudeRequest per model', () => {
  const messages: BetaMessageParam[] = [{ role: 'user', content: 'hi' }];

  it.each(['claude-sonnet-5-5', 'claude-opus-5-5'])('sends the "default" server-side fallback on %s', (model) => {
    const request = buildClaudeRequest({ model, messages });

    expect(request).toMatchObject({ model, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
  });

  it.each(['claude-haiku-5-5', 'claude-opus-5'])('sends no fallback and no fallback beta on %s', (model) => {
    const request = buildClaudeRequest({ model, messages });

    expect(request).not.toHaveProperty('fallbacks');
    expect(request).not.toHaveProperty('betas');
  });

  it.each(ALLOWED_MODELS.claude.map((model) => model.id))(
    'runs %s at low effort with adaptive thinking (no thinking field) and no forced tool choice',
    (model) => {
      const request = buildClaudeRequest({ model, messages });

      expect(request.output_config).toEqual({ effort: 'low' });
      expect(request).not.toHaveProperty('thinking');
      expect(request).not.toHaveProperty('tool_choice');
    },
  );
});

describe('AssistantSettingsResolver.resolve', () => {
  it('uses a saved value whose provider is configured and whose model is allowed', async () => {
    const resolver = testResolver(models(true, true), { provider: 'claude', model: 'claude-haiku-5-5' });

    expect(await resolver.resolve()).toMatchObject({
      current: { provider: 'claude', model: 'claude-haiku-5-5' },
      source: 'saved',
    });
  });

  it('falls back to the default when the saved provider has no key', async () => {
    const resolver = testResolver(models(true, false), { provider: 'claude', model: 'claude-haiku-5-5' });

    expect(await resolver.resolve()).toMatchObject({
      current: { provider: 'gemini', model: 'gemini-3.8-flash' },
      source: 'fallback',
    });
  });

  it('falls back to the default when the saved model is not allowed', async () => {
    const resolver = testResolver(models(true, true), { provider: 'gemini', model: 'gemini-2.5-flash' });

    expect(await resolver.resolve()).toMatchObject({
      current: { provider: 'gemini', model: 'gemini-3.8-flash' },
      source: 'fallback',
    });
  });

  it('uses Gemini with GEMINI_MODEL when nothing is saved', async () => {
    const resolver = testResolver(models(true, true), null, { geminiModel: 'gemini-3.5-flash-lite' });

    expect(await resolver.resolve()).toEqual({
      current: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      source: 'default',
      saved: null,
    });
  });

  it('uses Claude with CLAUDE_MODEL when only Claude is configured', async () => {
    const resolver = testResolver(models(false, true));

    expect((await resolver.resolve()).current).toEqual({ provider: 'claude', model: 'claude-sonnet-5-5' });
  });

  it('resolves to nothing when no provider is configured', async () => {
    expect((await testResolver(models(false, false)).resolve()).current).toBeNull();
  });

  it('accepts a saved operator override model that is not in the list', async () => {
    const resolver = testResolver(models(true, true), { provider: 'claude', model: 'claude-opus-5' }, {
      claudeModel: 'claude-opus-5',
    });

    expect((await resolver.resolve()).source).toBe('saved');
  });
});

describe('AssistantSettingsResolver.response and save', () => {
  it('lists both providers with configured flags, and shows the resolved value, not an unusable saved one', async () => {
    const resolver = testResolver(models(true, false), { provider: 'claude', model: 'claude-opus-5-5' });

    expect(await resolver.response()).toEqual({
      current: { provider: 'gemini', model: 'gemini-3.8-flash' },
      options: [
        { id: 'gemini', label: 'Gemini', configured: true, models: ALLOWED_MODELS.gemini },
        { id: 'claude', label: 'Claude', configured: false, models: ALLOWED_MODELS.claude },
      ],
      updatedAt: '2026-10-14T09:00:00.000Z',
    });
  });

  it('saves an allowed model of a configured provider and returns the new response', async () => {
    const resolver = testResolver(models(true, true));

    const response = await resolver.save({ provider: 'claude', model: 'claude-opus-5-5' });

    expect(response.current).toEqual({ provider: 'claude', model: 'claude-opus-5-5' });
    expect(response.updatedAt).toEqual(expect.any(String));
  });

  it.each([
    ['a model of another provider', { provider: 'gemini', model: 'claude-opus-5-5' } as const, true],
    ['an unknown model', { provider: 'claude', model: 'claude-opus-9' } as const, true],
    ['an unconfigured provider', { provider: 'claude', model: 'claude-opus-5-5' } as const, false],
  ])('refuses %s with 400 invalid_setting and saves nothing', async (_case, value, claudeConfigured) => {
    const resolver = testResolver(models(true, claudeConfigured));

    const error = await resolver.save(value).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({ code: 'invalid_setting', message: expect.any(String) });
    expect((await resolver.response()).updatedAt).toBeNull();
  });
});

describe('ChatService with the setting', () => {
  const products = { getBySku: vi.fn() } as unknown as ProductsService;
  const documents = {} as DocumentsService;

  async function turn(service: ChatService, previousInteractionId?: string): Promise<ChatEvent[]> {
    const events: ChatEvent[] = [];
    for await (const event of service.run({ message: 'hi', previousInteractionId }, new AbortController().signal)) {
      events.push(event);
    }
    return events;
  }

  it('sends the saved model and says in done which provider and model answered', async () => {
    const fake = claude();
    const chatModels = { gemini: null, claude: claudeModel(fake.stream, new ClaudeConversations()) };
    const service = new ChatService(chatModels, products, documents, testResolver(chatModels, {
      provider: 'claude',
      model: 'claude-haiku-5-5',
    }));

    const done = (await turn(service)).at(-1)!;

    expect(fake.requests[0]).toMatchObject({ model: 'claude-haiku-5-5' });
    expect(fake.requests[0]).not.toHaveProperty('fallbacks');
    expect(done).toMatchObject({ event: 'done', data: { provider: 'claude', model: 'claude-haiku-5-5' } });
  });

  it('answers with the default and logs setting=fallback when the saved provider lost its key', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const fake = gemini();
    const chatModels = { gemini: geminiModel(fake.stream), claude: null };
    const service = new ChatService(chatModels, products, documents, testResolver(chatModels, {
      provider: 'claude',
      model: 'claude-sonnet-5-5',
    }));

    const done = (await turn(service)).at(-1)!;

    expect(done).toMatchObject({ event: 'done', data: { provider: 'gemini', model: 'gemini-3.8-flash' } });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]![0])).toContain('provider=gemini model=gemini-3.8-flash setting=fallback');
  });

  it('uses the setting saved when the turn starts, so a change applies to the next turn', async () => {
    const fake = fakeGemini(textTurn('v1_a', ['ok']), textTurn('v1_b', ['ok']));
    const chatModels = { gemini: geminiModel(fake.stream), claude: null };
    const resolver = testResolver(chatModels);
    const service = new ChatService(chatModels, products, documents, resolver);

    await turn(service);
    await resolver.save({ provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    const done = (await turn(service)).at(-1)!;

    expect(fake.requests.map((request) => request.model)).toEqual(['gemini-3.8-flash', 'gemini-3.1-flash-lite']);
    expect(done.data).toMatchObject({ model: 'gemini-3.1-flash-lite' });
  });
});

describe('conversation continuity across models', () => {
  it('continues a Gemini conversation only on the model that wrote it', () => {
    expect(continuedInteraction('gemini-3.8-flash', 'gemini-3.8-flash:v1_abc')).toBe('v1_abc');
    expect(continuedInteraction('gemini-3.5-flash-lite', 'gemini-3.8-flash:v1_abc')).toBeUndefined();
    // Ids from before the model was part of the id, Claude ids, and nothing at all.
    expect(continuedInteraction('gemini-3.8-flash', 'v1_abc')).toBeUndefined();
    expect(continuedInteraction('gemini-3.8-flash', 'claude_00000000-0000-0000-0000-000000000000')).toBeUndefined();
    expect(continuedInteraction('gemini-3.8-flash', 'gemini-3.8-flash:')).toBeUndefined();
    expect(continuedInteraction('gemini-3.8-flash', undefined)).toBeUndefined();
  });

  it('starts a fresh Gemini interaction when the model changed', async () => {
    const fake = gemini();
    const turn = geminiModel(fake.stream).startTurn('gemini-3.5-flash-lite', 'gemini-3.8-flash:v1_prev');
    for await (const _event of turn.round('hi', new AbortController().signal)) {
      // drain
    }

    expect(turn.continued).toBe(false);
    expect(fake.requests[0]).not.toHaveProperty('previous_interaction_id');
    expect(fake.requests[0]!.model).toBe('gemini-3.5-flash-lite');
  });

  it('continues a Claude conversation on another Claude model, sending the history unchanged', async () => {
    const fake = fakeClaude(claudeTextTurn('msg_1', ['first']), claudeTextTurn('msg_2', ['second']));
    const model = claudeModel(fake.stream, new ClaudeConversations());
    let id: string | undefined;
    for await (const event of model.startTurn('claude-sonnet-5-5', undefined).round('one', new AbortController().signal)) {
      if (event.type === 'end' && event.end.stop === 'answered') id = event.end.conversationId;
    }

    const next = model.startTurn('claude-haiku-5-5', id);
    for await (const _event of next.round('two', new AbortController().signal)) {
      // drain
    }

    expect(next.continued).toBe(true);
    expect(fake.requests[1]!.model).toBe('claude-haiku-5-5');
    // Sonnet's thinking block goes back as received; the API drops what Haiku cannot read.
    expect(fake.requests[1]!.messages).toEqual([
      ...fake.requests[0]!.messages,
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 'sig_msg_1' },
          { type: 'text', text: 'first', citations: null },
        ],
      },
      { role: 'user', content: 'two' },
    ]);
  });

  it('starts fresh on a model without the fallback beta when the history holds a fallback marker', () => {
    const conversations = new ClaudeConversations();
    const id = conversations.save(undefined, [
      { role: 'user', content: 'one' },
      {
        role: 'assistant',
        content: [
          { type: 'fallback', from: { model: 'claude-sonnet-5-5' }, to: { model: 'claude-sonnet-5' } },
          { type: 'text', text: 'first' },
        ],
      } as unknown as BetaMessageParam,
    ]);
    const model = claudeModel(claude().stream, conversations);

    expect(model.startTurn('claude-haiku-5-5', id).continued).toBe(false);
    expect(model.startTurn('claude-opus-5-5', id).continued).toBe(true);
  });
});
