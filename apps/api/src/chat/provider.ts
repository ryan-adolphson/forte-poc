import type { ChatProviderId, ChatUsage } from '@forte/chat-contract';

/**
 * The seam between `ChatService` (product rules, tools, citations, logging) and a model
 * provider (`gemini.ts`, `claude.ts`). A provider only talks to its model: it runs one
 * model round at a time and says how that round stopped.
 */

/** Stands in for tool arguments that were not valid JSON. */
export const UNPARSEABLE = Symbol('unparseable tool arguments');

/** A tool call the model asked for. `args` is the parsed JSON value, or UNPARSEABLE. */
export type ToolCall = { id: string; name: string; args: unknown };

/** What one tool call returned. `body` is the JSON text the model reads, the same for every provider. */
export type ToolOutput = { call: ToolCall; ok: boolean; body: string };

/** A round starts from the user's message, or from the results of the previous round's tool calls. */
export type RoundInput = string | ToolOutput[];

/** How a round stopped. `detail` is for the log line only: no message text, no ids. */
export type RoundEnd =
  | { stop: 'answered'; /** Continues the conversation on the next turn (`done.interactionId`). */ conversationId: string }
  | { stop: 'tool_calls'; calls: ToolCall[] }
  | { stop: 'truncated' }
  | { stop: 'refused'; detail: string }
  | { stop: 'failed'; detail: string };

export type RoundUsage = ChatUsage & { cachedInputTokens: number };

/** Text deltas as they arrive, then exactly one `end`. */
export type RoundEvent =
  | { type: 'text'; delta: string }
  | { type: 'end'; end: RoundEnd; /** Null when the provider reported none. */ usage: RoundUsage | null };

/** One user turn: one or more rounds against the same conversation. */
export interface ModelTurn {
  /** Whether an earlier conversation was found and is being continued. */
  readonly continued: boolean;
  /** Throws only when `signal` aborts or on an unexpected failure. */
  round(input: RoundInput, signal: AbortSignal): AsyncIterable<RoundEvent>;
}

/**
 * One provider: one SDK client per process. The model id is chosen per turn (the Settings
 * page), so it is passed to `startTurn`, not fixed here.
 */
export interface ChatModel {
  readonly id: ChatProviderId;
  /**
   * `model` is the model id for this turn. `conversationId` is the `done.interactionId`
   * of an earlier turn, if the client sent one; a conversation the provider cannot
   * continue on `model` starts fresh (`continued: false`).
   */
  startTurn(model: string, conversationId: string | undefined): ModelTurn;
}

/** Every provider by id; null when it has no API key configured. */
export type ChatModels = Record<ChatProviderId, ChatModel | null>;

export const CHAT_MODELS = Symbol('CHAT_MODELS');
