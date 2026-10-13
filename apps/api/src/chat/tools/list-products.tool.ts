import type { ChatTool } from './tool.js';

export const listProductsTool: ChatTool = {
  declaration: {
    type: 'function',
    name: 'list_products',
    description:
      "Lists every product in Forte's catalogue, grouped by category. Use it when the user wants " +
      'an overview: everything Forte sells, or which products each category contains. Returns ' +
      '{ total, categories: [{ category, products: [{ sku, name }] }] }, complete and sorted by ' +
      'category then name. It returns names and SKUs only, with no descriptions or properties: ' +
      'call get_product or search_products for those. Takes no arguments.',
    parameters: { type: 'object', properties: {} },
  },

  async run(_args, products) {
    const all = await products.listAll();
    // listAll() is ordered by category, so each category's products arrive together.
    const categories: { category: string; products: { sku: string; name: string }[] }[] = [];
    for (const { sku, name, category } of all) {
      let group = categories.at(-1);
      if (group?.category !== category) {
        group = { category, products: [] };
        categories.push(group);
      }
      group.products.push({ sku, name });
    }
    return { ok: true, data: { total: all.length, categories } };
  },
};
