import type { ProductsService } from '../../products/products.service.js';
import type { Product } from '../../products/product.js';
import { getProductTool } from './get-product.tool.js';
import { chatTools } from './index.js';
import { listCategoriesTool } from './list-categories.tool.js';
import { searchProductsTool } from './search-products.tool.js';

const product: Product = {
  sku: 'FRT-CON-C3240',
  name: 'Ready-Mix Concrete C32/40',
  category: 'concrete',
  description: 'Structural ready-mix concrete.',
  properties: [{ name: 'Density', value: 2380, unit: 'kg/m³', standard: 'EN 12390-7' }],
};

function fakeProducts() {
  const mock = {
    search: vi.fn().mockResolvedValue([product]),
    getBySku: vi.fn().mockResolvedValue(product),
    listCategories: vi.fn().mockResolvedValue(['concrete', 'timber']),
  };
  return { mock, service: mock as unknown as ProductsService };
}

describe('chat tools', () => {
  it('registers three uniquely named function declarations', () => {
    expect(chatTools.map((tool) => tool.declaration.name)).toEqual([
      'search_products',
      'get_product',
      'list_categories',
    ]);
    for (const tool of chatTools) {
      expect(tool.declaration.type).toBe('function');
      expect(tool.declaration.description?.length).toBeGreaterThan(40);
    }
  });

  describe('search_products', () => {
    it('passes trimmed query and category to ProductsService', async () => {
      const { mock, service } = fakeProducts();
      const result = await searchProductsTool.run({ query: ' C32/40 ', category: 'concrete' }, service);

      expect(mock.search).toHaveBeenCalledWith({ query: 'C32/40', category: 'concrete' });
      expect(result).toEqual({ ok: true, data: { count: 1, products: [product] } });
    });

    it('lists everything when called with no arguments', async () => {
      const { mock, service } = fakeProducts();
      await searchProductsTool.run({}, service);
      expect(mock.search).toHaveBeenCalledWith({ query: undefined, category: undefined });
    });

    it.each([
      [{ query: 42 }, /"query" must be a string/],
      [{ query: 'x'.repeat(201) }, /"query" must be at most 200/],
      [{ category: ['insulation'] }, /"category" must be a string/],
      [{ category: 'x'.repeat(51) }, /"category" must be at most 50/],
    ])('returns a tool error for %j', async (args, message) => {
      const { mock, service } = fakeProducts();
      const result = await searchProductsTool.run(args, service);

      expect(result).toEqual({ ok: false, error: expect.stringMatching(message) });
      expect(mock.search).not.toHaveBeenCalled();
    });
  });

  describe('get_product', () => {
    it('looks the SKU up and returns the product', async () => {
      const { mock, service } = fakeProducts();
      const result = await getProductTool.run({ sku: ' FRT-CON-C3240 ' }, service);

      expect(mock.getBySku).toHaveBeenCalledWith('FRT-CON-C3240');
      expect(result).toEqual({ ok: true, data: { found: true, product } });
    });

    it('answers a missing product (unknown or hidden) with found: false and nothing else', async () => {
      const { mock, service } = fakeProducts();
      mock.getBySku.mockResolvedValue(null);

      expect(await getProductTool.run({ sku: 'FRT-INS-KT07' }, service)).toEqual({
        ok: true,
        data: { found: false },
      });
    });

    it.each([
      [{}, /"sku" is required/],
      [{ sku: '   ' }, /"sku" is required/],
      [{ sku: 7 }, /"sku" must be a string/],
      [{ sku: 'x'.repeat(51) }, /"sku" must be at most 50/],
    ])('returns a tool error for %j', async (args, message) => {
      const { mock, service } = fakeProducts();
      const result = await getProductTool.run(args, service);

      expect(result).toEqual({ ok: false, error: expect.stringMatching(message) });
      expect(mock.getBySku).not.toHaveBeenCalled();
    });
  });

  describe('list_categories', () => {
    it('returns the categories and ignores any arguments', async () => {
      const { mock, service } = fakeProducts();
      const result = await listCategoriesTool.run({ anything: true }, service);

      expect(mock.listCategories).toHaveBeenCalledWith();
      expect(result).toEqual({ ok: true, data: { categories: ['concrete', 'timber'] } });
    });
  });
});
