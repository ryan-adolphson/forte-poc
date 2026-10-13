import type { ChatTool } from './tool.js';

export const listCategoriesTool: ChatTool = {
  declaration: {
    type: 'function',
    name: 'list_categories',
    description:
      "Lists the product categories in Forte's catalogue. Use it when the user asks what Forte " +
      'sells, or before search_products when you need the exact category name. Returns ' +
      '{ categories: string[] }, sorted. Takes no arguments.',
    parameters: { type: 'object', properties: {} },
  },

  async run(_args, products) {
    return { ok: true, data: { categories: await products.listCategories() } };
  },
};
