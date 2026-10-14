import { Component, computed, input } from '@angular/core';
import type { ChatSource } from '@forte/chat-contract';
import { formatIssueDate, isDocumentUrl } from './document-link';

interface SourceLine {
  text: string;
  /** Set for a data sheet whose URL is safe: the line is then a link to the PDF. */
  href: string | null;
}

function toLine(source: ChatSource): SourceLine {
  if (source.kind === 'catalogue') {
    // A product without a data sheet: there is nothing to open.
    return { text: `Product catalogue · ${source.productName} · ${source.sku}`, href: null };
  }
  return {
    text:
      `${source.productName} data sheet · ${source.documentNumber} · Rev ${source.revision}` +
      ` · issued ${formatIssueDate(source.issueDate)}`,
    href: isDocumentUrl(source.url) ? source.url : null,
  };
}

/** The citations under a completed answer: what the server says the answer drew on. */
@Component({
  selector: 'app-chat-sources',
  template: `
    <h4>Sources</h4>
    <ul>
      @for (line of lines(); track $index) {
        <li>
          @if (line.href) {
            <a
              target="_blank"
              rel="noopener"
              [href]="line.href"
              [attr.aria-label]="line.text + ' (PDF, opens in a new tab)'"
              >{{ line.text }}<span class="badge" aria-hidden="true">PDF</span></a
            >
          } @else {
            {{ line.text }}
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      margin-top: 0.625rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    h4 {
      margin: 0;
      font: var(--mat-sys-label-medium);
    }

    ul {
      display: grid;
      gap: 0.25rem;
      margin: 0.25rem 0 0;
      padding-left: 1.125rem;
    }

    li {
      /* Long product names and document numbers wrap instead of widening the bubble. */
      overflow-wrap: anywhere;
    }

    a {
      color: var(--mat-sys-primary);
      text-underline-offset: 2px;
    }

    a:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
      border-radius: var(--mat-sys-corner-extra-small);
    }

    .badge {
      display: inline-block;
      margin-left: 0.375rem;
      padding: 0 0.25rem;
      border: 1px solid currentColor;
      border-radius: var(--mat-sys-corner-extra-small);
      font: var(--mat-sys-label-small);
      /* Part of the link, but not underlined with it. */
      text-decoration: none;
    }
  `,
})
export class ChatSources {
  readonly sources = input.required<ChatSource[]>();

  protected readonly lines = computed(() => this.sources().map(toLine));
}
