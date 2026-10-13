/** Body of POST /api/chat/stream. */
export interface ChatRequest {
  /** The user's message. 1 to 2000 characters. */
  message: string;
  /** `interactionId` from the previous turn's `done` event, to continue that conversation. */
  previousInteractionId?: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type ChatErrorCode =
  | 'not_configured'
  | 'rate_limited'
  | 'invalid_request'
  | 'tool_limit'
  | 'model_error';

/** Server-sent events on the chat stream. `event:` is the key, `data:` is the JSON value. */
export interface ChatEventMap {
  start: Record<string, never>;
  tool: { name: string; status: 'started' | 'finished' };
  text: { delta: string };
  done: { interactionId: string; usage: ChatUsage | null };
  error: { code: ChatErrorCode; message: string };
}

export type ChatEventName = keyof ChatEventMap;

export type ChatEvent = {
  [K in ChatEventName]: { event: K; data: ChatEventMap[K] };
}[ChatEventName];

/** JSON body of a non-stream error response, such as HTTP 429. */
export interface ChatErrorBody {
  code: ChatErrorCode;
  message: string;
}
