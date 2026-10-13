import { Component, inject } from '@angular/core';
import { Chat } from './chat';
import { ChatPanel } from './chat-panel';

/** The assistant as a page, for general questions: the chat with no product selected. */
@Component({
  imports: [ChatPanel],
  selector: 'app-forte-ai-page',
  template: `<app-chat-panel page />`,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
})
export class ForteAiPage {
  constructor() {
    // Coming from a product chat this starts a new conversation; a general one is kept.
    inject(Chat).selectProduct(null);
  }
}
