import type { ChatEvent } from '@forte/chat-contract';
import { errorTurn, fakeGemini, functionCallTurn, textTurn } from '../../test/fake-gemini.js';
import type { AppConfig } from '../config/app.config.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { ProductsService } from '../products/products.service.js';
import { ChatService, MAX_TOOL_ROUNDS } from './chat.service.js';
import type { GeminiStream } from './gemini.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { chatTools } from './tools/index.js';

const config = { geminiModel: 'gemini-3.8-flash' } as AppConfig;

const product = {
  sku: 'FRT-CON-C3240',
  name: 'Ready-Mix Concrete C32/40',
  category: 'concrete',
  description: 'Structural ready-mix concrete.',
  properties: [],
};

const dataSheet = {
  documentNumber: 'DS-FRT-CON-C3240',
  revision: 'C',
  issueDate: '2026-01-19',
  title: 'Ready-Mix Concrete C32/40 - Product data sheet',
  sku: 'FRT-CON-C3240',
  productName: 'Ready-Mix Concrete C32/40',
  text: 'Handling and storage\n- Cure for at least 7 days.',
};

/** The same sheet as the catalogue tools see it: the reference only. */
const reference = { documentNumber: 'DS-FRT-CON-C3240', revision: 'C', issueDate: '2026-01-19' };
const CATALOGUE_SOURCE = {
  kind: 'catalogue',
  sku: 'FRT-CON-C3240',
  productName: 'Ready-Mix Concrete C32/40',
  dataSheet: { ...reference, url: '/api/documents/DS-FRT-CON-C3240/file' },
};

function setup(gemini: GeminiStream | null) {
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
  const service = new ChatService(
    config,
    gemini,
    products as unknown as ProductsService,
    documents as unknown as DocumentsService,
  );
  return { service, products, documents };
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
        data: {
          interactionId: 'v1_a',
          usage: { inputTokens: 7, outputTokens: 12, totalTokens: 19 },
          // No tool ran, so there is nothing to cite.
          sources: [],
        },
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

  describe('productSku', () => {
    const CONTEXT = '[Context from the product page: the user is viewing "Ready-Mix Concrete C32/40" (SKU FRT-CON-C3240).]';

    async function firstRequest(productSku: string | undefined, found: boolean) {
      const gemini = fakeGemini(textTurn('v1_a', ['ok']));
      const { service, products } = setup(gemini.stream);
      if (!found) products.getBySku.mockResolvedValue(null);
      const events: ChatEvent[] = [];
      const request = { message: 'What is its compressive strength?', productSku };
      for await (const event of service.run(request, new AbortController().signal)) events.push(event);
      return { events, request: gemini.requests[0]!, requests: gemini.requests, products };
    }

    it('prepends the context with the name and SKU from the database, not the client string', async () => {
      // The client sends a different spelling; the row's own SKU and name are what go out.
      const { request, requests, products, events } = await firstRequest('frt-con-c3240', true);

      expect(products.getBySku).toHaveBeenCalledWith('frt-con-c3240');
      expect(request.input).toBe(`${CONTEXT}\n\nWhat is its compressive strength?`);
      expect(request.input).not.toContain('frt-con-c3240');
      expect(request.system_instruction).toBe(SYSTEM_PROMPT);
      expect(request.tools).toEqual(chatTools.map((tool) => tool.declaration));
      expect(requests).toHaveLength(1);
      expect(events.at(-1)?.event).toBe('done');
    });

    it('puts only the SKU and name in the context, never properties or the description', async () => {
      const { request } = await firstRequest('FRT-CON-C3240', true);

      expect(request.input).not.toContain(product.description);
      expect(request.input).not.toContain(product.category);
    });

    it.each([
      ['an unknown SKU', 'FRT-NOPE-0000'],
      ['a hidden SKU', 'FRT-CON-H2835'],
    ])('runs the turn exactly as without productSku for %s', async (_case, productSku) => {
      const without = await firstRequest(undefined, false);
      const withSku = await firstRequest(productSku, false);

      expect(withSku.products.getBySku).toHaveBeenCalledWith(productSku);
      expect(withSku.request).toEqual(without.request);
      expect(withSku.events).toEqual(without.events);
      expect(withSku.request.input).toBe('What is its compressive strength?');
      expect(JSON.stringify(withSku.requests)).not.toContain(productSku);
      expect(withSku.request.system_instruction).toBe(SYSTEM_PROMPT);
      expect(withSku.request.tools).toHaveLength(6);
    });

    it('does not look anything up when no productSku is sent', async () => {
      const { products, request } = await firstRequest(undefined, true);

      expect(products.getBySku).not.toHaveBeenCalled();
      expect(request.input).toBe('What is its compressive strength?');
    });

    it('sends the context only on the first model call of the turn', async () => {
      const gemini = fakeGemini(
        functionCallTurn('v1_a', [{ id: 'call_1', name: 'get_product', argumentsJson: '{"sku":"FRT-CON-C3240"}' }]),
        textTurn('v1_b', ['40 MPa']),
      );
      const { service } = setup(gemini.stream);
      const request = { message: 'What is its compressive strength?', productSku: 'FRT-CON-C3240' };
      for await (const _event of service.run(request, new AbortController().signal)) {
        // drain
      }

      expect(gemini.requests[0]!.input).toContain(CONTEXT);
      expect(JSON.stringify(gemini.requests[1]!.input)).not.toContain('Context from the product page');
      expect(gemini.requests[1]!.system_instruction).toBe(SYSTEM_PROMPT);
      expect(gemini.requests[1]!.tools).toHaveLength(6);
    });
  });

  it('runs a function call, returns the result with tools and system instruction, then finishes', async () => {
    const gemini = fakeGemini(
      functionCallTurn('v1_a', [{ id: 'call_1', name: 'get_product', argumentsJson: '{"sku":"FRT-CON-C3240"}' }]),
      textTurn('v1_b', ['40 MPa']),
    );
    const { service, products, documents } = setup(gemini.stream);

    expect(await collect(service)).toEqual([
      { event: 'start', data: {} },
      { event: 'tool', data: { name: 'get_product', status: 'started' } },
      { event: 'tool', data: { name: 'get_product', status: 'finished' } },
      { event: 'text', data: { delta: '40 MPa' } },
      {
        event: 'done',
        // The last interaction's id continues the conversation; usage is summed over both calls.
        data: {
          interactionId: 'v1_b',
          usage: { inputTokens: 14, outputTokens: 24, totalTokens: 38 },
          // The answer names no product, so the one that was fetched on purpose is the source.
          // It carries the revision of the product's current data sheet.
          sources: [CATALOGUE_SOURCE],
        },
      },
    ]);
    expect(products.getBySku).toHaveBeenCalledWith('FRT-CON-C3240');
    // The reference came from the tool's own lookup: one query, no sheet text, no model round for it.
    expect(documents.getCurrentReferences).toHaveBeenCalledExactlyOnceWith(['FRT-CON-C3240']);
    expect(documents.getCurrentForSku).not.toHaveBeenCalled();
    expect(gemini.requests).toHaveLength(2);

    const second = gemini.requests[1]!;
    expect(second.previous_interaction_id).toBe('v1_a');
    expect(second.system_instruction).toBe(SYSTEM_PROMPT);
    expect(second.tools).toHaveLength(6);
    expect(second.input).toEqual([
      {
        type: 'function_result',
        name: 'get_product',
        call_id: 'call_1',
        is_error: false,
        result: [{ type: 'text', text: JSON.stringify({ found: true, product: { ...product, dataSheet: reference } }) }],
      },
    ]);
  });

  describe('sources', () => {
    const DATA_SHEET_SOURCE = {
      kind: 'datasheet',
      sku: 'FRT-CON-C3240',
      productName: 'Ready-Mix Concrete C32/40',
      documentNumber: 'DS-FRT-CON-C3240',
      revision: 'C',
      issueDate: '2026-01-19',
      url: '/api/documents/DS-FRT-CON-C3240/file',
    };
    const call = (id: string, name: string, argumentsJson: string) => ({ id, name, argumentsJson });

    it('gives the model the data sheet and cites it in done, built from the tool result', async () => {
      const gemini = fakeGemini(
        functionCallTurn('v1_a', [call('call_1', 'get_data_sheet', '{"sku":"frt-con-c3240"}')]),
        // The model cites a revision the tool never returned; the source still says C.
        textTurn('v1_b', ['Cure for at least 7 days ', '(data sheet DS-FRT-CON-C3240, Rev Z, issued 1999-01-01).']),
      );
      const { service, documents } = setup(gemini.stream);

      const events = await collect(service, 'How should C32/40 be cured?');

      expect(documents.getCurrentForSku).toHaveBeenCalledWith('frt-con-c3240');
      expect(gemini.requests[1]!.input).toEqual([
        {
          type: 'function_result',
          name: 'get_data_sheet',
          call_id: 'call_1',
          is_error: false,
          // Only `data` goes to the model: no `sources`, no URL.
          result: [{ type: 'text', text: JSON.stringify({ found: true, dataSheet }) }],
        },
      ]);
      expect(events.at(-1)).toMatchObject({ event: 'done', data: { sources: [DATA_SHEET_SOURCE] } });
      // `sources` arrives only in `done`.
      expect(JSON.stringify(events.slice(0, -1))).not.toContain('sources');
    });

    it('collects over several tool rounds and puts the data sheet before the catalogue product', async () => {
      const gemini = fakeGemini(
        functionCallTurn('v1_a', [call('call_1', 'get_product', '{"sku":"FRT-CON-C3240"}')]),
        functionCallTurn('v1_b', [call('call_2', 'get_data_sheet', '{"sku":"FRT-CON-C3240"}')]),
        textTurn('v1_c', ['Ready-Mix Concrete C32/40 (FRT-CON-C3240): 40 MPa. Cure for 7 days.']),
      );
      const { service } = setup(gemini.stream);

      const done = (await collect(service)).at(-1);

      expect(done).toMatchObject({
        event: 'done',
        data: {
          sources: [
            DATA_SHEET_SOURCE,
            // Fetched on purpose, so it stays, and it names the same current sheet.
            CATALOGUE_SOURCE,
          ],
        },
      });
    });

    it('cites a catalogue product without dataSheet when it has no data sheet, or the lookup finds none', async () => {
      const gemini = fakeGemini(
        functionCallTurn('v1_a', [call('call_1', 'search_products', '{"query":"C32/40"}')]),
        // The model invents a reference; none reaches the source.
        textTurn('v1_b', ['FRT-CON-C3240: 40 MPa (catalogue; data sheet DS-FRT-CON-C3240, Rev Z, issued 1999-01-01).']),
      );
      const { service, documents } = setup(gemini.stream);
      documents.getCurrentReferences.mockResolvedValue(new Map());

      const done = (await collect(service)).at(-1);

      expect(done).toMatchObject({ event: 'done' });
      expect(done!.data).toHaveProperty('sources', [
        { kind: 'catalogue', sku: 'FRT-CON-C3240', productName: 'Ready-Mix Concrete C32/40' },
      ]);
      expect(JSON.stringify(gemini.requests[1]!.input)).not.toContain('dataSheet');
    });

    it('has no sources when the lookups found nothing', async () => {
      const gemini = fakeGemini(
        functionCallTurn('v1_a', [
          call('call_1', 'get_data_sheet', '{"sku":"FRT-CON-H2835"}'),
          call('call_2', 'search_data_sheets', '{"query":"heritage"}'),
        ]),
        textTurn('v1_b', ['I do not have that information.']),
      );
      const { service, documents } = setup(gemini.stream);
      documents.getCurrentForSku.mockResolvedValue(null);
      documents.searchCurrent.mockResolvedValue([]);

      const events = await collect(service);

      expect(events.at(-1)).toMatchObject({ event: 'done', data: { sources: [] } });
      expect(JSON.stringify(gemini.requests[1]!.input)).toContain('{\\"found\\":false}');
    });

    it('carries no sources when the turn ends in an error after a successful lookup', async () => {
      const gemini = fakeGemini(
        functionCallTurn('v1_a', [call('call_1', 'get_data_sheet', '{"sku":"FRT-CON-C3240"}')]),
        textTurn('v1_b', ['Cure for at le'], 'incomplete'),
      );
      const { service } = setup(gemini.stream);

      const events = await collect(service);

      expect(events.at(-1)?.event).toBe('error');
      expect(JSON.stringify(events)).not.toMatch(/sources|DS-FRT-CON-C3240/);
    });
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
