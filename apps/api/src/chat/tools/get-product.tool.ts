import { optionalString, type ChatTool } from './tool.js';

export const getProductTool: ChatTool = {
  declaration: {
    type: 'function',
    name: 'get_product',
    description:
      'Fetches one product by its exact SKU. Use it when the user gives a SKU or when you ' +
      'already know the SKU from search_products or list_products and need its details. Returns ' +
      '{ found: true, product } with sku, name, category, description and all properties ' +
      '(name, value, unit, standard), or { found: false } when the catalogue has no product ' +
      'with that SKU. To find a product by name or keyword, use search_products instead.',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'The product SKU, for example "FRT-CON-C3240". Case-insensitive.',
        },
      },
      required: ['sku'],
    },
  },

  async run(args, products) {
    const sku = optionalString(args, 'sku', 50);
    if (typeof sku === 'object') return sku;
    if (sku === undefined) return { ok: false, error: '"sku" is required.' };

    const product = await products.getBySku(sku);
    // Hidden and unknown SKUs both arrive here as null, and must look the same.
    return { ok: true, data: product === null ? { found: false } : { found: true, product } };
  },
};
