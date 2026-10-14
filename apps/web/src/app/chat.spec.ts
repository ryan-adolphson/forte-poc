import { TestBed } from '@angular/core/testing';
import {
  CATALOGUE_ENTRY,
  DATA_SHEET,
  FakeStream,
  done,
  fakeFetch,
  settle,
} from '../testing/fake-chat-stream';
import { PRODUCTS } from '../testing/products';
import { Chat } from './chat';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('Chat', () => {
  let chat: Chat;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    chat = TestBed.inject(Chat);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reply = () => chat.messages().at(-1)!;

  /** Sends a message and waits until the faked stream is open. */
  async function open(streams: FakeStream[], text: string): Promise<FakeStream> {
    void chat.send(text);
    await settle();
    return streams.at(-1)!;
  }

  it('builds the assistant message from deltas and stores the interaction id', async () => {
    const streams = fakeFetch();

    const sending = chat.send('  What timber do you have?  ');
    expect(chat.status()).toBe('sending');
    expect(chat.messages().map((m) => [m.role, m.text])).toEqual([
      ['user', 'What timber do you have?'],
      ['assistant', ''],
    ]);
    await settle();
    const stream = streams[0];
    expect(fetch).toHaveBeenCalledWith(
      '/api/chat/stream',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(stream.body).toEqual({ message: 'What timber do you have?' });
    expect(chat.status()).toBe('streaming');

    await stream.emit('start', {});
    await stream.emit('text', { delta: 'We stock ' });
    expect(reply().text).toBe('We stock ');
    await stream.emit('text', { delta: 'C24 and GL28h.' });
    expect(reply().text).toBe('We stock C24 and GL28h.');
    expect(chat.interactionId()).toBeNull();

    await stream.emit('done', done('int-1'));
    await stream.close();
    await sending;

    expect(chat.status()).toBe('idle');
    expect(chat.interactionId()).toBe('int-1');
    expect(reply()).toEqual({
      id: reply().id,
      role: 'assistant',
      text: 'We stock C24 and GL28h.',
      sources: [],
      provider: 'gemini',
      model: 'gemini-test',
    });
  });

  it('sends previousInteractionId on the next message', async () => {
    const streams = fakeFetch();
    const first = await open(streams, 'one');
    await first.emit('done', done('int-1'));
    await first.close();

    const second = await open(streams, 'two');
    expect(second.body).toEqual({ message: 'two', previousInteractionId: 'int-1' });
  });

  it('ignores a blank message and a message sent while busy', async () => {
    const streams = fakeFetch();
    await chat.send('   ');
    expect(fetch).not.toHaveBeenCalled();

    await open(streams, 'one');
    await chat.send('two');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chat.messages()).toHaveLength(2);
  });

  it('shows the running tool and clears it', async () => {
    const streams = fakeFetch();
    const stream = await open(streams, 'q');
    expect(chat.activity()).toBeNull();

    await stream.emit('tool', { name: 'search_products', status: 'started' });
    expect(chat.activity()).toBe('Searching the catalogue…');
    await stream.emit('tool', { name: 'search_products', status: 'finished' });
    expect(chat.activity()).toBeNull();

    await stream.emit('tool', { name: 'get_product', status: 'started' });
    expect(chat.activity()).toBe('Looking up product details…');
    await stream.emit('text', { delta: 'x' });
    expect(chat.activity()).toBeNull();

    await stream.emit('tool', { name: 'list_products', status: 'started' });
    expect(chat.activity()).toBe('Listing the catalogue…');
    await stream.emit('tool', { name: 'list_categories', status: 'started' });
    expect(chat.activity()).toBe('Checking the product categories…');
    await stream.emit('tool', { name: 'get_data_sheet', status: 'started' });
    expect(chat.activity()).toBe('Reading the data sheet…');
    await stream.emit('tool', { name: 'search_data_sheets', status: 'started' });
    expect(chat.activity()).toBe('Searching the data sheets…');
    await stream.emit('done', done('int-1'));
    await stream.close();
    expect(chat.activity()).toBeNull();
  });

  it('keeps partial text, records an error event and keeps the old interaction id', async () => {
    const streams = fakeFetch();
    const first = await open(streams, 'one');
    await first.emit('done', done('int-1'));
    await first.close();

    const second = await open(streams, 'two');
    await second.emit('text', { delta: 'Partial answ' });
    await second.emit('error', { code: 'model_error', message: 'The answer was cut off.' });
    await second.close();

    expect(reply()).toMatchObject({
      text: 'Partial answ',
      error: 'The answer was cut off.',
      retryable: true,
    });
    expect(chat.interactionId()).toBe('int-1');
    expect(chat.status()).toBe('idle');
  });

  it('does not offer a retry when the server has no model key', async () => {
    const streams = fakeFetch();
    const stream = await open(streams, 'q');
    await stream.emit('start', {});
    await stream.emit('error', { code: 'not_configured', message: 'The assistant is not set up.' });
    await stream.close();

    expect(reply()).toMatchObject({ error: 'The assistant is not set up.', retryable: false });
  });


  it('says the user was signed out on a 401, and is not left busy', async () => {
    fakeFetch(() => json(401, { code: 'unauthenticated', message: 'Sign in first.' }));

    await chat.send('What timber do you have?');

    expect(chat.status()).toBe('idle');
    expect(chat.messages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(reply().error).toBe('You were signed out. Sign in and try again.');
    expect(reply().retryable).toBe(true);
  });

  it('reports a rate limit with the Retry-After wait', async () => {
    fakeFetch(() =>
      json(429, { code: 'rate_limited', message: 'Too many messages.' }, { 'Retry-After': '42' }),
    );
    await chat.send('q');

    expect(reply()).toMatchObject({
      text: '',
      error: 'Too many messages. Try again in 42 seconds.',
      retryable: true,
    });
    expect(chat.status()).toBe('idle');
  });

  it('reports a rejected message (HTTP 400) without a retry', async () => {
    fakeFetch(() =>
      json(400, {
        message: ['message must be shorter than or equal to 2000 characters'],
        error: 'Bad Request',
        statusCode: 400,
      }),
    );
    await chat.send('q');

    expect(reply().error).toBe(
      'The message was not accepted: message must be shorter than or equal to 2000 characters',
    );
    expect(reply().retryable).toBeUndefined();
    expect(chat.status()).toBe('idle');
  });

  it('reports another HTTP failure, such as the proxy with the API down', async () => {
    fakeFetch(() => new Response('', { status: 502 }));
    await chat.send('q');

    expect(reply()).toMatchObject({
      error: 'The server could not answer (HTTP 502).',
      retryable: true,
    });
  });

  it('reports a network failure as a lost connection', async () => {
    fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await chat.send('q');

    expect(reply()).toMatchObject({
      error: expect.stringContaining('Connection lost'),
      retryable: true,
    });
    expect(chat.status()).toBe('idle');
  });

  it('reports a stream that ends without done or error, keeping the text', async () => {
    const streams = fakeFetch();
    const stream = await open(streams, 'q');
    await stream.emit('text', { delta: 'Half an ans' });
    await stream.close();

    expect(reply()).toMatchObject({
      text: 'Half an ans',
      error: expect.stringContaining('Connection lost'),
    });
    expect(chat.interactionId()).toBeNull();
    expect(chat.status()).toBe('idle');
  });

  it('stop aborts the request, keeps the text and the old interaction id', async () => {
    const streams = fakeFetch();
    const first = await open(streams, 'one');
    await first.emit('done', done('int-1'));
    await first.close();

    const second = await open(streams, 'two');
    await second.emit('text', { delta: 'So far' });
    chat.stop();
    await settle();

    expect(second.signal.aborted).toBe(true);
    expect(reply()).toMatchObject({ text: 'So far', stopped: true });
    expect(reply().error).toBeUndefined();
    expect(chat.interactionId()).toBe('int-1');
    expect(chat.status()).toBe('idle');
  });

  it('retry asks the last question again and replaces the failed reply', async () => {
    const streams = fakeFetch();
    const first = await open(streams, 'the question');
    await first.close();
    expect(reply().error).toBeDefined();

    void chat.retry();
    await settle();
    expect(streams[1].body).toEqual({ message: 'the question' });
    await streams[1].emit('text', { delta: 'Answer' });
    await streams[1].emit('done', done('int-2'));
    await streams[1].close();

    expect(chat.messages().map((m) => [m.role, m.text, m.error])).toEqual([
      ['user', 'the question', undefined],
      ['assistant', 'Answer', undefined],
    ]);
  });

  it('new chat clears the messages and the interaction id, also mid-reply', async () => {
    const streams = fakeFetch();
    const first = await open(streams, 'one');
    await first.emit('done', done('int-1'));
    await first.close();
    const second = await open(streams, 'two');
    await second.emit('text', { delta: 'So far' });

    chat.newChat();
    expect(second.signal.aborted).toBe(true);
    expect(chat.messages()).toEqual([]);
    expect(chat.interactionId()).toBeNull();
    expect(chat.status()).toBe('idle');

    // The aborted turn must not disturb the next one.
    const third = await open(streams, 'three');
    expect(third.body).toEqual({ message: 'three' });
    expect(chat.status()).toBe('streaming');
    expect(chat.messages()).toHaveLength(2);
  });

  it('sends productSku with every message while a product is selected, and not otherwise', async () => {
    const streams = fakeFetch();
    const general = await open(streams, 'one');
    expect(general.body).toEqual({ message: 'one' });
    await general.emit('done', done('int-1'));
    await general.close();

    chat.selectProduct(PRODUCTS[0]);
    expect(chat.product()).toBe(PRODUCTS[0]);
    const first = await open(streams, 'What is its strength?');
    expect(first.body).toEqual({
      message: 'What is its strength?',
      productSku: 'CON-C3240',
    });
    await first.emit('done', done('int-2'));
    await first.close();

    const second = await open(streams, 'And its density?');
    expect(second.body).toEqual({
      message: 'And its density?',
      previousInteractionId: 'int-2',
      productSku: 'CON-C3240',
    });
  });

  it('starts a new conversation when another product, or none, is selected', async () => {
    const streams = fakeFetch();
    chat.selectProduct(PRODUCTS[0]);
    const first = await open(streams, 'one');
    await first.emit('done', done('int-1'));
    await first.close();
    const second = await open(streams, 'two');
    await second.emit('text', { delta: 'So far' });

    chat.selectProduct(PRODUCTS[1]);
    expect(second.signal.aborted).toBe(true);
    expect(chat.messages()).toEqual([]);
    expect(chat.interactionId()).toBeNull();
    expect(chat.status()).toBe('idle');
    expect(chat.product()).toBe(PRODUCTS[1]);

    const third = await open(streams, 'three');
    expect(third.body).toEqual({ message: 'three', productSku: 'CON-C2025' });
    await third.emit('done', done('int-3'));
    await third.close();

    chat.selectProduct(null);
    expect(chat.messages()).toEqual([]);
    expect(chat.interactionId()).toBeNull();
    expect(chat.product()).toBeNull();

    const fourth = await open(streams, 'four');
    expect(fourth.body).toEqual({ message: 'four' });
    chat.selectProduct(PRODUCTS[0]);
    expect(fourth.signal.aborted).toBe(true);
    expect(chat.messages()).toEqual([]);
  });

  it('keeps the conversation when the same product is selected again', async () => {
    const streams = fakeFetch();
    chat.selectProduct(PRODUCTS[0]);
    const first = await open(streams, 'one');
    await first.emit('done', done('int-1'));
    await first.close();
    const second = await open(streams, 'two');
    await second.emit('text', { delta: 'So far' });

    chat.selectProduct({ ...PRODUCTS[0] }); // the same SKU, as after the catalogue reloads
    expect(second.signal.aborted).toBe(false);
    expect(chat.messages()).toHaveLength(4);
    expect(chat.interactionId()).toBe('int-1');
    expect(chat.status()).toBe('streaming');

    await second.emit('done', done('int-2'));
    await second.close();
    chat.selectProduct(null);
    chat.selectProduct(null);
    const general = await open(streams, 'three');
    await general.emit('done', done('int-3'));
    await general.close();
    chat.selectProduct(null);
    expect(chat.messages()).toHaveLength(2);
    expect(chat.interactionId()).toBe('int-3');
  });

  describe('sources', () => {
    const sources = () => chat.messages().map((m) => m.sources);

    it('keeps the sources of each completed answer with that answer', async () => {
      const streams = fakeFetch();
      const first = await open(streams, 'one');
      await first.emit('text', { delta: 'Cure for 7 days.' });
      expect(reply().sources).toBeUndefined(); // still being written
      await first.emit('done', done('int-1', [DATA_SHEET, CATALOGUE_ENTRY]));
      await first.close();
      expect(sources()).toEqual([undefined, [DATA_SHEET, CATALOGUE_ENTRY]]);

      // A later turn does not touch the earlier answer's sources.
      const second = await open(streams, 'two');
      await second.emit('done', done('int-2', [CATALOGUE_ENTRY]));
      await second.close();
      const third = await open(streams, 'three');
      await third.emit('done', done('int-3'));
      await third.close();
      expect(sources()).toEqual([
        undefined,
        [DATA_SHEET, CATALOGUE_ENTRY],
        undefined,
        [CATALOGUE_ENTRY],
        undefined,
        [],
      ]);
    });

    it('has none on a turn that fails, is stopped or loses the connection', async () => {
      const streams = fakeFetch();
      const failed = await open(streams, 'one');
      await failed.emit('text', { delta: 'Partial' });
      await failed.emit('error', { code: 'model_error', message: 'The answer was cut off.' });
      await failed.close();
      expect(reply().error).toBe('The answer was cut off.');
      expect(reply().sources).toBeUndefined();

      const stopped = await open(streams, 'two');
      await stopped.emit('text', { delta: 'So far' });
      chat.stop();
      await settle();
      expect(reply().stopped).toBe(true);
      expect(reply().sources).toBeUndefined();

      const lost = await open(streams, 'three');
      await lost.emit('text', { delta: 'Half' });
      await lost.close();
      expect(reply().error).toContain('Connection lost');
      expect(reply().sources).toBeUndefined();
    });

    it('treats a done event without sources, from an older API, as no sources', async () => {
      const streams = fakeFetch();
      const stream = await open(streams, 'one');
      await stream.emit('done', { interactionId: 'int-1', usage: null } as never);
      await stream.close();
      expect(reply().sources).toEqual([]);
      expect(reply().error).toBeUndefined();
    });

    it('clears them with the messages on New chat and on a product change', async () => {
      const streams = fakeFetch();
      const first = await open(streams, 'one');
      await first.emit('done', done('int-1', [DATA_SHEET]));
      await first.close();
      chat.newChat();
      expect(chat.messages()).toEqual([]);

      const second = await open(streams, 'two');
      await second.emit('done', done('int-2', [DATA_SHEET]));
      await second.close();
      expect(reply().sources).toEqual([DATA_SHEET]);
      chat.selectProduct(PRODUCTS[0]);
      expect(chat.messages()).toEqual([]);

      const third = await open(streams, 'three');
      await third.emit('done', done('int-3'));
      await third.close();
      expect(sources()).toEqual([undefined, []]);
    });
  });
});
