import { optionalString, type ChatTool } from './tool.js';

export const searchProductsTool: ChatTool = {
  declaration: {
    type: 'function',
    name: 'search_products',
    description:
      "Searches Forte's product catalogue and returns full details. Use it to find products by " +
      'keyword, to get the properties of the products in one category, or to gather the products ' +
      'you need to compare. Returns up to 25 products, each with sku, name, category, description ' +
      'and its full list of properties (name, value, unit, standard). An empty list means no ' +
      'product in the catalogue matches. Give a query, a category or both; for an overview of ' +
      'the whole catalogue use list_products instead.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'One short keyword or phrase that must appear literally (case-insensitive) in the ' +
            'product name, SKU or description, for example "C32/40", "glulam" or "mesh". ' +
            'Not a sentence and not several unrelated words. Omit it to get every product in a category.',
        },
        category: {
          type: 'string',
          description:
            'Exact category name as returned by list_categories or list_products, for example ' +
            '"insulation". ' +
            'Omit it to search all categories.',
        },
      },
    },
  },

  async run(args, products) {
    const query = optionalString(args, 'query', 200);
    if (typeof query === 'object') return query;
    const category = optionalString(args, 'category', 50);
    if (typeof category === 'object') return category;

    const found = await products.search({ query, category });
    return { ok: true, data: { count: found.length, products: found } };
  },
};
