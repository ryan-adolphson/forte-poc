import type { FactoryProvider } from '@nestjs/common';
import { GoogleGenAI, type Interactions } from '@google/genai';
import { appConfig, type AppConfig } from '../config/app.config.js';
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
