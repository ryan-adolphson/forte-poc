import type { ChatEvent } from '@forte/chat-contract';
import { errorTurn, fakeGemini, functionCallTurn, textTurn } from '../../test/fake-gemini.js';
import type { AppConfig } from '../config/app.config.js';
import type { ProductsService } from '../products/products.service.js';
import { ChatService, MAX_TOOL_ROUNDS } from './chat.service.js';
import type { GeminiStream } from './gemini.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

const config = { geminiModel: 'gemini-3.8-flash' } as AppConfig;

const product = {
  sku: 'FRT-CON-C3240',
  name: 'Ready-Mix Concrete C32/40',
  category: 'concrete',
  description: 'Structural ready-mix concrete.',
  properties: [],
};

function setup(gemini: GeminiStream | null) {
  const products = {
    search: vi.fn().mockResolvedValue([product]),
    getBySku: vi.fn().mockResolvedValue(product),
    listCategories: vi.fn().mockResolvedValue(['concrete']),
  };
  const service = new ChatService(config, gemini, products as unknown as ProductsService);
  return { service, products };
}

async function collect(
  service: ChatService,
  message = 'What is the strength of C32/40?',
  signal = new AbortController().signal,
  previousInteractionId?: string,
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of service.run({ message, previousInteractionId }, signal)) {
    events.push(event);
  }
  return events;
}

describe('ChatService.run', () => {
  it('streams a plain text turn as start, text deltas and done', async () => {
    const gemini = fakeGemini(textTurn('v1_a', ['Hello', ', world']));
    const { service } = setup(gemini.stream);

    expect(await collect(service, 'hi', undefined, 'v1_prev')).toEqual([
      { event: 'start', data: {} },
      { event: 'text', data: { delta: 'Hello' } },
      { event: 'text', data: { delta: ', world' } },
      {
        event: 'done',
        data: { interactionId: 'v1_a', usage: { inputTokens: 7, outputTokens: 12, totalTokens: 19 } },
      },
    ]);
    expect(gemini.requests).toHaveLength(1);
    expect(gemini.requests[0]).toMatchObject({
      model: 'gemini-3.8-flash',
      input: 'hi',
      previous_interaction_id: 'v1_prev',
      store: true,
      stream: true,
    });
  });

  it('runs a function call, returns the result with tools and system instruction, then finishes', async () => {
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [{ id: 'call_1', name: 'get_product', argumentsJson: '{"sku":"FRT-CON-C3240"}' }]),
      textTurn('v1_b', ['40 MPa']),
    );
    const { service, products } = setup(gemini.stream);

    expect(await collect(service)).toEqual([
      { event: 'start', data: {} },
      { event: 'tool', data: { name: 'get_product', status: 'started' } },
      { event: 'tool', data: { name: 'get_product', status: 'finished' } },
      { event: 'text', data: { delta: '40 MPa' } },
      {
        event: 'done',
        // The last interaction's id continues the conversation; usage is summed over both calls.
        data: { interactionId: 'v1_b', usage: { inputTokens: 14, outputTokens: 24, totalTokens: 38 } },
      },
    ]);
    expect(products.getBySku).toHaveBeenCalledWith('FRT-CON-C3240');

    const second = gemini.requests[1]!;
    expect(second.previous_interaction_id).toBe('v1_a');
    expect(second.system_instruction).toBe(SYSTEM_PROMPT);
    expect(second.tools).toHaveLength(3);
    expect(second.input).toEqual([
      {
        type: 'function_result',
        name: 'get_product',
        call_id: 'call_1',
        is_error: false,
        result: [{ type: 'text', text: JSON.stringify({ found: true, product }) }],
      },
    ]);
  });

  it('runs parallel calls and returns every result in one request', async () => {
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [
        { id: 'call_1', name: 'list_categories', argumentsJson: '{}' },
        { id: 'call_2', name: 'search_products', argumentsJson: '{"category":"concrete"}' },
      ]),
      textTurn('v1_b', ['ok']),
    );
    const { service, products } = setup(gemini.stream);

    const events = await collect(service);

    expect(events.filter((event) => event.event === 'tool')).toHaveLength(4);
    expect(products.search).toHaveBeenCalledWith({ query: undefined, category: 'concrete' });
    expect(gemini.requests[1]!.input).toMatchObject([{ call_id: 'call_1' }, { call_id: 'call_2' }]);
  });

  it.each([
    ['bad argument types', 'get_product', '{"sku":42}', /sku.* must be a string/],
    ['malformed JSON', 'get_product', '{"sku":', /not valid JSON/],
    ['an unknown tool', 'delete_everything', '{}', /Unknown tool/],
  ])('returns %s to the model as an error result and carries on', async (_case, name, argumentsJson, message) => {
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [{ id: 'call_1', name, argumentsJson }]),
      textTurn('v1_b', ['Sorry']),
    );
    const { service, products } = setup(gemini.stream);

    const events = await collect(service);

    expect(events.at(-1)?.event).toBe('done');
    expect(products.getBySku).not.toHaveBeenCalled();
    expect(gemini.requests[1]!.input).toEqual([
      {
        type: 'function_result',
        name,
        call_id: 'call_1',
        is_error: true,
        result: [{ type: 'text', text: expect.stringMatching(message) }],
      },
    ]);
  });

  it(`stops with tool_limit after ${MAX_TOOL_ROUNDS} tool rounds`, async () => {
    const gemini = fakeGemini(
      functionCallTurn('v1_loop', [{ id: 'call_n', name: 'list_categories', argumentsJson: '{}' }]),
    );
    const { service, products } = setup(gemini.stream);

    const events = await collect(service);

    expect(products.listCategories).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(gemini.requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(events.at(-1)).toEqual({
      event: 'error',
      data: { code: 'tool_limit', message: expect.any(String) },
    });
    expect(events.some((event) => event.event === 'done')).toBe(false);
  });

  it('turns a thrown upstream failure into model_error with a safe message', async () => {
    const { service } = setup(async () => {
      throw new Error('403 API key AIzaSECRET is invalid for https://internal.example');
    });

    const events = await collect(service);

    expect(events).toEqual([
      { event: 'start', data: {} },
      { event: 'error', data: { code: 'model_error', message: expect.any(String) } },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/AIza|internal|403/);
  });

  it('turns an in-stream error event into model_error without the provider message', async () => {
    const { service } = setup(fakeGemini(errorTurn('v1_a')).stream);

    const events = await collect(service);

    expect(events.at(-1)).toEqual({
      event: 'error',
      data: { code: 'model_error', message: expect.any(String) },
    });
    expect(JSON.stringify(events)).not.toMatch(/Deadline|gateway/);
  });

  it.each(['incomplete', 'failed', 'cancelled'])(
    'does not present a turn that ends with status %s as done',
    async (status) => {
      const { service } = setup(fakeGemini(textTurn('v1_a', ['Partial ans'], status)).stream);

      const events = await collect(service);

      expect(events.at(-1)).toMatchObject({ event: 'error', data: { code: 'model_error' } });
      expect(events.some((event) => event.event === 'done')).toBe(false);
    },
  );

  it('does not present a completed turn with no text as done', async () => {
    const { service } = setup(fakeGemini(textTurn('v1_a', [])).stream);

    expect((await collect(service)).at(-1)).toMatchObject({
      event: 'error',
      data: { code: 'model_error' },
    });
  });

  it('passes the abort signal upstream and ends quietly when the client goes away', async () => {
    const abort = new AbortController();
    let upstreamSignal: AbortSignal | undefined;
    const { service } = setup(async (_request, signal) => {
      upstreamSignal = signal;
      return (async function* () {
        yield* textTurn('v1_a', ['Hel']).slice(0, 4);
        // Like fetch: the read rejects once the signal aborts.
        signal.throwIfAborted();
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason as Error));
        });
      })();
    });

    const events: ChatEvent[] = [];
    for await (const event of service.run({ message: 'hi' }, abort.signal)) {
      events.push(event);
      if (event.event === 'text') abort.abort();
    }

    expect(upstreamSignal?.aborted).toBe(true);
    expect(events).toEqual([
      { event: 'start', data: {} },
      { event: 'text', data: { delta: 'Hel' } },
    ]);
  });

  it('emits not_configured when there is no API key', async () => {
    const { service } = setup(null);

    expect(await collect(service)).toEqual([
      { event: 'start', data: {} },
      { event: 'error', data: { code: 'not_configured', message: expect.any(String) } },
    ]);
  });
});
