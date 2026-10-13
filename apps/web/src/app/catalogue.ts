import { SlicePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatCard,
  MatCardActions,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import { MatChipListbox, MatChipListboxChange, MatChipOption } from '@angular/material/chips';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import type { Product, ProductListResponse } from '@forte/chat-contract';
import { categoryLabel } from './category-label';
import { filterProducts } from './filter-products';
import { ProductIcon } from './product-icon';

interface Category {
  slug: string;
  label: string;
  products: Product[];
}

/** Groups products by category, in the order the products come in. */
function groupByCategory(products: Product[]): Category[] {
  const categories: Category[] = [];
  for (const product of products) {
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
    MatChipListbox,
    MatChipOption,
    MatFormField,
    MatIconButton,
    MatInput,
    MatLabel,
    MatProgressSpinner,
    MatSuffix,
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

  /** Every loaded product, in the order the API sends them. */
  protected readonly all = computed(() =>
    this.products.hasValue() ? this.products.value().products : [],
  );

  /** The text in the search field. */
  protected readonly query = signal('');
  /** The slug of the selected category; empty for "All". */
  protected readonly category = signal('');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  /** One filter option per category in the loaded data, with all of its products. */
  protected readonly options = computed(() => groupByCategory(this.all()));
  protected readonly matches = computed(() =>
    filterProducts(this.all(), this.query(), this.category()),
  );
  /** The matching products grouped by category. A category without a match is left out. */
  protected readonly categories = computed(() => groupByCategory(this.matches()));
  protected readonly categoryLabel = computed(() => categoryLabel(this.category()));

  protected selectCategory(change: MatChipListboxChange): void {
    this.category.set(change.value ?? '');
    // Clicking the selected chip deselects it and leaves no chip selected: go back to "All".
    change.source.value = this.category();
  }

  protected clearSearch(): void {
    this.query.set('');
    this.search()?.nativeElement.focus();
  }

  protected clearFilters(): void {
    this.category.set('');
    this.clearSearch();
  }

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
