import { Component, computed, input } from '@angular/core';
import type { ChatSource } from '@forte/chat-contract';
import { formatIssueDate, isDocumentUrl } from './document-link';

interface SourceLine {
  /** Plain text in front of the data sheet: the catalogue entry. Empty for a data sheet source. */
  text: string;
  /** A data sheet at its revision. A link to the PDF when the URL is safe, otherwise text. */
  sheet: { text: string; label: string; href: string | null } | null;
}

function toLine(source: ChatSource): SourceLine {
  if (source.kind === 'datasheet') {
    const text = `${source.productName} data sheet · ${reference(source)}`;
    return { text: '', sheet: { text, label: text, href: safeHref(source.url) } };
  }
  const { dataSheet } = source;
  return {
    text: `Product catalogue · ${source.productName} · ${source.sku}`,
    // The product's current data sheet: named with its revision, under the catalogue entry.
    sheet: dataSheet
      ? {
          text: `Current data sheet · ${reference(dataSheet)}`,
          label: `${source.productName} current data sheet · ${reference(dataSheet)}`,
          href: safeHref(dataSheet.url),
        }
      : null,
  };
}

function reference(sheet: { documentNumber: string; revision: string; issueDate: string }): string {
  return `${sheet.documentNumber} · Rev ${sheet.revision} · issued ${formatIssueDate(sheet.issueDate)}`;
}

function safeHref(url: unknown): string | null {
  return isDocumentUrl(url) ? url : null;
}

/** The citations under a completed answer: what the server says the answer drew on. */
@Component({
  selector: 'app-chat-sources',
  template: `
    <h4>Sources</h4>
    <ul>
      @for (line of lines(); track $index) {
        <li>
          @if (line.text) {
            <span class="entry">{{ line.text }}</span>
          }
          @if (line.sheet; as sheet) {
            @if (sheet.href) {
              <a
                target="_blank"
                rel="noopener"
                [href]="sheet.href"
                [attr.aria-label]="sheet.label + ' (PDF, opens in a new tab)'"
                >{{ sheet.text }}<span class="badge" aria-hidden="true">PDF</span></a
              >
            } @else {
              {{ sheet.text }}
            }
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

    .entry {
      /* A catalogue entry's data sheet goes on the line below it. */
      display: block;
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
