import type { FactoryProvider } from '@nestjs/common';
import Anthropic, {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  RetryableError,
  UnprocessableEntityError,
} from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream.mjs';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  MessageCreateParamsStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { ClaudeConversations } from './claude-conversations.js';
import type { ChatModel, RoundEnd, RoundUsage, ToolOutput } from './provider.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { chatTools } from './tools/index.js';
import type { ChatTool } from './tools/tool.js';

/*
 * Claude through the Messages API (beta path, for the refusal fallback), streamed.
 * The request shape follows the claude-api skill: typescript/claude-api/streaming.md and
 * tool-use.md (streaming manual loop), shared/tool-use-concepts.md (eager input
 * streaming), shared/prompt-caching.md (tools + system breakpoint, automatic tail) and
 * shared/model-migration.md (Claude Sonnet 5.5, Haiku 5.5 and Opus 5.5: adaptive thinking
 * at low effort for chat, append-only history, `fallbacks: "default"` where the model has it).
 */

export type ClaudeRequest = Omit<MessageCreateParamsStreaming, 'stream'>;

/**
 * The one place the app calls Claude: open a streamed message. This is the seam the tests
 * replace with a fake. `signal` aborts the upstream HTTP request.
 */
export type ClaudeStream = (request: ClaudeRequest, signal: AbortSignal) => BetaMessageStream;

/** Injects a `ClaudeStream`, or `null` when no API key is configured. */
export const CLAUDE_STREAM = Symbol('CLAUDE_STREAM');

/**
 * One SDK client per process, created only when a key is configured. The key is passed
 * explicitly and `authToken` is cleared, so the SDK never falls back to environment
 * variables or `ant` profiles: no key in the config means Claude is not configured.
 * The SDK's default retries (429, 5xx, connection errors) stay on.
 */
export const claudeStreamProvider: FactoryProvider<ClaudeStream | null> = {
  provide: CLAUDE_STREAM,
  inject: [appConfig.KEY],
  useFactory: (config: AppConfig) => {
    if (config.anthropicApiKey === undefined) return null;
    const client = new Anthropic({ apiKey: config.anthropicApiKey, authToken: null });
    return (request, signal) => client.beta.messages.stream(request, { signal });
  },
};

/**
 * Room for adaptive thinking plus the reply. Answers here are short, but thinking counts
 * against this too, and a streamed request has no timeout reason to go lower (skill:
 * "max_tokens defaults", ~64000 for streaming).
 */
export const CLAUDE_MAX_TOKENS = 64000;

/**
 * The tool declarations in Claude's shape. The one conversion from the Gemini-shaped
 * declarations in `tools/*.tool.ts`, so both providers always get the same tools.
 * `eager_input_streaming`: the skill's default for streamed requests with client tools;
 * the inputs are then validated here (`ChatService.runTool` and each tool's own checks).
 */
export function toClaudeTool(declaration: ChatTool['declaration']): BetaTool {
  return {
    name: declaration.name,
    description: declaration.description,
    input_schema: declaration.parameters as BetaTool['input_schema'],
    eager_input_streaming: true,
  };
}

/** Built once: the same bytes on every request keep the cached prefix valid. */
const CLAUDE_TOOLS = chatTools.map((tool) => toClaudeTool(tool.declaration));

/**
 * The models that take the server-side refusal fallback in its `"default"` form (beta
 * `server-side-fallback-2026-07-01`, Claude API only). Skill, shared/model-migration.md:
 * Claude Sonnet 5.5 ("Safeguards and fallback": the "default" form only) and Claude Opus
 * 5.5 ("Safeguards": "Ship the opt-in from day one"). Claude Haiku 5.5 has none ("there is
 * no server-side fallback ... don't add the `fallbacks` parameter"), and an operator's
 * unlisted `CLAUDE_MODEL` gets none either, since nothing says it accepts one.
 */
const SERVER_FALLBACK_MODELS: ReadonlySet<string> = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);

export function hasServerFallback(model: string): boolean {
  return SERVER_FALLBACK_MODELS.has(model);
}

/**
 * Builds every Claude request. Tools, system prompt and settings go out on every call, in
 * the same order, so the cached prefix (tools, then system) matches byte for byte.
 *
 * The same shape for every allowed model except the fallback. No `thinking` field: all
 * three run adaptive thinking with display omitted when it is left out, and `disabled` or
 * `budget_tokens` is a 400 on each. Effort `low` on all three, set explicitly: the skill's
 * starting point for chat on Sonnet 5.5 and Haiku 5.5, and the TTFT setting on Opus 5.5
 * (whose default would be `medium`). `tool_choice` stays the default `auto`: forced tool
 * use is a 400 on Sonnet 5.5 and Opus 5.5.
 */
export function buildClaudeRequest(params: { model: string; messages: BetaMessageParam[] }): ClaudeRequest {
  return {
    model: params.model,
    max_tokens: CLAUDE_MAX_TOKENS,
    output_config: { effort: 'low' },
    tools: CLAUDE_TOOLS,
    // Breakpoint on the system prompt caches tools + system; the top-level automatic
    // breakpoint caches the growing conversation.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
    messages: params.messages,
    ...(hasServerFallback(params.model)
      ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
      : {}),
  };
}

/** Whether a stored history holds a `fallback` marker from a refusal fallback. */
function hasFallbackBlock(messages: BetaMessageParam[]): boolean {
  return messages.some(
    (message) => Array.isArray(message.content) && message.content.some((block) => block.type === 'fallback'),
  );
}

function toToolResult({ call, ok, body }: ToolOutput): BetaToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: call.id, content: body, ...(ok ? {} : { is_error: true }) };
}

/**
 * The assistant turn as it goes back into the history: the response content unchanged,
 * thinking blocks included. The one exception is the skill's rule for a mid-output
 * refusal fallback: before the last `fallback` block only text (and the fallback markers)
 * is echoed; thinking and tool_use blocks of the declined model are left out.
 */
export function historyContent(content: BetaContentBlock[]): BetaContentBlockParam[] {
  const boundary = content.findLastIndex((block) => block.type === 'fallback');
  return content.filter(
    (block, index) => index >= boundary || block.type === 'text' || block.type === 'fallback',
  ) as BetaContentBlockParam[];
}

/** Input, output and cached tokens, over every attempt when a fallback model also ran. */
function usageOf(message: BetaMessage): RoundUsage {
  const attempts = message.usage.iterations?.filter(
    (entry) => entry.type === 'message' || entry.type === 'fallback_message',
  );
  const parts = attempts && attempts.length > 0 ? attempts : [message.usage];
  let input = 0;
  let output = 0;
  let cached = 0;
  for (const part of parts) {
    cached += part.cache_read_input_tokens ?? 0;
    input += part.input_tokens + (part.cache_creation_input_tokens ?? 0) + (part.cache_read_input_tokens ?? 0);
    output += part.output_tokens;
  }
  return { inputTokens: input, outputTokens: output, totalTokens: input + output, cachedInputTokens: cached };
}

/** The SDK error's class name, most specific first (skill: shared/error-codes.md). Never the message. */
export function claudeErrorName(error: unknown): string {
  const classes = [
    ['NotFoundError', NotFoundError],
    ['RateLimitError', RateLimitError],
    ['AuthenticationError', AuthenticationError],
    ['PermissionDeniedError', PermissionDeniedError],
    ['BadRequestError', BadRequestError],
    ['UnprocessableEntityError', UnprocessableEntityError],
    ['InternalServerError', InternalServerError],
    ['APIConnectionTimeoutError', APIConnectionTimeoutError],
    ['APIConnectionError', APIConnectionError],
    ['APIError', APIError],
    ['AnthropicError', AnthropicError],
  ] as const;
  const match = classes.find(([, type]) => error instanceof type);
  return match ? match[0] : error instanceof Error ? error.name : 'unknown';
}

/**
 * The SDK's own error for tool input JSON it could not parse at all (eager input
 * streaming). The block never completed, so there is no tool_use id to answer: the
 * skill says to re-issue the request. API errors are never this.
 */
function isToolInputJsonError(error: unknown): boolean {
  return error instanceof AnthropicError && !(error instanceof APIError) && !(error instanceof RetryableError);
}

/**
 * Claude behind the provider seam. The API is stateless, so the conversation is kept in
 * `ClaudeConversations`; a turn's messages are stored only when the turn is answered, so
 * a failed, refused, cut-off or aborted turn leaves the stored history as it was.
 *
 * A stored conversation continues on whichever Claude model the turn uses. Skill,
 * shared/preserved-thinking-migration/causes.md: "a model switch does not fail a request";
 * thinking blocks the new model cannot read are dropped by the API, unbilled, and the
 * history is sent unchanged ("never strip thinking on a switch"). The one exception: a
 * history holding a `fallback` marker is not sent to a model without the fallback beta
 * (the skill does not document that request), so that turn starts fresh.
 */
export function claudeModel(stream: ClaudeStream, conversations: ClaudeConversations): ChatModel {
  return {
    id: 'claude',
    startTurn(model, conversationId) {
      const found = conversations.get(conversationId);
      const stored =
        found !== undefined && !hasServerFallback(model) && hasFallbackBlock(found) ? undefined : found;
      const id = stored === undefined ? undefined : conversationId;
      const history = stored ?? [];
      // This turn's messages, appended in order and never edited.
      const pending: BetaMessageParam[] = [];

      return {
        continued: stored !== undefined,
        async *round(input, signal) {
          pending.push({
            role: 'user',
            content: typeof input === 'string' ? input : input.map(toToolResult),
          });

          let message: BetaMessage | undefined;
          let textSent = false;
          for (let attempt = 0; message === undefined; attempt += 1) {
            try {
              const events = stream(buildClaudeRequest({ model, messages: [...history, ...pending] }), signal);
              for await (const event of events) {
                // Only text reaches the user; thinking, tool input and fallback markers do not.
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                  textSent = true;
                  yield { type: 'text', delta: event.delta.text };
                }
              }
              message = await events.finalMessage();
            } catch (error) {
              if (signal.aborted) throw error;
              // Re-issue once on unparseable tool input, unless text already reached the user.
              if (attempt === 0 && !textSent && isToolInputJsonError(error)) continue;
              yield { type: 'end', end: { stop: 'failed', detail: claudeErrorName(error) }, usage: null };
              return;
            }
          }

          const usage = usageOf(message);
          const end = (result: RoundEnd) => ({ type: 'end' as const, end: result, usage });
          const content = historyContent(message.content);

          // Checked before anything runs: a cut-off or refused turn never runs its tools.
          switch (message.stop_reason) {
            case 'tool_use': {
              const calls = content.flatMap((block) =>
                block.type === 'tool_use' ? [{ id: block.id, name: block.name, args: block.input }] : [],
              );
              if (calls.length === 0) {
                yield end({ stop: 'failed', detail: 'tool_use_without_calls' });
                return;
              }
              pending.push({ role: 'assistant', content });
              yield end({ stop: 'tool_calls', calls });
              return;
            }
            case 'end_turn': {
              if (!content.some((block) => block.type === 'text' && block.text !== '')) {
                yield end({ stop: 'failed', detail: 'no_text' });
                return;
              }
              pending.push({ role: 'assistant', content });
              yield end({ stop: 'answered', conversationId: conversations.save(id, [...history, ...pending]) });
              return;
            }
            case 'max_tokens':
              yield end({ stop: 'truncated' });
              return;
            case 'refusal':
              // The category only; the explanation text is never logged.
              yield end({ stop: 'refused', detail: `refusal_${message.stop_details?.category ?? 'none'}` });
              return;
            default:
              // pause_turn (no server tools here), stop_sequence, or anything new.
              yield end({ stop: 'failed', detail: `stop_${message.stop_reason ?? 'none'}` });
          }
        },
      };
    },
  };
}
