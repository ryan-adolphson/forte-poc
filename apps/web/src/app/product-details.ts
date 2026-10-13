import { Component, Injector, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import type { Product } from '@forte/chat-contract';
import { categoryLabel } from './category-label';
import { ProductIcon } from './product-icon';

/** The dialog with everything about one product. It closes with `true` for "Ask Forte". */
@Component({
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    ProductIcon,
  ],
  selector: 'app-product-details',
  template: `
    <header>
      <app-product-icon [category]="product.category" />
      <div>
        <h2 mat-dialog-title>{{ product.name }}</h2>
        <p class="subtitle">{{ product.sku }} · {{ category() }}</p>
      </div>
    </header>
    <mat-dialog-content>
      <p class="description">{{ product.description }}</p>
      <table>
        <caption>
          Properties
        </caption>
        <thead>
          <tr>
            <th scope="col">Property</th>
            <th scope="col">Value</th>
            <th scope="col">Standard</th>
          </tr>
        </thead>
        <tbody>
          @for (property of product.properties; track property.name) {
            <tr>
              <th scope="row">{{ property.name }}</th>
              <td>{{ property.value }} {{ property.unit }}</td>
              <td>{{ property.standard ?? '–' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Close</button>
      <button matButton="tonal" type="button" [mat-dialog-close]="true">Ask Forte</button>
    </mat-dialog-actions>
  `,
  styles: `
    /* The header and the buttons stay in view on a short screen; the content scrolls. */
    :host {
      display: flex;
      flex-direction: column;
      max-height: calc(100dvh - 2rem);
    }

    mat-dialog-content {
      max-height: none;
    }

    header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem 1.5rem 1rem;
    }

    /* Material's title brings its own padding and a spacer for a title that stands alone. */
    h2 {
      margin: 0;
      padding: 0;
      overflow-wrap: break-word;
    }

    h2::before {
      display: none;
    }

    p {
      margin: 0;
    }

    .subtitle {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .description {
      color: var(--mat-sys-on-surface);
    }

    table {
      width: 100%;
      margin-top: 1rem;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
    }

    caption {
      padding-bottom: 0.25rem;
      font: var(--mat-sys-title-small);
      text-align: start;
    }

    th,
    td {
      padding: 0.5rem 0.75rem 0.5rem 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      text-align: start;
      vertical-align: top;
      overflow-wrap: break-word;
    }

    th:last-child,
    td:last-child {
      padding-right: 0;
    }

    thead th {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }

    tbody th {
      font-weight: inherit;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ProductDetails {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  protected readonly category = computed(() => categoryLabel(this.product.category));
}

/**
 * Opens the details dialog for a product. It lives here, not in the catalogue, so that `MatDialog`
 * is loaded with this file on the first click and stays out of the initial bundle.
 */
export function openProductDetails(
  injector: Injector,
  product: Product,
): MatDialogRef<ProductDetails, boolean> {
  return injector.get(MatDialog).open(ProductDetails, { data: product, width: '35rem' });
}
