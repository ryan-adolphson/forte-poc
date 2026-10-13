import type { ChatEventMap, ChatEventName } from '@forte/chat-contract';

/** One faked `POST /api/chat/stream` exchange whose event stream the test drives by hand. */
export interface FakeStream {
  /** The parsed JSON body of the request. */
  readonly body: unknown;
  readonly signal: AbortSignal;
  emit<K extends ChatEventName>(event: K, data: ChatEventMap[K]): Promise<void>;
  /** Ends the response body, as a closed connection would. */
  close(): Promise<void>;
}

/** Lets pending promise callbacks (fetch, stream reads) run. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve));

/**
 * Replaces the global `fetch`. By default every call answers 200 with an open event stream, which
 * is appended to the returned array. Pass `respond` to answer a call some other way.
 */
export function fakeFetch(respond?: () => Response | Promise<Response>): FakeStream[] {
  const streams: FakeStream[] = [];
  const encoder = new TextEncoder();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (respond) {
        return respond();
      }
      const signal = init.signal as AbortSignal;
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
      // A real fetch fails the body read when the request is aborted.
      signal.addEventListener('abort', () =>
        controller.error(new DOMException('Aborted', 'AbortError')),
      );
      streams.push({
        body: JSON.parse(init.body as string),
        signal,
        emit: (event, data) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          return settle();
        },
        close: () => {
          controller.close();
          return settle();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }),
  );
  return streams;
}
