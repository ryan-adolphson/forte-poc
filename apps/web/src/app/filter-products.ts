import type { Product } from '@forte/chat-contract';
import { categoryLabel } from './category-label';

/**
 * The products that are in `category` (a slug; empty for every category) and contain every word
 * of `query`, in any order and in any letter case. A word is looked for in the product's name,
 * SKU, description, category label, and the names and standards of its properties.
 */
export function filterProducts(products: Product[], query: string, category: string): Product[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return products.filter((product) => {
    if (category && product.category !== category) {
      return false;
    }
    const text = [
      product.name,
      product.sku,
      product.description,
      categoryLabel(product.category),
      ...product.properties.flatMap((property) => [property.name, property.standard ?? '']),
    ]
      .join('\n')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
