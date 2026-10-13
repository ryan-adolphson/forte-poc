import { SlicePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, Injector, computed, inject, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MatCard,
  MatCardActions,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import type { Product, ProductListResponse } from '@forte/chat-contract';
import { categoryLabel } from './category-label';
import { ProductIcon } from './product-icon';

interface Category {
  slug: string;
  label: string;
  products: Product[];
}

@Component({
  imports: [
    MatButton,
    MatCard,
    MatCardActions,
    MatCardContent,
    MatCardHeader,
    MatCardSubtitle,
    MatCardTitle,
    MatProgressSpinner,
    ProductIcon,
    SlicePipe,
  ],
  selector: 'app-catalogue',
  styleUrl: './catalogue.css',
  templateUrl: './catalogue.html',
})
export class Catalogue {
  /** The user clicked "Ask Forte" on this product, on its card or in its details dialog. */
  readonly ask = output<Product>();

  private readonly injector = inject(Injector);
  private opening = false;

  protected readonly products = httpResource<ProductListResponse>(() => '/api/products');

  /** The products grouped by category, in the order the API sends them. */
  protected readonly categories = computed(() => {
    const categories: Category[] = [];
    const list = this.products.hasValue() ? this.products.value().products : [];
    for (const product of list) {
      let category = categories.find((c) => c.slug === product.category);
      if (!category) {
        category = {
          slug: product.category,
          label: categoryLabel(product.category),
          products: [],
        };
        categories.push(category);
      }
      category.products.push(product);
    }
    return categories;
  });

  /** Opens the details dialog. Its code, and Material's dialog, load on the first click. */
  protected async viewDetails(product: Product): Promise<void> {
    if (this.opening) {
      return; // a second click while the dialog's code is still loading
    }
    this.opening = true;
    try {
      const { openProductDetails } = await import('./product-details');
      openProductDetails(this.injector, product)
        .afterClosed()
        .subscribe((ask) => {
          if (ask) {
            this.ask.emit(product);
          }
        });
    } finally {
      this.opening = false;
    }
  }
}
