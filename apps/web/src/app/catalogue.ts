import { SlicePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, output } from '@angular/core';
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
    SlicePipe,
  ],
  selector: 'app-catalogue',
  styleUrl: './catalogue.css',
  templateUrl: './catalogue.html',
})
export class Catalogue {
  /** The user clicked "Ask Forte" on this product. */
  readonly ask = output<Product>();

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
}
