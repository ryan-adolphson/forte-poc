import { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream.mjs';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { ClaudeRequest, ClaudeStream } from '../src/chat/claude.js';

/**
 * A stand-in for the Claude Messages stream, for tests. The events follow the raw SSE
 * shapes in the claude-api skill (typescript/claude-api/streaming.md: "Raw SSE Format",
 * "Stream Event Types" and "Handling Different Content Types"; shared/tool-use-concepts.md:
 * "Eager input streaming" for content_block_start -> input_json_delta -> content_block_stop
 * on tool_use; shared/model-migration.md for `stop_details` and `fallback` blocks), not
 * observed from a live call. They are fed to the SDK's own `BetaMessageStream`, so the
 * real accumulation (finalMessage, tool input parsing) runs in the tests.
 */

type Event = BetaRawMessageStreamEvent;

const USAGE = { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 2, output_tokens: 1 };

function start(id: string): Event {
  return {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: USAGE,
    },
  } as unknown as Event;
}

function stop(stopReason: string, stopDetails: object | null = null): Event[] {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null, stop_details: stopDetails },
      usage: { output_tokens: 12 },
    } as unknown as Event,
    { type: 'message_stop' },
  ];
}

/** A thinking block as Claude Sonnet 5.5 streams it by default: display omitted, text empty. */
function thinking(index: number, signature: string): Event[] {
  return [
    { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } },
    { type: 'content_block_stop', index },
  ] as Event[];
}

function text(index: number, chunks: string[]): Event[] {
  return [
    { type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } },
    ...chunks.map((chunk) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: chunk } })),
    { type: 'content_block_stop', index },
  ] as Event[];
}

/** A turn that answers with text after a thinking block. */
export function claudeTextTurn(id: string, chunks: string[], stopReason = 'end_turn', stopDetails: object | null = null): Event[] {
  return [start(id), ...thinking(0, `sig_${id}`), ...text(1, chunks), ...stop(stopReason, stopDetails)];
}

/**
 * A turn that asks for tool calls: a thinking block, then one tool_use block per call
 * whose input arrives as partial JSON split over two deltas (eager input streaming).
 */
export function claudeToolTurn(id: string, calls: { id: string; name: string; argumentsJson: string }[]): Event[] {
  const events: Event[] = [start(id), ...thinking(0, `sig_${id}`)];
  calls.forEach((call, i) => {
    const index = i + 1;
    const half = Math.ceil(call.argumentsJson.length / 2);
    events.push(
      { type: 'content_block_start', index, content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} } },
      { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: call.argumentsJson.slice(0, half) } },
      { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: call.argumentsJson.slice(half) } },
      { type: 'content_block_stop', index },
    );
  });
  return [...events, ...stop('tool_use')];
}

/**
 * Turns events into the SDK's stream, the way it reads a stream it was handed. With
 * `hangAfter`, the body waits for `signal` to abort after that many events; with
 * `failWith`, the first read fails with that error (as when the HTTP call fails).
 */
export function toStream(events: Event[], signal?: AbortSignal, hangAfter?: number, failWith?: Error): BetaMessageStream {
  const lines = events.map((event) => `${JSON.stringify(event)}\n`);
  let at = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (failWith) throw failWith;
      if (hangAfter !== undefined && at >= hangAfter) {
        // Like fetch: the read rejects once the signal aborts.
        await new Promise((_resolve, reject) => {
          if (signal?.aborted) reject(signal.reason as Error);
          signal?.addEventListener('abort', () => reject(signal.reason as Error));
        });
      }
      if (at < lines.length) controller.enqueue(new TextEncoder().encode(lines[at++]));
      else controller.close();
    },
  });
  return BetaMessageStream.fromReadableStream(body);
}

/**
 * Builds a fake `ClaudeStream` that plays one scripted turn per call (repeating the last
 * one when the script runs out) and records a copy of every request it was given.
 */
export function fakeClaude(...turns: Event[][]) {
  const requests: ClaudeRequest[] = [];
  const stream: ClaudeStream = (request) => {
    const turn = turns[Math.min(requests.length, turns.length - 1)] ?? [];
    requests.push(structuredClone(request));
    return toStream(turn);
  };
  return { stream, requests };
}
