import type { DocumentText } from '../../documents/document.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { ProductsService } from '../../products/products.service.js';
import type { Product } from '../../products/product.js';
import { getDataSheetTool } from './get-data-sheet.tool.js';
import { getProductTool } from './get-product.tool.js';
import { chatTools } from './index.js';
import { listCategoriesTool } from './list-categories.tool.js';
import { listProductsTool } from './list-products.tool.js';
import { searchDataSheetsTool } from './search-data-sheets.tool.js';
import { searchProductsTool } from './search-products.tool.js';

const product: Product = {
  sku: 'FRT-CON-C3240',
  name: 'Ready-Mix Concrete C32/40',
  category: 'concrete',
  description: 'Structural ready-mix concrete.',
  properties: [{ name: 'Density', value: 2380, unit: 'kg/m³', standard: 'EN 12390-7' }],
};

const dataSheet: DocumentText = {
  documentNumber: 'DS-FRT-CON-C3240',
  revision: 'C',
  issueDate: '2026-01-19',
  title: 'Ready-Mix Concrete C32/40 - Product data sheet',
  sku: 'FRT-CON-C3240',
  productName: 'Ready-Mix Concrete C32/40',
  text: 'Handling and storage\n- Cure for at least 7 days.',
};
const dataSheetSource = {
  kind: 'datasheet',
  sku: 'FRT-CON-C3240',
  productName: 'Ready-Mix Concrete C32/40',
  documentNumber: 'DS-FRT-CON-C3240',
  revision: 'C',
  issueDate: '2026-01-19',
  url: '/api/documents/DS-FRT-CON-C3240/file',
};
/** What the model is given about a product's current data sheet: no text, no URL. */
const reference = { documentNumber: 'DS-FRT-CON-C3240', revision: 'C', issueDate: '2026-01-19' };
const catalogueSource = {
  kind: 'catalogue',
  sku: 'FRT-CON-C3240',
  productName: 'Ready-Mix Concrete C32/40',
  dataSheet: { ...reference, url: '/api/documents/DS-FRT-CON-C3240/file' },
};

function fakeDocuments() {
  const mock = {
    getCurrentReferences: vi.fn().mockResolvedValue(new Map([['FRT-CON-C3240', reference]])),
    getCurrentForSku: vi.fn().mockResolvedValue(dataSheet),
    searchCurrent: vi.fn().mockResolvedValue([dataSheet]),
  };
  return { mock, service: mock as unknown as DocumentsService };
}
/** The data sheet tools must not touch the catalogue, and the list tools not the documents. */
const unused = {} as ProductsService & DocumentsService;

function fakeProducts() {
  const mock = {
    search: vi.fn().mockResolvedValue([product]),
    getBySku: vi.fn().mockResolvedValue(product),
    listAll: vi.fn().mockResolvedValue([
      { sku: 'FRT-CON-C2530', name: 'Ready-Mix Concrete C25/30', category: 'concrete' },
      { sku: 'FRT-CON-C3240', name: 'Ready-Mix Concrete C32/40', category: 'concrete' },
      { sku: 'FRT-TIM-C24', name: 'Structural Softwood C24 47 x 195', category: 'timber' },
    ]),
    listCategories: vi.fn().mockResolvedValue(['concrete', 'timber']),
  };
  return { mock, service: mock as unknown as ProductsService };
}

describe('chat tools', () => {
  it('registers six uniquely named function declarations', () => {
    expect(chatTools.map((tool) => tool.declaration.name)).toEqual([
      'search_products',
      'get_product',
      'list_products',
      'list_categories',
      'get_data_sheet',
      'search_data_sheets',
    ]);
    for (const tool of chatTools) {
      expect(tool.declaration.type).toBe('function');
      expect(tool.declaration.description?.length).toBeGreaterThan(40);
    }
  });

  describe('search_products', () => {
    it('passes trimmed query and category to ProductsService', async () => {
      const { mock, service } = fakeProducts();
      const documents = fakeDocuments();
      const result = await searchProductsTool.run({ query: ' C32/40 ', category: 'concrete' }, service, documents.service);

      expect(mock.search).toHaveBeenCalledWith({ query: 'C32/40', category: 'concrete' });
      expect(result).toEqual({
        ok: true,
        data: { count: 1, products: [{ ...product, dataSheet: reference }] },
        sources: [{ source: catalogueSource, direct: false }],
      });
    });

    it('looks the data sheet references up once for all results, and omits dataSheet where there is none', async () => {
      const { mock, service } = fakeProducts();
      const other = { ...product, sku: 'FRT-TIM-C24', name: 'Structural Softwood C24 47 x 195' };
      mock.search.mockResolvedValue([product, other]);
      const documents = fakeDocuments();

      const result = await searchProductsTool.run({}, service, documents.service);

      expect(mock.search).toHaveBeenCalledWith({ query: undefined, category: undefined });
      expect(documents.mock.getCurrentReferences).toHaveBeenCalledExactlyOnceWith(['FRT-CON-C3240', 'FRT-TIM-C24']);
      expect(documents.mock.getCurrentForSku).not.toHaveBeenCalled();
      if (!result.ok) throw new Error('expected ok');
      // As the model receives it: the reference and nothing else of the sheet.
      expect(JSON.parse(JSON.stringify(result.data))).toEqual({
        count: 2,
        products: [{ ...product, dataSheet: reference }, other],
      });
      expect(result.sources).toEqual([
        { source: catalogueSource, direct: false },
        { source: { kind: 'catalogue', sku: 'FRT-TIM-C24', productName: other.name }, direct: false },
      ]);
      expect(result.sources![1]!.source).not.toHaveProperty('dataSheet');
    });

    it.each([
      [{ query: 42 }, /"query" must be a string/],
      [{ query: 'x'.repeat(201) }, /"query" must be at most 200/],
      [{ category: ['insulation'] }, /"category" must be a string/],
      [{ category: 'x'.repeat(51) }, /"category" must be at most 50/],
    ])('returns a tool error for %j', async (args, message) => {
      const { mock, service } = fakeProducts();
      const documents = fakeDocuments();
      const result = await searchProductsTool.run(args, service, documents.service);

      expect(result).toEqual({ ok: false, error: expect.stringMatching(message) });
      expect(mock.search).not.toHaveBeenCalled();
      expect(documents.mock.getCurrentReferences).not.toHaveBeenCalled();
    });
  });

  describe('get_product', () => {
    it("looks the SKU up and returns the product with the reference of its current data sheet", async () => {
      const { mock, service } = fakeProducts();
      const documents = fakeDocuments();
      // The model's spelling finds the product; the reference is asked for by the row's own SKU.
      const result = await getProductTool.run({ sku: ' frt-con-c3240 ' }, service, documents.service);

      expect(mock.getBySku).toHaveBeenCalledWith('frt-con-c3240');
      expect(documents.mock.getCurrentReferences).toHaveBeenCalledExactlyOnceWith(['FRT-CON-C3240']);
      expect(documents.mock.getCurrentForSku).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        data: { found: true, product: { ...product, dataSheet: reference } },
        sources: [{ source: catalogueSource, direct: true }],
      });
      // No sheet text and no URL reach the model.
      expect(JSON.stringify(result.ok && result.data)).not.toMatch(/Cure for|\/api\/documents/);
    });

    it('returns the product alone, with a plain catalogue source, when it has no data sheet', async () => {
      const { service } = fakeProducts();
      const documents = fakeDocuments();
      documents.mock.getCurrentReferences.mockResolvedValue(new Map());

      const result = await getProductTool.run({ sku: 'FRT-CON-C3240' }, service, documents.service);

      if (!result.ok) throw new Error('expected ok');
      expect(JSON.stringify(result.data)).toBe(JSON.stringify({ found: true, product }));
      expect(result.sources).toEqual([
        { source: { kind: 'catalogue', sku: 'FRT-CON-C3240', productName: product.name }, direct: true },
      ]);
      expect(result.sources![0]!.source).not.toHaveProperty('dataSheet');
    });

    it('answers a missing product (unknown or hidden) with found: false and nothing else', async () => {
      const { mock, service } = fakeProducts();
      const documents = fakeDocuments();
      mock.getBySku.mockResolvedValue(null);

      expect(await getProductTool.run({ sku: 'FRT-INS-KT07' }, service, documents.service)).toEqual({
        ok: true,
        data: { found: false },
      });
      // No product, so no data sheet is looked up for the string the model sent.
      expect(documents.mock.getCurrentReferences).not.toHaveBeenCalled();
    });

    it.each([
      [{}, /"sku" is required/],
      [{ sku: '   ' }, /"sku" is required/],
      [{ sku: 7 }, /"sku" must be a string/],
      [{ sku: 'x'.repeat(51) }, /"sku" must be at most 50/],
    ])('returns a tool error for %j', async (args, message) => {
      const { mock, service } = fakeProducts();
      const result = await getProductTool.run(args, service, unused);

      expect(result).toEqual({ ok: false, error: expect.stringMatching(message) });
      expect(mock.getBySku).not.toHaveBeenCalled();
    });
  });

  describe('list_products', () => {
    it('returns every product grouped by category and ignores any arguments', async () => {
      const { mock, service } = fakeProducts();
      const result = await listProductsTool.run({ anything: true }, service, unused);

      expect(mock.listAll).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        data: {
          total: 3,
          categories: [
            {
              category: 'concrete',
              products: [
                { sku: 'FRT-CON-C2530', name: 'Ready-Mix Concrete C25/30' },
                { sku: 'FRT-CON-C3240', name: 'Ready-Mix Concrete C32/40' },
              ],
            },
            {
              category: 'timber',
              products: [{ sku: 'FRT-TIM-C24', name: 'Structural Softwood C24 47 x 195' }],
            },
          ],
        },
      });
    });

    it('returns an empty catalogue as total 0', async () => {
      const { mock, service } = fakeProducts();
      mock.listAll.mockResolvedValue([]);
      expect(await listProductsTool.run({}, service, unused)).toEqual({
        ok: true,
        data: { total: 0, categories: [] },
      });
    });
  });

  describe('list_categories', () => {
    it('returns the categories and ignores any arguments', async () => {
      const { mock, service } = fakeProducts();
      const result = await listCategoriesTool.run({ anything: true }, service, unused);

      expect(mock.listCategories).toHaveBeenCalledWith();
      expect(result).toEqual({ ok: true, data: { categories: ['concrete', 'timber'] } });
    });
  });

  describe('get_data_sheet', () => {
    it('asks DocumentsService for the current sheet of the SKU and returns it whole', async () => {
      const { mock, service } = fakeDocuments();
      const result = await getDataSheetTool.run({ sku: ' frt-con-c3240 ' }, unused, service);

      expect(mock.getCurrentForSku).toHaveBeenCalledWith('frt-con-c3240');
      expect(result).toEqual({
        ok: true,
        data: { found: true, dataSheet },
        sources: [{ source: dataSheetSource, direct: true }],
      });
    });

    it.each(['FRT-NOPE-0000', 'FRT-CON-H2835'])(
      'answers %s (unknown, hidden or without a sheet: the service says null) with found: false only',
      async (sku) => {
        const { mock, service } = fakeDocuments();
        mock.getCurrentForSku.mockResolvedValue(null);

        expect(await getDataSheetTool.run({ sku }, unused, service)).toEqual({ ok: true, data: { found: false } });
      },
    );

    it.each([
      [{}, /"sku" is required/],
      [{ sku: ' ' }, /"sku" is required/],
      [{ sku: ['FRT-CON-C3240'] }, /"sku" must be a string/],
      [{ sku: 'x'.repeat(51) }, /"sku" must be at most 50/],
    ])('returns a tool error for %j', async (args, message) => {
      const { mock, service } = fakeDocuments();
      const result = await getDataSheetTool.run(args, unused, service);

      expect(result).toEqual({ ok: false, error: expect.stringMatching(message) });
      expect(mock.getCurrentForSku).not.toHaveBeenCalled();
    });

    it('has no way to ask for a revision', () => {
      expect(Object.keys(getDataSheetTool.declaration.parameters?.properties ?? {})).toEqual(['sku']);
      expect(Object.keys(searchDataSheetsTool.declaration.parameters?.properties ?? {})).toEqual(['query']);
    });
  });

  describe('search_data_sheets', () => {
    it('passes the trimmed query to DocumentsService and returns the hits with their text', async () => {
      const { mock, service } = fakeDocuments();
      const result = await searchDataSheetsTool.run({ query: ' curing days ' }, unused, service);

      expect(mock.searchCurrent).toHaveBeenCalledWith('curing days');
      expect(result).toEqual({
        ok: true,
        data: { count: 1, dataSheets: [dataSheet] },
        sources: [{ source: dataSheetSource, direct: false }],
      });
    });

    it('returns an empty list, with no sources, when nothing matches', async () => {
      const { mock, service } = fakeDocuments();
      mock.searchCurrent.mockResolvedValue([]);

      expect(await searchDataSheetsTool.run({ query: 'heritage' }, unused, service)).toEqual({
        ok: true,
        data: { count: 0, dataSheets: [] },
        sources: [],
      });
    });

    it.each([
      [{}, /"query" is required/],
      [{ query: '  ' }, /"query" is required/],
      [{ query: 42 }, /"query" must be a string/],
      [{ query: 'x'.repeat(201) }, /"query" must be at most 200/],
    ])('returns a tool error for %j', async (args, message) => {
      const { mock, service } = fakeDocuments();
      const result = await searchDataSheetsTool.run(args, unused, service);

      expect(result).toEqual({ ok: false, error: expect.stringMatching(message) });
      expect(mock.searchCurrent).not.toHaveBeenCalled();
    });
  });
});
