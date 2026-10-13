import { Component, inject } from '@angular/core';
import { Catalogue } from './catalogue';
import { ChatDrawer } from './chat-drawer';

@Component({
  imports: [Catalogue],
  selector: 'app-products-page',
  template: `
    <h2 tabindex="-1">Products</h2>
    <p class="intro">
      Construction materials with their tested properties. Browse the catalogue, or ask Forte about
      any product.
    </p>
    <app-catalogue (ask)="drawer.ask($event)" />
  `,
  styleUrl: './page.css',
})
export class ProductsPage {
  protected readonly drawer = inject(ChatDrawer);
}
