import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AssistantSettings, ChatErrorCode, ChatEvent, ChatRequest, ChatUsage } from '@forte/chat-contract';
import { DocumentsService } from '../documents/documents.service.js';
import { ProductsService } from '../products/products.service.js';
import { AssistantSettingsResolver, type SettingSource } from './assistant-settings.js';
import {
  CHAT_MODELS,
  UNPARSEABLE,
  type ChatModels,
  type RoundEnd,
  type RoundInput,
  type ToolCall,
  type ToolOutput,
} from './provider.js';
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
const REFUSED_MESSAGE =
  "The assistant can't help with that request. Please ask about Forte's products and their data sheets.";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(CHAT_MODELS) private readonly models: ChatModels,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(AssistantSettingsResolver) private readonly assistant: AssistantSettingsResolver,
  ) {}

  /**
   * Runs one user turn and yields the contract's events: `start`, then `tool` and `text`
   * events, then exactly one `done` (with the answer's sources and the provider and model
   * that wrote it) or `error`. Never throws. When `signal` aborts (the client went away)
   * the upstream request is aborted and the generator just ends.
   *
   * The provider and model are the app-wide setting, read once at the start of the turn
   * (`AssistantSettingsResolver.resolve`), so every round of a turn uses the same model.
   * `override` replaces the setting for this turn only; the scope eval uses it.
   */
  async *run(request: ChatRequest, signal: AbortSignal, override?: AssistantSettings): AsyncGenerator<ChatEvent> {
    const startedAt = Date.now();
    let providerId = '-';
    let modelId = '-';
    let setting: SettingSource | 'override' | 'unread' = 'unread';
    const toolNames: string[] = [];
    // What the tools returned in this turn, and the answer so far: `done` cites from these.
    const candidates: SourceCandidate[] = [];
    let answer = '';
    const usage: ChatUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let cachedInputTokens = 0;
    let usageReported = false;
    let rounds = 0;
    let outcome = 'model_error';
    let productContext = false;
    let conversation = 'new';

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
      const resolved = override ? { current: override, source: 'override' as const } : await this.assistant.resolve();
      setting = resolved.source;
      const current = resolved.current;
      const model = current && this.models[current.provider];
      if (current === null || model === null) {
        yield fail('not_configured');
        return;
      }
      providerId = current.provider;
      modelId = current.model;

      let input: RoundInput = request.message;
      if (request.productSku) {
        // getBySku returns null for hidden and unknown SKUs alike; both then run exactly
        // like a turn with no productSku. Only the database's sku and name are used.
        const viewed = await this.products.getBySku(request.productSku);
        if (viewed !== null) {
          input = withProductContext(viewed, request.message);
          productContext = true;
        }
      }
      const turn = model.startTurn(current.model, request.previousInteractionId);
      conversation = turn.continued ? 'continued' : 'new';

      for (;;) {
        let end: RoundEnd = { stop: 'failed', detail: 'no_end' };
        for await (const event of turn.round(input, signal)) {
          if (event.type === 'text') {
            answer += event.delta;
            yield { event: 'text', data: { delta: event.delta } };
            continue;
          }
          end = event.end;
          if (event.usage) {
            usageReported = true;
            usage.inputTokens += event.usage.inputTokens;
            usage.outputTokens += event.usage.outputTokens;
            usage.totalTokens += event.usage.totalTokens;
            cachedInputTokens += event.usage.cachedInputTokens;
          }
        }

        switch (end.stop) {
          case 'tool_calls': {
            if (rounds >= MAX_TOOL_ROUNDS) {
              yield fail('tool_limit');
              return;
            }
            rounds += 1;
            const outputs: ToolOutput[] = [];
            for (const call of end.calls) {
              toolNames.push(call.name);
              yield { event: 'tool', data: { name: call.name, status: 'started' } };
              const result = await this.runTool(call);
              yield { event: 'tool', data: { name: call.name, status: 'finished' } };
              if (result.ok && result.sources) candidates.push(...result.sources);
              outputs.push({
                call,
                ok: result.ok,
                body: JSON.stringify(result.ok ? result.data : { error: result.error }),
              });
            }
            signal.throwIfAborted();
            input = outputs;
            continue;
          }
          case 'answered':
            outcome = 'done';
            yield {
              event: 'done',
              data: {
                interactionId: end.conversationId,
                usage: usageReported ? usage : null,
                sources: selectSources(answer, candidates),
                provider: current.provider,
                model: current.model,
              },
            };
            return;
          case 'truncated':
            // Output limit reached: the text already sent is not a whole answer.
            yield fail('model_error', 'truncated', TRUNCATED_MESSAGE);
            return;
          case 'refused':
            yield fail('model_error', end.detail, REFUSED_MESSAGE);
            return;
          case 'failed':
            yield fail('model_error', end.detail);
            return;
        }
      }
    } catch (error) {
      if (signal.aborted) {
        outcome = 'aborted';
        return;
      }
      // Only the error's class name is logged: its message can carry request details.
      yield fail('model_error', error instanceof Error ? error.name : 'unknown');
    } finally {
      // One line per turn. No message text, no tool arguments or results, no ids, no key,
      // and no SKU: product_context only says whether a viewed product was found.
      this.logger.log(
        `turn provider=${providerId} model=${modelId} setting=${setting} conversation=${conversation} ` +
          `outcome=${outcome} rounds=${rounds} tools=[${toolNames.join(',')}] product_context=${productContext} ` +
          `input_tokens=${usage.inputTokens} cached_input_tokens=${cachedInputTokens} ` +
          `output_tokens=${usage.outputTokens} total_tokens=${usage.totalTokens} ` +
          `duration_ms=${Date.now() - startedAt}`,
      );
    }
  }

  /** Runs one requested call. Every failure becomes a result the model can read. */
  private async runTool(call: ToolCall): Promise<ToolResult> {
    const tool = chatTools.find((candidate) => candidate.declaration.name === call.name);
    if (!tool) return { ok: false, error: `Unknown tool "${call.name}".` };

    const { args } = call;
    if (args === UNPARSEABLE) return { ok: false, error: 'The arguments were not valid JSON.' };
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
