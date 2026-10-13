import { Component, input } from '@angular/core';

/**
 * The icon of a product's category, on a tinted tile. Decorative: the category heading and the
 * product name already say what the product is. The tile is 2.5rem; a parent can set another
 * `width` and `height` and the glyph scales with it.
 */
@Component({
  selector: 'app-product-icon',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      @switch (category()) {
        @case ('concrete') {
          <!-- A concrete mixer: tilted drum on a stand with a wheel. -->
          <g transform="rotate(-30 11 9.5)">
            <path d="M18 6.5 11 4.5C7 4.5 5 7 5 9.5s2 5 6 5l7-2zM14.5 5.5v8" />
          </g>
          <path d="M9 14.5 6 21M12 14.5 15 21M4 21h13" />
          <circle cx="19" cy="19" r="2" />
        }
        @case ('reinforcing-steel') {
          <!-- A welded bar mesh. -->
          <path d="M3 7h18M3 12h18M3 17h18M7 3v18M12 3v18M17 3v18" />
        }
        @case ('structural-steel') {
          <!-- An I-beam section. -->
          <path d="M5 4h14v3h-5.5v10H19v3H5v-3h5.5V7H5z" />
        }
        @case ('timber') {
          <!-- A log on its side, with the cut end and its heart. -->
          <ellipse cx="7" cy="12" rx="3.5" ry="6" />
          <ellipse cx="7" cy="12" rx="1" ry="2.25" />
          <path d="M8 6h10c1.9 0 3.5 2.7 3.5 6s-1.6 6-3.5 6H8M13 10h4M12 14h3" />
        }
        @case ('masonry') {
          <!-- Three courses of bricks in stretcher bond. -->
          <path d="M3 5h18v14H3zM3 9.67h18M3 14.33h18M12 5v4.67M7.5 9.67v4.66M16.5 9.67v4.66M12 14.33V19" />
        }
        @case ('insulation') {
          <!-- A batt: zigzag fibres between two facings. -->
          <path d="M3 5h18M3 19h18M3 15l3-6 3 6 3-6 3 6 3-6 3 6" />
        }
        @case ('cement-mortar') {
          <!-- A bricklayer's trowel. -->
          <path d="M3 21 5.5 9.5l9 9zM10 14l3-3M12 10l2 2 6.5-6.5-2-2z" />
        }
        @default {
          <!-- A box, for a category without its own icon. -->
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: grid;
      flex: none;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 20%;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    svg {
      width: 60%;
      height: 60%;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class ProductIcon {
  /** The product's category slug. */
  readonly category = input.required<string>();
}
