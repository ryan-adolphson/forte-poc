import type { ChatTool } from './tool.js';

export const listCategoriesTool: ChatTool = {
  declaration: {
    type: 'function',
    name: 'list_categories',
    description:
      "Lists the names of the product categories in Forte's catalogue, without the products in " +
      'them. Use it when only the category names are needed: the user asks which categories ' +
      'exist, or you need the exact category name for search_products. To see the products as ' +
      'well, use list_products instead. Returns { categories: string[] }, sorted. Takes no arguments.',
    parameters: { type: 'object', properties: {} },
  },

  async run(_args, products) {
    return { ok: true, data: { categories: await products.listCategories() } };
  },
};
