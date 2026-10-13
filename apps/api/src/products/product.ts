/** One measured or declared property of a product, as stored in `products.properties`. */
export type ProductProperty = {
  name: string;
  value: number | string;
  unit?: string;
  /** The test or product standard the value refers to, where one exists. */
  standard?: string;
};

/**
 * A product as the assistant sees it. Deliberately has no `id`, no timestamps and
 * no `visibleToBot`: the model must not be able to tell that hidden rows exist.
 */
export type Product = {
  sku: string;
  name: string;
  category: string;
  description: string;
  properties: ProductProperty[];
};
