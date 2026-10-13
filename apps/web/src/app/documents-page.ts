import { httpResource } from '@angular/common/http';
import { Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import type { DocumentListResponse, DocumentSummary } from '@forte/chat-contract';
import { categoryLabel } from './category-label';
import { formatIssueDate, isDocumentUrl } from './document-link';
import { filterDocuments } from './filter-documents';
import { ProductIcon } from './product-icon';

interface Row extends DocumentSummary {
  /** How many revisions exist, for example `3 versions`. Null when the API did not say. */
  versions: string | null;
  /** The issue date as it is shown, for example `19 Jan 2026`. */
  issued: string;
  /** The PDF's address when it is one of the API's own files, otherwise null: no link. */
  href: string | null;
}

interface Group {
  slug: string;
  label: string;
  rows: Row[];
}

/** `3 versions`, `1 version`, or null when the count is missing or not a positive whole number. */
function versionsLabel(count: unknown): string | null {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    return null;
  }
  return count === 1 ? '1 version' : `${count} versions`;
}

/** Groups documents by product category, in the order the documents come in. */
function groupByCategory(documents: DocumentSummary[]): Group[] {
  const groups: Group[] = [];
  for (const document of documents) {
    let group = groups.find((g) => g.slug === document.category);
    if (!group) {
      group = { slug: document.category, label: categoryLabel(document.category), rows: [] };
      groups.push(group);
    }
    group.rows.push({
      ...document,
      // An API built before the count was added does not send it.
      versions: versionsLabel(document.revisionCount),
      issued: formatIssueDate(document.issueDate),
      href: isDocumentUrl(document.url) ? document.url : null,
    });
  }
  return groups;
}

/** The current revision of every product data sheet, with a link to its PDF. */
@Component({
  imports: [
    MatButton,
    MatFormField,
    MatIconButton,
    MatInput,
    MatLabel,
    MatProgressSpinner,
    MatSuffix,
    ProductIcon,
  ],
  selector: 'app-documents-page',
  styleUrl: './documents-page.css',
  templateUrl: './documents-page.html',
})
export class DocumentsPage {
  /** The API lists current revisions only; a superseded revision never reaches this page. */
  protected readonly documents = httpResource<DocumentListResponse>(() => '/api/documents');

  protected readonly all = computed(() =>
    this.documents.hasValue() ? this.documents.value().documents : [],
  );

  /** The text in the search field. */
  protected readonly query = signal('');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly matches = computed(() => filterDocuments(this.all(), this.query()));
  /** The matching documents grouped by category. A category without a match is left out. */
  protected readonly groups = computed(() => groupByCategory(this.matches()));

  protected clearSearch(): void {
    this.query.set('');
    this.search()?.nativeElement.focus();
  }
}
