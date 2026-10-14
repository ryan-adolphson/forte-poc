import type { FactoryProvider } from '@nestjs/common';
import { GoogleGenAI, type Interactions } from '@google/genai';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { CLAUDE_CONVERSATION_PREFIX } from './claude-conversations.js';
import { UNPARSEABLE, type ChatModel, type RoundEnd, type RoundInput, type RoundUsage, type ToolCall } from './provider.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { chatTools } from './tools/index.js';

export type GeminiRequest = Interactions.CreateModelInteractionParamsStreaming & { stream: true };
export type GeminiEvent = Interactions.InteractionSSEEvent;

/**
 * The one place the app calls Gemini: start a streamed interaction. This is the seam the
 * tests replace with a fake. `signal` aborts the upstream HTTP request.
 */
export type GeminiStream = (
  request: GeminiRequest,
  signal: AbortSignal,
) => Promise<AsyncIterable<GeminiEvent>>;

/** Injects a `GeminiStream`, or `null` when no API key is configured. */
export const GEMINI_STREAM = Symbol('GEMINI_STREAM');

/** One SDK client per process, created only when a key is configured. */
export const geminiStreamProvider: FactoryProvider<GeminiStream | null> = {
  provide: GEMINI_STREAM,
  inject: [appConfig.KEY],
  useFactory: (config: AppConfig) => {
    if (config.geminiApiKey === undefined) return null;
    const client = new GoogleGenAI({ apiKey: config.geminiApiKey });
    return (request, signal) => client.interactions.create(request, { signal });
  },
};

/**
 * Builds every Interactions API request. The system instruction and tools apply to one
 * interaction only (they are not carried over by `previous_interaction_id`), so they go
 * out on every call, including the calls that return function results.
 */
export function buildGeminiRequest(params: {
  model: string;
  /** The user's message, or the function results answering the previous interaction. */
  input: string | Interactions.FunctionResultStep[];
  previousInteractionId?: string;
}): GeminiRequest {
  return {
    model: params.model,
    system_instruction: SYSTEM_PROMPT,
    tools: chatTools.map((tool) => tool.declaration),
    input: params.input,
    ...(params.previousInteractionId === undefined
      ? {}
      : { previous_interaction_id: params.previousInteractionId }),
    // Conversations are kept by Google so the next turn can continue by id (see CLAUDE.md).
    store: true,
    stream: true,
  };
}

function toGeminiInput(input: RoundInput): string | Interactions.FunctionResultStep[] {
  if (typeof input === 'string') return input;
  return input.map(({ call, ok, body }) => ({
    type: 'function_result',
    name: call.name,
    call_id: call.id,
    is_error: !ok,
    result: [{ type: 'text', text: body }],
  }));
}

type PendingCall = { id: string; name: string; json: string; initial: Record<string, unknown> };

function toToolCall(call: PendingCall): ToolCall {
  if (call.json === '') return { id: call.id, name: call.name, args: call.initial };
  try {
    return { id: call.id, name: call.name, args: JSON.parse(call.json) as unknown };
  } catch {
    return { id: call.id, name: call.name, args: UNPARSEABLE };
  }
}

/**
 * The conversation id handed to the client (`done.interactionId`): the model, then
 * Google's interaction id, so the next turn knows which model the conversation is on.
 */
export function geminiConversationId(model: string, interactionId: string): string {
  return `${model}:${interactionId}`;
}

/**
 * Google's interaction id to continue from, or undefined to start fresh: when there is
 * no id, when it is not one of ours (a Claude id, or one from before the model was part
 * of the id), or when it was written by a different model. The Interactions docs do not
 * say whether `previous_interaction_id` may cross models, so it never does.
 */
export function continuedInteraction(model: string, conversationId: string | undefined): string | undefined {
  if (conversationId === undefined || conversationId.startsWith(CLAUDE_CONVERSATION_PREFIX)) return undefined;
  const separator = conversationId.indexOf(':');
  if (separator <= 0 || conversationId.slice(0, separator) !== model) return undefined;
  const interactionId = conversationId.slice(separator + 1);
  return interactionId === '' ? undefined : interactionId;
}

/**
 * Gemini behind the provider seam. The conversation lives on Google's side
 * (`store: true`); each round continues it with `previous_interaction_id`. The three
 * allowed models take the same request (the skill: "Model upgrades: Drop-in, swap the
 * model string"), so the model id is the only difference.
 */
export function geminiModel(stream: GeminiStream): ChatModel {
  return {
    id: 'gemini',
    startTurn(model, conversationId) {
      let previousInteractionId = continuedInteraction(model, conversationId);
      return {
        continued: previousInteractionId !== undefined,
        async *round(input, signal) {
          let interactionId: string | undefined;
          let status: string | undefined;
          let answered = false;
          let usage: RoundUsage | null = null;
          const calls = new Map<number, PendingCall>();
          const end = (result: RoundEnd) => ({ type: 'end' as const, end: result, usage });

          const events = await stream(
            buildGeminiRequest({ model, input: toGeminiInput(input), previousInteractionId }),
            signal,
          );
          for await (const event of events) {
            switch (event.event_type) {
              case 'interaction.created':
                interactionId = event.interaction.id;
                break;
              case 'interaction.status_update':
                status = event.status;
                break;
              case 'step.start':
                if (event.step.type === 'function_call') {
                  calls.set(event.index, {
                    id: event.step.id,
                    name: event.step.name,
                    json: '',
                    initial: event.step.arguments,
                  });
                }
                break;
              case 'step.delta':
                if (event.delta.type === 'text') {
                  answered = true;
                  yield { type: 'text', delta: event.delta.text };
                } else if (event.delta.type === 'arguments_delta') {
                  const call = calls.get(event.index);
                  if (call) call.json += event.delta.arguments ?? '';
                }
                // Thought, signature and other deltas stay on Google's side (store: true).
                break;
              case 'interaction.completed': {
                interactionId = event.interaction.id;
                status = event.interaction.status;
                const reported = event.interaction.usage;
                if (reported) {
                  usage = {
                    inputTokens: reported.total_input_tokens ?? 0,
                    outputTokens: reported.total_output_tokens ?? 0,
                    totalTokens: reported.total_tokens ?? 0,
                    cachedInputTokens: reported.total_cached_tokens ?? 0,
                  };
                }
                break;
              }
              case 'error':
                // The provider's message is not shown to the user and not logged: it may echo input.
                yield end({ stop: 'failed', detail: event.error?.code ?? 'stream_error' });
                return;
              default:
                // New event types may appear; skip what we do not know.
                break;
            }
          }

          if (status === 'requires_action' && calls.size > 0 && interactionId !== undefined) {
            previousInteractionId = interactionId;
            yield end({ stop: 'tool_calls', calls: [...calls.values()].map(toToolCall) });
          } else if (status === 'completed' && answered && interactionId !== undefined) {
            yield end({ stop: 'answered', conversationId: geminiConversationId(model, interactionId) });
          } else if (status === 'incomplete') {
            // Output limit reached: the text already sent is not a whole answer.
            yield end({ stop: 'truncated' });
          } else {
            // failed, cancelled, a stream that ended early, or a "completed" turn with no
            // text at all (for example a blocked response).
            yield end({ stop: 'failed', detail: answered ? (status ?? 'no_status') : 'no_text' });
          }
        },
      };
    },
  };
}
