import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Interactions } from '@google/genai';
import type { ChatErrorCode, ChatEvent, ChatRequest, ChatUsage } from '@forte/chat-contract';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { DocumentsService } from '../documents/documents.service.js';
import { ProductsService } from '../products/products.service.js';
import { buildGeminiRequest, GEMINI_STREAM, type GeminiStream } from './gemini.js';
import { selectSources, type SourceCandidate } from './sources.js';
import { withProductContext } from './system-prompt.js';
import { chatTools } from './tools/index.js';
import type { ToolResult } from './tools/tool.js';

/** Most rounds of tool calls in one user turn before the turn is stopped. */
export const MAX_TOOL_ROUNDS = 5;

/** User-facing error messages. They never contain provider details. */
const ERROR_MESSAGES: Record<Exclude<ChatErrorCode, 'rate_limited' | 'invalid_request'>, string> = {
  not_configured: 'The assistant is not configured yet. Please try again later.',
  tool_limit: 'That question needed too many lookups to answer. Please ask something more specific.',
  model_error: 'The assistant could not answer just now. Please try again.',
};
const TRUNCATED_MESSAGE = 'The answer was cut off before it was complete. Please ask again or narrow the question.';

type PendingCall = { id: string; name: string; json: string; initial: Record<string, unknown> };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(appConfig.KEY) private readonly config: AppConfig,
    @Inject(GEMINI_STREAM) private readonly gemini: GeminiStream | null,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}

  /**
   * Runs one user turn and yields the contract's events: `start`, then `tool` and `text`
   * events, then exactly one `done` (with the answer's sources) or `error`. Never throws. When `signal` aborts (the
   * client went away) the upstream request is aborted and the generator just ends.
   */
  async *run(request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    const startedAt = Date.now();
    const toolNames: string[] = [];
    // What the tools returned in this turn, and the answer so far: `done` cites from these.
    const candidates: SourceCandidate[] = [];
    let answer = '';
    const usage: ChatUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let usageReported = false;
    let rounds = 0;
    let outcome = 'model_error';
    let productContext = false;

    // `detail` goes to the log line only; the user sees the fixed message.
    const fail = (
      code: keyof typeof ERROR_MESSAGES,
      detail?: string,
      message = ERROR_MESSAGES[code],
    ): ChatEvent => {
      outcome = detail === undefined ? code : `${code}:${detail}`;
      return { event: 'error', data: { code, message } };
    };

    try {
      yield { event: 'start', data: {} };
      if (this.gemini === null) {
        yield fail('not_configured');
        return;
      }

      let input: string | Interactions.FunctionResultStep[] = request.message;
      if (request.productSku) {
        // getBySku returns null for hidden and unknown SKUs alike; both then run exactly
        // like a turn with no productSku. Only the database's sku and name are used.
        const viewed = await this.products.getBySku(request.productSku);
        if (viewed !== null) {
          input = withProductContext(viewed, request.message);
          productContext = true;
        }
      }
      let previousInteractionId = request.previousInteractionId;
      let answered = false;

      for (;;) {
        let interactionId: string | undefined;
        let status: string | undefined;
        const calls = new Map<number, PendingCall>();

        const stream = await this.gemini(
          buildGeminiRequest({ model: this.config.geminiModel, input, previousInteractionId }),
          signal,
        );
        for await (const event of stream) {
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
                answer += event.delta.text;
                yield { event: 'text', data: { delta: event.delta.text } };
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
                usageReported = true;
                usage.inputTokens += reported.total_input_tokens ?? 0;
                usage.outputTokens += reported.total_output_tokens ?? 0;
                usage.totalTokens += reported.total_tokens ?? 0;
              }
              break;
            }
            case 'error':
              // The provider's message is not shown to the user and not logged: it may echo input.
              yield fail('model_error', event.error?.code ?? 'stream_error');
              return;
            default:
              // New event types may appear; skip what we do not know.
              break;
          }
        }

        if (status === 'requires_action' && calls.size > 0 && interactionId !== undefined) {
          if (rounds >= MAX_TOOL_ROUNDS) {
            yield fail('tool_limit');
            return;
          }
          rounds += 1;
          const results: Interactions.FunctionResultStep[] = [];
          for (const call of calls.values()) {
            toolNames.push(call.name);
            yield { event: 'tool', data: { name: call.name, status: 'started' } };
            const result = await this.runTool(call);
            yield { event: 'tool', data: { name: call.name, status: 'finished' } };
            if (result.ok && result.sources) candidates.push(...result.sources);
            results.push({
              type: 'function_result',
              name: call.name,
              call_id: call.id,
              is_error: !result.ok,
              result: [
                { type: 'text', text: JSON.stringify(result.ok ? result.data : { error: result.error }) },
              ],
            });
          }
          signal.throwIfAborted();
          input = results;
          previousInteractionId = interactionId;
          continue;
        }

        if (status === 'completed' && answered && interactionId !== undefined) {
          outcome = 'done';
          yield {
            event: 'done',
            data: {
              interactionId,
              usage: usageReported ? usage : null,
              sources: selectSources(answer, candidates),
            },
          };
        } else if (status === 'incomplete') {
          // Output limit reached: the text already sent is not a whole answer.
          yield fail('model_error', 'incomplete', TRUNCATED_MESSAGE);
        } else {
          // failed, cancelled, a stream that ended early, or a "completed" turn with no
          // text at all (for example a blocked response).
          yield fail('model_error', answered ? (status ?? 'no_status') : 'no_text');
        }
        return;
      }
    } catch (error) {
      if (signal.aborted) {
        outcome = 'aborted';
        return;
      }
      // Only the error's class name is logged: its message can carry request details.
      yield fail('model_error', error instanceof Error ? error.name : 'unknown');
    } finally {
      // One line per turn. No message text, no tool arguments or results, no key, and
      // no SKU: product_context only says whether a viewed product was found.
      this.logger.log(
        `turn model=${this.config.geminiModel} outcome=${outcome} rounds=${rounds} ` +
          `tools=[${toolNames.join(',')}] product_context=${productContext} input_tokens=${usage.inputTokens} ` +
          `output_tokens=${usage.outputTokens} total_tokens=${usage.totalTokens} ` +
          `duration_ms=${Date.now() - startedAt}`,
      );
    }
  }

  /** Runs one requested call. Every failure becomes a result the model can read. */
  private async runTool(call: PendingCall): Promise<ToolResult> {
    const tool = chatTools.find((candidate) => candidate.declaration.name === call.name);
    if (!tool) return { ok: false, error: `Unknown tool "${call.name}".` };

    let args: unknown = call.initial;
    if (call.json !== '') {
      try {
        args = JSON.parse(call.json);
      } catch {
        return { ok: false, error: 'The arguments were not valid JSON.' };
      }
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return { ok: false, error: 'The arguments must be a JSON object.' };
    }

    try {
      return await tool.run(args as Record<string, unknown>, this.products, this.documents);
    } catch (error) {
      this.logger.error(`tool ${call.name} failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return { ok: false, error: 'The lookup failed. Try again, or tell the user it is unavailable.' };
    }
  }
}
