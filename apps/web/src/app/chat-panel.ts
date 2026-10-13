import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Chat } from './chat';
import { ChatSources } from './chat-sources';
import { ProductCard } from './product-card';

const MAX_LENGTH = 2000;

@Component({
  imports: [
    ChatSources,
    FormField,
    CdkTextareaAutosize,
    MatButton,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
    MatProgressSpinner,
    ProductCard,
  ],
  selector: 'app-chat-panel',
  styleUrl: './chat-panel.css',
  templateUrl: './chat-panel.html',
})
export class ChatPanel {
  /** The user asked to close the panel. */
  readonly closed = output<void>();

  protected readonly chat = inject(Chat);

  protected readonly maxLength = MAX_LENGTH;
  /** Example questions for the empty state: about the selected product, or general ones. */
  protected readonly examples = computed(() =>
    this.chat.product()
      ? [
          'What are its key properties?',
          'Which standards does it meet?',
          'What is it used for?',
          'Which similar products do you have?',
        ]
      : [
          'What is the compressive strength of your C32/40 concrete?',
          'Which insulation has the lowest thermal conductivity?',
          'What timber products do you have?',
          'Compare your B500B rebar sizes.',
        ],
  );

  protected readonly model = signal({ message: '' });
  protected readonly chatForm = form(this.model, (path) => {
    maxLength(path.message, MAX_LENGTH);
  });

  protected readonly length = computed(() => this.model().message.length);
  protected readonly showCount = computed(() => this.length() >= MAX_LENGTH * 0.9);
  protected readonly canSend = computed(
    () =>
      !this.chat.busy() && this.model().message.trim().length > 0 && this.length() <= MAX_LENGTH,
  );

  /** Shown under the reply in progress: the running tool, or a placeholder until text arrives. */
  protected readonly statusLine = computed(() => {
    if (!this.chat.busy()) {
      return null;
    }
    return this.chat.activity() ?? (this.chat.messages().at(-1)?.text ? null : 'Thinking…');
  });

  /**
   * Text for the polite live region. It is empty while a reply is being written and becomes the
   * whole reply when the turn ends, so a screen reader hears each reply once, not every token.
   * The sources are only counted here; the list itself follows the answer in the page.
   */
  protected readonly announcement = computed(() => {
    const last = this.chat.messages().at(-1);
    if (this.chat.busy() || last?.role !== 'assistant') {
      return '';
    }
    const count = last.sources?.length ?? 0;
    const sources = count ? `${count} source${count === 1 ? '' : 's'}.` : '';
    const parts = [last.text, last.stopped ? 'Stopped.' : '', last.error ?? '', sources];
    return `Assistant: ${parts.filter(Boolean).join(' ')}`;
  });

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly input = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');
  /** Whether the user is at the newest content. Updated on scroll, read after each render. */
  private pinnedToBottom = true;

  constructor() {
    afterRenderEffect({
      write: () => {
        // Re-run whenever the conversation or the status line changes, and when the message box
        // grows or shrinks with its text, which changes the height left for the conversation.
        this.chat.messages();
        this.statusLine();
        this.length();
        if (this.pinnedToBottom) {
          const element = this.scroller().nativeElement;
          element.scrollTop = element.scrollHeight;
        }
      },
    });
  }

  protected onScroll(): void {
    const element = this.scroller().nativeElement;
    this.pinnedToBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  protected onEnter(event: Event): void {
    // `keydown.enter` matches plain Enter only, so Shift+Enter still makes a new line.
    if ((event as KeyboardEvent).isComposing) {
      return; // Enter while composing confirms the IME text.
    }
    event.preventDefault();
    this.submit();
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    if (this.canSend()) {
      const text = this.model().message;
      this.model.set({ message: '' });
      this.ask(text);
    }
  }

  protected ask(text: string): void {
    this.pinnedToBottom = true;
    void this.chat.send(text);
    this.focusInput();
  }

  protected retry(): void {
    this.pinnedToBottom = true;
    void this.chat.retry();
    this.focusInput();
  }

  protected stop(): void {
    this.chat.stop();
    this.focusInput();
  }

  protected newChat(): void {
    this.chat.newChat();
    this.pinnedToBottom = true;
    this.focusInput();
  }

  /** The clicked button is usually about to be disabled or removed, so focus goes to the box. */
  private focusInput(): void {
    this.input().nativeElement.focus();
  }
}
