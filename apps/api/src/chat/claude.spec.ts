import { Logger } from '@nestjs/common';
import { RateLimitError } from '@anthropic-ai/sdk';
import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { AssistantSettings, ChatEvent } from '@forte/chat-contract';
import { claudeTextTurn, claudeToolTurn, fakeClaude, toStream } from '../../test/fake-claude.js';
import { fakeGemini, functionCallTurn, textTurn } from '../../test/fake-gemini.js';
import { testResolver } from '../../test/fake-settings.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { ProductsService } from '../products/products.service.js';
import { ChatService, MAX_TOOL_ROUNDS } from './chat.service.js';
import { CONVERSATION_IDLE_MS, ClaudeConversations } from './claude-conversations.js';
import { claudeModel, historyContent, toClaudeTool, type ClaudeStream } from './claude.js';
import { geminiModel, type GeminiStream } from './gemini.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { chatTools } from './tools/index.js';

const product = {
  sku: 'FRT-CON-C3240',
  name: 'Ready-Mix Concrete C32/40',
  category: 'concrete',
  description: 'Structural ready-mix concrete.',
  properties: [],
};
const reference = { documentNumber: 'DS-FRT-CON-C3240', revision: 'C', issueDate: '2026-01-19' };
const dataSheet = {
  ...reference,
  title: 'Ready-Mix Concrete C32/40 - Product data sheet',
  sku: 'FRT-CON-C3240',
  productName: 'Ready-Mix Concrete C32/40',
  text: 'Handling and storage\n- Cure for at least 7 days.',
};
const DATA_SHEET_SOURCE = {
  kind: 'datasheet',
  sku: 'FRT-CON-C3240',
  productName: 'Ready-Mix Concrete C32/40',
  ...reference,
  url: '/api/documents/DS-FRT-CON-C3240/file',
};

/** The saved setting in these tests unless one says otherwise. */
const SONNET = { provider: 'claude', model: 'claude-sonnet-5-5' } as const;
/** For a Gemini turn in the same service: the per-turn override the scope eval uses. */
const GEMINI: AssistantSettings = { provider: 'gemini', model: 'gemini-3.8-flash' };

function setup(
  claude: ClaudeStream | null,
  gemini: GeminiStream | null = null,
  saved: { provider: string; model: string } | null = SONNET,
) {
  const documents = {
    getCurrentReferences: vi.fn().mockResolvedValue(new Map([[product.sku, reference]])),
    getCurrentForSku: vi.fn().mockResolvedValue(dataSheet),
    searchCurrent: vi.fn().mockResolvedValue([dataSheet]),
  };
  const products = {
    search: vi.fn().mockResolvedValue([product]),
    getBySku: vi.fn().mockResolvedValue(product),
    listCategories: vi.fn().mockResolvedValue(['concrete']),
  };
  const conversations = new ClaudeConversations();
  const models = {
    gemini: gemini && geminiModel(gemini),
    claude: claude && claudeModel(claude, conversations),
  };
  const service = new ChatService(
    models,
    products as unknown as ProductsService,
    documents as unknown as DocumentsService,
    testResolver(models, saved),
  );
  return { service, products, documents, conversations };
}

async function collect(
  service: ChatService,
  message = 'What is the strength of C32/40?',
  previousInteractionId?: string,
  override?: AssistantSettings,
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of service.run({ message, previousInteractionId }, new AbortController().signal, override)) {
    events.push(event);
  }
  return events;
}

/** The one log line of each turn. */
function logLines() {
  return vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
}

const call = (id: string, name: string, argumentsJson: string) => ({ id, name, argumentsJson });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Claude provider', () => {
  it('streams a plain answer and sends the documented request shape', async () => {
    const claude = fakeClaude(claudeTextTurn('msg_1', ['Hello', ', world']));
    const { service } = setup(claude.stream);

    const events = await collect(service, 'hi');

    expect(events.slice(0, 3)).toEqual([
      { event: 'start', data: {} },
      { event: 'text', data: { delta: 'Hello' } },
      { event: 'text', data: { delta: ', world' } },
    ]);
    expect(events[3]).toEqual({
      event: 'done',
      data: {
        interactionId: expect.stringMatching(/^claude_[0-9a-f-]{36}$/),
        // input = input_tokens + cache creation + cache reads.
        usage: { inputTokens: 7, outputTokens: 12, totalTokens: 19 },
        sources: [],
        provider: 'claude',
        model: 'claude-sonnet-5-5',
      },
    });
    expect(claude.requests).toHaveLength(1);
    const [request] = claude.requests;
    expect(request).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 64000,
      output_config: { effort: 'low' },
      tools: chatTools.map((tool) => toClaudeTool(tool.declaration)),
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      cache_control: { type: 'ephemeral' },
      messages: [{ role: 'user', content: 'hi' }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    // Adaptive thinking is the model default: never disabled, never a budget.
    expect(request).not.toHaveProperty('thinking');
  });

  it('runs a tool round, then sends the assistant content unchanged and one user message of results', async () => {
    const claude = fakeClaude(
      claudeToolTurn('msg_1', [call('toolu_1', 'get_product', '{"sku":"FRT-CON-C3240"}')]),
      claudeTextTurn('msg_2', ['40 MPa']),
    );
    const { service } = setup(claude.stream);

    const events = await collect(service);

    expect(events.map((event) => event.event)).toEqual(['start', 'tool', 'tool', 'text', 'done']);
    expect(events.at(-1)).toMatchObject({
      data: { usage: { inputTokens: 14, outputTokens: 24, totalTokens: 38 }, sources: [DATA_SHEET_SOURCE] },
    });
    expect(claude.requests).toHaveLength(2);
    expect(claude.requests[1]!.messages).toEqual([
      { role: 'user', content: 'What is the strength of C32/40?' },
      {
        role: 'assistant',
        content: [
          // The thinking block goes back exactly as received, signature included.
          { type: 'thinking', thinking: '', signature: 'sig_msg_1' },
          { type: 'tool_use', id: 'toolu_1', name: 'get_product', input: { sku: 'FRT-CON-C3240' } },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: JSON.stringify({ found: true, product: { ...product, dataSheet: reference } }),
          },
        ],
      },
    ]);
    // Tools and system are re-sent unchanged, so the cached prefix holds.
    expect(claude.requests[1]!.tools).toEqual(claude.requests[0]!.tools);
    expect(claude.requests[1]!.system).toEqual(claude.requests[0]!.system);
  });

  it('answers parallel tool calls with every result in one user message', async () => {
    const claude = fakeClaude(
      claudeToolTurn('msg_1', [
        call('toolu_1', 'list_categories', '{}'),
        call('toolu_2', 'search_products', '{"category":"concrete"}'),
      ]),
      claudeTextTurn('msg_2', ['ok']),
    );
    const { service, products } = setup(claude.stream);

    const events = await collect(service);

    expect(events.filter((event) => event.event === 'tool')).toHaveLength(4);
    expect(products.search).toHaveBeenCalledWith({ query: undefined, category: 'concrete' });
    const last = claude.requests[1]!.messages.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content).toMatchObject([
      { type: 'tool_result', tool_use_id: 'toolu_1' },
      { type: 'tool_result', tool_use_id: 'toolu_2' },
    ]);
  });

  it('returns a bad argument as an is_error result with the same body Gemini gets', async () => {
    const claude = fakeClaude(
      claudeToolTurn('msg_1', [call('toolu_1', 'get_product', '{"sku":42}')]),
      claudeTextTurn('msg_2', ['Sorry']),
    );
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [call('call_1', 'get_product', '{"sku":42}')]),
      textTurn('v1_b', ['Sorry']),
    );
    const { service, products } = setup(claude.stream, gemini.stream);

    await collect(service);
    await collect(service, undefined, undefined, GEMINI);

    expect(products.getBySku).not.toHaveBeenCalled();
    const [result] = claude.requests[1]!.messages.at(-1)!.content as { content: string; is_error: boolean }[];
    const [geminiResult] = gemini.requests[1]!.input as { result: { text: string }[]; is_error: boolean }[];
    expect(result!.is_error).toBe(true);
    expect(result!.content).toMatch(/sku.* must be a string/);
    expect(result!.content).toBe(geminiResult!.result[0]!.text);
  });

  it('re-issues the round once when the tool input is not JSON at all', async () => {
    const claude = fakeClaude(
      claudeToolTurn('msg_1', [call('toolu_1', 'get_product', 'not json')]),
      claudeToolTurn('msg_2', [call('toolu_2', 'get_product', '{"sku":"FRT-CON-C3240"}')]),
      claudeTextTurn('msg_3', ['40 MPa']),
    );
    const { service, products } = setup(claude.stream);

    const events = await collect(service);

    expect(events.at(-1)?.event).toBe('done');
    // The failed attempt was re-sent as it was: nothing of it entered the history.
    expect(claude.requests[1]!.messages).toEqual(claude.requests[0]!.messages);
    expect(products.getBySku).toHaveBeenCalledTimes(1);
  });

  it(`stops with tool_limit after ${MAX_TOOL_ROUNDS} tool rounds`, async () => {
    const claude = fakeClaude(claudeToolTurn('msg_loop', [call('toolu_n', 'list_categories', '{}')]));
    const { service, products } = setup(claude.stream);

    const events = await collect(service);

    expect(products.listCategories).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(claude.requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'tool_limit', message: expect.any(String) } });
  });

  it('reports max_tokens as a cut-off answer after the partial text was streamed', async () => {
    const claude = fakeClaude(claudeTextTurn('msg_1', ['Cure for at le'], 'max_tokens'));
    const { service } = setup(claude.stream);

    const events = await collect(service);

    expect(events).toEqual([
      { event: 'start', data: {} },
      { event: 'text', data: { delta: 'Cure for at le' } },
      { event: 'error', data: { code: 'model_error', message: expect.stringMatching(/cut off/) } },
    ]);
  });

  it('never runs the tools of a turn that stopped at max_tokens', async () => {
    const turn = claudeToolTurn('msg_1', [call('toolu_1', 'get_product', '{"sku":"FRT-CON-C3240"}')]);
    turn.splice(-2, 1, { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 1 } } as never);
    const { service, products } = setup(fakeClaude(turn).stream);

    const events = await collect(service);

    expect(products.getBySku).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ event: 'error', data: { code: 'model_error' } });
  });

  it('turns a refusal into a polite model_error and logs only the category', async () => {
    const log = logLines();
    const claude = fakeClaude(
      claudeTextTurn('msg_1', [], 'refusal', { type: 'refusal', category: 'cyber', explanation: 'SECRET EXPLANATION' }),
    );
    const { service } = setup(claude.stream);

    const events = await collect(service);

    expect(events.at(-1)).toEqual({
      event: 'error',
      data: { code: 'model_error', message: expect.stringMatching(/can't help with that/) },
    });
    const line = String(log.mock.calls.at(-1)![0]);
    expect(line).toContain('outcome=model_error:refusal_cyber');
    expect(line).not.toContain('SECRET');
  });

  it('turns an SDK error into model_error and logs the class name only', async () => {
    const log = logLines();
    const failing: ClaudeStream = () =>
      toStream([], undefined, undefined, new RateLimitError(429, undefined, 'rate limited for key sk-ant-SECRET', new Headers()));
    const { service } = setup(failing);

    const events = await collect(service);

    expect(events).toEqual([
      { event: 'start', data: {} },
      { event: 'error', data: { code: 'model_error', message: expect.any(String) } },
    ]);
    const line = String(log.mock.calls.at(-1)![0]);
    expect(line).toContain('outcome=model_error:RateLimitError');
    expect(line).toContain('provider=claude model=claude-sonnet-5-5');
    expect(line + JSON.stringify(events)).not.toMatch(/sk-ant|SECRET|429/);
  });

  it('aborts the upstream request and ends quietly when the client goes away', async () => {
    let upstream: AbortSignal | undefined;
    const claude: ClaudeStream = (_request, signal) => {
      upstream = signal;
      // Hang after the first text delta (message_start, 3 thinking events, block start, delta).
      return toStream(claudeTextTurn('msg_1', ['Hel', 'lo']), signal, 6);
    };
    const { service, conversations } = setup(claude);
    const abort = new AbortController();

    const events: ChatEvent[] = [];
    for await (const event of service.run({ message: 'hi' }, abort.signal)) {
      events.push(event);
      if (event.event === 'text') abort.abort();
    }

    expect(upstream?.aborted).toBe(true);
    expect(events).toEqual([
      { event: 'start', data: {} },
      { event: 'text', data: { delta: 'Hel' } },
    ]);
    expect(conversations.size).toBe(0);
  });

  it('emits not_configured when a turn is pinned to Claude and Claude has no key', async () => {
    const { service } = setup(null, fakeGemini(textTurn('v1_a', ['ok'])).stream);

    expect(await collect(service, 'hi', undefined, { provider: 'claude', model: 'claude-sonnet-5-5' })).toEqual([
      { event: 'start', data: {} },
      { event: 'error', data: { code: 'not_configured', message: expect.any(String) } },
    ]);
  });
});

describe('Claude conversations', () => {
  it('continues a conversation with the returned id, appending to the stored history', async () => {
    const log = logLines();
    const claude = fakeClaude(claudeTextTurn('msg_1', ['7 days']), claudeTextTurn('msg_2', ['2380 kg/m³']));
    const { service } = setup(claude.stream);

    const first = await collect(service, 'How should it be cured?');
    const id = (first.at(-1)!.data as { interactionId: string }).interactionId;
    const second = await collect(service, 'And its density?', id);

    expect((second.at(-1)!.data as { interactionId: string }).interactionId).toBe(id);
    expect(claude.requests[1]!.messages).toEqual([
      { role: 'user', content: 'How should it be cured?' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 'sig_msg_1' },
          { type: 'text', text: '7 days', citations: null },
        ],
      },
      { role: 'user', content: 'And its density?' },
    ]);
    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines[0]).toContain('conversation=new');
    expect(lines[1]).toContain('conversation=continued');
    expect(lines.join('\n')).not.toContain(id);
  });

  it.each([
    ['an unknown id', 'claude_00000000-0000-0000-0000-000000000000'],
    ['a Gemini interaction id', 'v1_abc'],
  ])('starts a fresh conversation for %s', async (_case, previousInteractionId) => {
    const claude = fakeClaude(claudeTextTurn('msg_1', ['ok']));
    const { service } = setup(claude.stream);

    const events = await collect(service, 'hi', previousInteractionId);

    expect(claude.requests[0]!.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect((events.at(-1)!.data as { interactionId: string }).interactionId).not.toBe(previousInteractionId);
  });

  it('forgets a conversation after two idle hours', async () => {
    vi.useFakeTimers();
    const claude = fakeClaude(claudeTextTurn('msg_1', ['ok']));
    const { service } = setup(claude.stream);
    const id = ((await collect(service, 'first')).at(-1)!.data as { interactionId: string }).interactionId;

    vi.advanceTimersByTime(CONVERSATION_IDLE_MS + 1);
    await collect(service, 'second', id);

    expect(claude.requests[1]!.messages).toEqual([{ role: 'user', content: 'second' }]);
  });

  it('leaves no half-written history when a turn fails after a tool round', async () => {
    const claude = fakeClaude(
      claudeTextTurn('msg_1', ['first answer']),
      claudeToolTurn('msg_2', [call('toolu_1', 'get_product', '{"sku":"FRT-CON-C3240"}')]),
      claudeTextTurn('msg_3', [], 'refusal', { type: 'refusal', category: null }),
      claudeTextTurn('msg_4', ['third answer']),
    );
    const { service } = setup(claude.stream);
    const id = ((await collect(service, 'one')).at(-1)!.data as { interactionId: string }).interactionId;

    expect((await collect(service, 'two', id)).at(-1)?.event).toBe('error');
    await collect(service, 'three', id);

    // No tool_use without its tool_result, nothing of the refused turn: only turn one, then "three".
    expect(claude.requests[3]!.messages).toEqual([
      ...claude.requests[1]!.messages.slice(0, 2),
      { role: 'user', content: 'three' },
    ]);
  });

  it('does not forward a Claude id to Gemini', async () => {
    const gemini = fakeGemini(textTurn('v1_a', ['ok']));
    const { service } = setup(null, gemini.stream);

    await collect(service, 'hi', 'claude_00000000-0000-0000-0000-000000000000', GEMINI);

    expect(gemini.requests[0]).not.toHaveProperty('previous_interaction_id');
  });
});

describe('ClaudeConversations', () => {
  it('evicts the least recently used conversation over the cap', () => {
    const store = new ClaudeConversations();
    const ids = Array.from({ length: 500 }, () => store.save(undefined, [{ role: 'user', content: 'x' }]));
    // Reading the oldest makes it recently used.
    expect(store.get(ids[0])).toHaveLength(1);

    store.save(undefined, [{ role: 'user', content: 'y' }]);

    expect(store.size).toBe(500);
    expect(store.get(ids[0])).toBeDefined();
    expect(store.get(ids[1])).toBeUndefined();
  });

  it('does not continue a conversation that reached the message cap', () => {
    const store = new ClaudeConversations();
    const messages = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' }) as const);
    const id = store.save(undefined, messages);

    expect(store.get(id)).toBeUndefined();
  });

  it('hands out copies, so a turn cannot change the stored history', () => {
    const store = new ClaudeConversations();
    const id = store.save(undefined, [{ role: 'user', content: 'x' }]);

    store.get(id)!.push({ role: 'user', content: 'y' });

    expect(store.get(id)).toHaveLength(1);
  });
});

describe('toClaudeTool', () => {
  it('gives one Claude tool per declaration with the same name, description and schema', () => {
    const tools = chatTools.map((tool) => toClaudeTool(tool.declaration));

    expect(tools).toHaveLength(chatTools.length);
    tools.forEach((tool, i) => {
      const { declaration } = chatTools[i]!;
      expect(tool).toEqual({
        name: declaration.name,
        description: declaration.description,
        input_schema: declaration.parameters,
        eager_input_streaming: true,
      });
    });
  });
});

describe('historyContent', () => {
  it('keeps a normal response unchanged', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'a', citations: null },
    ] as BetaContentBlock[];

    expect(historyContent(content)).toEqual(content);
  });

  it('after a mid-output fallback, echoes only text before the last fallback block', () => {
    const fallback = { type: 'fallback', from: { model: 'claude-sonnet-5-5' }, to: { model: 'claude-sonnet-5' } };
    const content = [
      { type: 'thinking', thinking: '', signature: 's1' },
      { type: 'text', text: 'partial', citations: null },
      fallback,
      { type: 'thinking', thinking: '', signature: 's2' },
      { type: 'text', text: 'rest', citations: null },
    ] as BetaContentBlock[];

    expect(historyContent(content)).toEqual([content[1], fallback, content[3], content[4]]);
  });
});

describe('both providers', () => {
  it('give the same done.sources for the same tool results', async () => {
    const answer = ['Cure for at least 7 days ', '(data sheet DS-FRT-CON-C3240, Rev Z, issued 1999-01-01).'];
    const claude = fakeClaude(
      claudeToolTurn('msg_1', [call('toolu_1', 'get_data_sheet', '{"sku":"FRT-CON-C3240"}')]),
      claudeTextTurn('msg_2', answer),
    );
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [call('call_1', 'get_data_sheet', '{"sku":"FRT-CON-C3240"}')]),
      textTurn('v1_b', answer),
    );
    const { service } = setup(claude.stream, gemini.stream);

    const fromClaude = (await collect(service, 'How is it cured?')).at(-1)!;
    const fromGemini = (await collect(service, 'How is it cured?', undefined, GEMINI)).at(-1)!;

    expect(fromClaude).toMatchObject({ event: 'done', data: { sources: [DATA_SHEET_SOURCE] } });
    expect((fromClaude.data as { sources: unknown }).sources).toEqual((fromGemini.data as { sources: unknown }).sources);
  });
});
