import type { DocumentSummary } from '@forte/chat-contract';
import { categoryLabel } from './category-label';

/**
 * The documents that contain every word of `query`, in any order and in any letter case. A word
 * is looked for in the document's title and number, and its product's name, SKU and category label.
 */
export function filterDocuments(documents: DocumentSummary[], query: string): DocumentSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return documents.filter((document) => {
    const text = [
      document.title,
      document.documentNumber,
      document.productName,
      document.sku,
      categoryLabel(document.category),
    ]
      .join('\n')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
