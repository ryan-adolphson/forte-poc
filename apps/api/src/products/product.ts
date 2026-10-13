/**
 * The product types are defined once, in the contract shared with the web app.
 *
 * `Product` is a product as the assistant and the product page see it. Deliberately has
 * no `id`, no timestamps and no `visibleToBot`: neither may be able to tell that hidden
 * rows exist. `ProductProperty` is one entry of `products.properties`.
 */
import type { Product } from '@forte/chat-contract';

export type { Product, ProductProperty } from '@forte/chat-contract';

/** The compact form used to list the whole catalogue. */
export type ProductSummary = Pick<Product, 'sku' | 'name' | 'category'>;
