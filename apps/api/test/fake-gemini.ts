import type { GeminiEvent, GeminiRequest, GeminiStream } from '../src/chat/gemini.js';

/**
 * A stand-in for the Gemini Interactions stream, for tests. The event shapes are copied
 * from the example payloads in https://ai.google.dev/gemini-api/docs/streaming
 * ("Event types" and "Streaming with function calling"), not observed from a live call.
 */

const USAGE = { total_input_tokens: 7, total_output_tokens: 12, total_tokens: 19 };

function open(id: string): GeminiEvent[] {
  return [
    {
      event_type: 'interaction.created',
      interaction: { id, model: 'gemini-3.8-flash', status: 'in_progress', object: 'interaction' },
    },
    { event_type: 'interaction.status_update', interaction_id: id, status: 'in_progress' },
  ];
}

function close(id: string, status: string): GeminiEvent {
  return { event_type: 'interaction.completed', interaction: { id, status, usage: USAGE } };
}

/** A turn that answers with text, one delta per chunk. */
export function textTurn(id: string, chunks: string[], status = 'completed'): GeminiEvent[] {
  return [
    ...open(id),
    { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
    ...chunks.map(
      (text): GeminiEvent => ({ event_type: 'step.delta', index: 0, delta: { type: 'text', text } }),
    ),
    { event_type: 'step.stop', index: 0 },
    close(id, status),
  ];
}

/**
 * A turn that asks for function calls and ends with `requires_action`. A thought step
 * comes first, as with a thinking model, and each call's arguments arrive as a partial
 * JSON string split over two deltas.
 */
export function functionCallTurn(
  id: string,
  calls: { id: string; name: string; argumentsJson: string }[],
): GeminiEvent[] {
  const events: GeminiEvent[] = [
    ...open(id),
    { event_type: 'step.start', index: 0, step: { type: 'thought', signature: '' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'thought_signature', signature: 'c2ln' } },
    { event_type: 'step.stop', index: 0 },
  ];
  calls.forEach((call, i) => {
    const index = i + 1;
    const half = Math.ceil(call.argumentsJson.length / 2);
    events.push(
      {
        event_type: 'step.start',
        index,
        step: { type: 'function_call', id: call.id, name: call.name, arguments: {} },
      },
      {
        event_type: 'step.delta',
        index,
        delta: { type: 'arguments_delta', arguments: call.argumentsJson.slice(0, half) },
      },
      {
        event_type: 'step.delta',
        index,
        delta: { type: 'arguments_delta', arguments: call.argumentsJson.slice(half) },
      },
      { event_type: 'step.stop', index },
    );
  });
  events.push(close(id, 'requires_action'));
  return events;
}

/** The in-stream error event, as in the streaming guide's `error` example. */
export function errorTurn(id: string): GeminiEvent[] {
  return [
    ...open(id),
    {
      event_type: 'error',
      error: { message: 'Deadline expired before operation could complete.', code: 'gateway_timeout' },
    },
  ];
}

/**
 * Builds a fake `GeminiStream` that plays one scripted turn per call (repeating the last
 * one when the script runs out) and records every request it was given.
 */
export function fakeGemini(...turns: GeminiEvent[][]) {
  const requests: GeminiRequest[] = [];
  const stream: GeminiStream = async (request) => {
    const turn = turns[Math.min(requests.length, turns.length - 1)] ?? [];
    requests.push(request);
    return (async function* () {
      yield* turn;
    })();
  };
  return { stream, requests };
}
