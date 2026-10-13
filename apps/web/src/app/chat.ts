import { Service, computed, signal } from '@angular/core';
import type { ChatErrorBody, ChatEvent, ChatRequest, Product } from '@forte/chat-contract';
import { SseMessage, SseParser } from './sse-parser';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Assistant only: why the turn failed. Any partial text is kept above it. */
  error?: string;
  /** Assistant only: sending the same question again may work. */
  retryable?: boolean;
  /** Assistant only: the user stopped the reply. */
  stopped?: boolean;
}

export type ChatStatus = 'idle' | 'sending' | 'streaming';

const TOOL_LABELS: Record<string, string> = {
  search_products: 'Searching the catalogue…',
  get_product: 'Looking up product details…',
  list_products: 'Listing the catalogue…',
  list_categories: 'Checking the product categories…',
};

const CONNECTION_LOST = 'Connection lost. The answer may be incomplete.';

@Service()
export class Chat {
  private readonly messagesState = signal<ChatMessage[]>([]);
  private readonly statusState = signal<ChatStatus>('idle');
  private readonly activityState = signal<string | null>(null);
  private readonly interactionIdState = signal<string | null>(null);
  private readonly productState = signal<Product | null>(null);

  readonly messages = this.messagesState.asReadonly();
  readonly status = this.statusState.asReadonly();
  /** What the assistant is doing right now, for example a catalogue lookup. */
  readonly activity = this.activityState.asReadonly();
  /** `interactionId` of the last completed turn; sent back to keep the conversation's context. */
  readonly interactionId = this.interactionIdState.asReadonly();
  readonly busy = computed(() => this.statusState() !== 'idle');
  /** The product the user is asking about, or null for a general chat. */
  readonly product = this.productState.asReadonly();

  private controller: AbortController | null = null;
  private lastQuestion = '';
  private nextId = 1;

  /**
   * Sets the product the chat is about. The server keeps the conversation history, so "it" in an
   * old conversation would still mean the earlier product: a different product (or none) starts
   * a new conversation. Selecting the same product again keeps the conversation.
   */
  selectProduct(product: Product | null): void {
    if (product?.sku !== this.productState()?.sku) {
      this.newChat();
    }
    this.productState.set(product);
  }

  async send(text: string): Promise<void> {
    const message = text.trim();
    if (!message || this.busy()) {
      return;
    }
    this.lastQuestion = message;
    this.messagesState.update((all) => [
      ...all,
      { id: this.nextId++, role: 'user', text: message },
    ]);
    await this.run(message);
  }

  /** Asks the last question again, replacing the failed reply. */
  async retry(): Promise<void> {
    const failed = this.messagesState().at(-1);
    if (this.busy() || failed?.role !== 'assistant' || !failed.error) {
      return;
    }
    this.messagesState.update((all) => all.slice(0, -1));
    await this.run(this.lastQuestion);
  }

  /** Stops the reply in progress. The partial text stays. */
  stop(): void {
    this.controller?.abort();
  }

  newChat(): void {
    this.controller?.abort();
    this.controller = null;
    this.messagesState.set([]);
    this.interactionIdState.set(null);
    this.activityState.set(null);
    this.statusState.set('idle');
  }

  private async run(message: string): Promise<void> {
    const id = this.nextId++;
    this.messagesState.update((all) => [...all, { id, role: 'assistant', text: '' }]);
    const controller = new AbortController();
    this.controller = controller;
    this.statusState.set('sending');

    try {
      const body: ChatRequest = { message };
      const previousInteractionId = this.interactionIdState();
      if (previousInteractionId) {
        body.previousInteractionId = previousInteractionId;
      }
      const productSku = this.productState()?.sku;
      if (productSku) {
        body.productSku = productSku;
      }
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        this.patch(id, await describeHttpError(response));
        return;
      }

      this.statusState.set('streaming');
      const reader = response.body.getReader();
      const parser = new SseParser();
      let ended = false;
      while (!ended) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) {
          this.patch(id, { stopped: true });
          return;
        }
        if (done) {
          break;
        }
        for (const sse of parser.push(value)) {
          ended = this.apply(id, sse) || ended;
        }
      }
      if (!ended) {
        this.patch(id, { error: CONNECTION_LOST, retryable: true });
      }
    } catch {
      this.patch(
        id,
        controller.signal.aborted ? { stopped: true } : { error: CONNECTION_LOST, retryable: true },
      );
    } finally {
      // After "New chat" or a newer turn, this turn no longer owns the shared state.
      if (this.controller === controller) {
        this.controller = null;
        this.activityState.set(null);
        this.statusState.set('idle');
      }
    }
  }

  /** Applies one stream event. Returns true when it was the last event of the turn. */
  private apply(id: number, sse: SseMessage): boolean {
    const event = { event: sse.event, data: JSON.parse(sse.data) } as ChatEvent;
    switch (event.event) {
      case 'tool':
        this.activityState.set(
          event.data.status === 'started' ? (TOOL_LABELS[event.data.name] ?? 'Working…') : null,
        );
        return false;
      case 'text':
        this.activityState.set(null);
        this.messagesState.update((all) =>
          all.map((m) => (m.id === id ? { ...m, text: m.text + event.data.delta } : m)),
        );
        return false;
      case 'done':
        this.interactionIdState.set(event.data.interactionId);
        return true;
      case 'error':
        this.patch(id, {
          error: event.data.message,
          retryable: event.data.code !== 'not_configured',
        });
        return true;
      default:
        return false; // `start`, or an event this client does not know
    }
  }

  private patch(id: number, change: Partial<ChatMessage>): void {
    this.messagesState.update((all) => all.map((m) => (m.id === id ? { ...m, ...change } : m)));
  }
}

async function describeHttpError(response: Response): Promise<Partial<ChatMessage>> {
  const body: unknown = await response.json().catch(() => null);

  if (response.status === 429) {
    const message = (body as ChatErrorBody | null)?.message ?? 'Too many messages.';
    const seconds = Number(response.headers.get('Retry-After'));
    const wait =
      seconds > 0
        ? ` Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
        : ' Try again shortly.';
    return { error: message + wait, retryable: true };
  }

  if (response.status === 400) {
    // Nest's validation body: { message: string[] | string, error, statusCode }
    const detail = (body as { message?: string[] | string } | null)?.message;
    const text = Array.isArray(detail) ? detail.join('; ') : detail;
    return { error: `The message was not accepted${text ? `: ${text}` : '.'}` };
  }

  return { error: `The server could not answer (HTTP ${response.status}).`, retryable: true };
}
