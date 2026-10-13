import { Service, inject, signal } from '@angular/core';
import type { Product } from '@forte/chat-contract';
import { Chat } from './chat';

/** The right-hand chat panel of the shell: the chat about one product, opened from a page. */
@Service()
export class ChatDrawer {
  private readonly chat = inject(Chat);

  /** Whether the panel is open. The chat is rendered in it only while this is true. */
  readonly opened = signal(false);

  /**
   * Opens the panel about a product. The panel's code is loaded first, so the message box is
   * there when the panel has slid in and Material moves focus to it.
   */
  async ask(product: Product): Promise<void> {
    this.chat.selectProduct(product);
    await import('./chat-panel');
    this.opened.set(true);
  }
}
