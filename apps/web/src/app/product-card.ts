import { Component, computed, input } from '@angular/core';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import type { Product } from '@forte/chat-contract';
import { categoryLabel } from './category-label';

/** The compact card at the top of the chat panel: the product the conversation is about. */
@Component({
  imports: [MatCard, MatCardContent, MatCardHeader, MatCardSubtitle, MatCardTitle],
  selector: 'app-product-card',
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <h3 mat-card-title>{{ product().name }}</h3>
        <mat-card-subtitle>{{ product().sku }} · {{ category() }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <details [open]="expanded">
          <summary>Details</summary>
          <p>{{ product().description }}</p>
          <dl>
            @for (property of properties(); track property.name) {
              <div>
                <dt>{{ property.name }}:</dt>
                &ngsp;
                <dd>{{ property.value }} {{ property.unit }}</dd>
              </div>
            }
          </dl>
        </details>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }

    mat-card-header {
      padding: 0.75rem 1rem 0;
    }

    h3 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }

    mat-card-subtitle {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    mat-card-content {
      padding: 0.25rem 1rem 0.75rem;
      font: var(--mat-sys-body-medium);
    }

    summary {
      width: fit-content;
      padding: 0.25rem 0;
      color: var(--mat-sys-primary);
      cursor: pointer;
    }

    summary:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    p,
    dl,
    dd {
      margin: 0;
    }

    dl {
      margin-top: 0.375rem;
    }

    dt,
    dd {
      display: inline;
    }

    dt {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ProductCard {
  readonly product = input.required<Product>();

  protected readonly category = computed(() => categoryLabel(this.product().category));
  protected readonly properties = computed(() => this.product().properties.slice(0, 3));
  /** On a phone the details start collapsed, so the card leaves room for the conversation. */
  protected readonly expanded = window.innerWidth >= 600 && window.innerHeight >= 600;
}
