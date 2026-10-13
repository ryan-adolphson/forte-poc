import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { hiddenSkus, seedProducts } from '../src/prisma/seed-data.js';
import { ProductsService } from '../src/products/products.service.js';

// Read-only, against the seeded dev database (`npm run db:deploy -w api && npm run db:seed -w api`).
describe('ProductsService', () => {
  let app: INestApplication;
  let products: ProductsService;

  const hidden = seedProducts.filter((product) => hiddenSkus.includes(product.sku));
  const visible = seedProducts.filter((product) => !hiddenSkus.includes(product.sku));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    products = app.get(ProductsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('has exactly two hidden products in the seed', () => {
    expect(hiddenSkus).toEqual(['FRT-CON-H2835', 'FRT-INS-KT07']);
  });

  describe('getBySku', () => {
    it('returns a visible product with its properties and nothing else', async () => {
      const product = await products.getBySku('FRT-CON-C3240');

      expect(product).toEqual({
        sku: 'FRT-CON-C3240',
        name: 'Ready-Mix Concrete C32/40',
        category: 'concrete',
        description: expect.stringContaining('Structural ready-mix concrete'),
        properties: expect.arrayContaining([
          {
            name: 'Characteristic compressive strength, cube (28 days)',
            value: 40,
            unit: 'MPa',
            standard: 'EN 12390-3',
          },
          { name: 'Slump class', value: 'S3', standard: 'EN 12350-2' },
        ]),
      });
      expect(product?.properties).toHaveLength(6);
    });

    it('matches the SKU case-insensitively', async () => {
      const product = await products.getBySku('frt-con-c3240');
      expect(product?.sku).toBe('FRT-CON-C3240');
    });

    it('does not treat LIKE wildcards in the SKU as wildcards', async () => {
      expect(await products.getBySku('FRT-CON-C____')).toBeNull();
      expect(await products.getBySku('%')).toBeNull();
    });

    it('returns null for an unknown SKU', async () => {
      expect(await products.getBySku('FRT-NOPE-0000')).toBeNull();
    });

    it.each(hiddenSkus)('returns null for hidden SKU %s, in any case', async (sku) => {
      expect(await products.getBySku(sku)).toBeNull();
      expect(await products.getBySku(sku.toLowerCase())).toBeNull();
    });
  });

  describe('search', () => {
    it('returns every visible product and no hidden one when unfiltered', async () => {
      const results = await products.search({});

      expect(results.map((product) => product.sku).sort()).toEqual(
        visible.map((product) => product.sku).sort(),
      );
      for (const product of results) {
        expect(Object.keys(product).sort()).toEqual([
          'category',
          'description',
          'name',
          'properties',
          'sku',
        ]);
        expect(hiddenSkus).not.toContain(product.sku);
      }
    });

    it('orders by category, then name', async () => {
      const results = await products.search();
      const keys = results.map((product) => [product.category, product.name]);
      expect(keys).toEqual(
        [...keys].sort(([c1, n1], [c2, n2]) =>
          c1 === c2 ? (n1! < n2! ? -1 : 1) : c1! < c2! ? -1 : 1,
        ),
      );
    });

    it.each(hidden)('finds nothing by the hidden name, sku or description of $sku', async (product) => {
      expect(await products.search({ query: product.name })).toEqual([]);
      expect(await products.search({ query: product.sku })).toEqual([]);
      expect(await products.search({ query: product.description })).toEqual([]);
    });

    it('finds nothing by a distinctive word from a hidden name', async () => {
      expect(await products.search({ query: 'Kestrel' })).toEqual([]);
      expect(await products.search({ query: 'heritage mix' })).toEqual([]);
    });

    it('leaves hidden rows out of a category that also has visible ones', async () => {
      const results = await products.search({ category: 'insulation' });
      expect(results.map((product) => product.sku)).toEqual([
        'FRT-INS-MW100',
        'FRT-INS-PIR080',
        'FRT-INS-XPS050',
      ]);
    });

    it('is case-insensitive across name, sku and description', async () => {
      const byName = await products.search({ query: 'gLuLaM' });
      expect(byName.map((product) => product.sku)).toEqual(['FRT-TIM-GL28H']);

      const bySku = await products.search({ query: 'frt-sts-' });
      expect(bySku.map((product) => product.sku).sort()).toEqual([
        'FRT-STS-SHS100S275',
        'FRT-STS-UB406S355',
      ]);

      const byDescription = await products.search({ query: 'INVERTED ROOFS' });
      expect(byDescription.map((product) => product.sku)).toEqual(['FRT-INS-XPS050']);
    });

    it('combines query and category', async () => {
      const results = await products.search({ query: 'block', category: 'masonry' });
      expect(results.map((product) => product.sku).sort()).toEqual([
        'FRT-MAS-AAC100',
        'FRT-MAS-BLK140D',
      ]);
      expect(await products.search({ query: 'block', category: 'timber' })).toEqual([]);
    });

    it('treats LIKE wildcards in the query literally', async () => {
      expect(await products.search({ query: '%' })).toEqual([]);
      expect(await products.search({ query: '_' })).toEqual([]);
    });
  });

  describe('listAll', () => {
    it('returns exactly the visible products as sku, name and category, uncapped', async () => {
      const results = await products.listAll();

      expect(results).toHaveLength(19);
      expect(results.map((product) => product.sku).sort()).toEqual(
        visible.map((product) => product.sku).sort(),
      );
      for (const product of results) {
        expect(Object.keys(product).sort()).toEqual(['category', 'name', 'sku']);
        expect(hiddenSkus).not.toContain(product.sku);
      }
    });

    it('orders by category, then name, like search', async () => {
      const results = await products.listAll();
      expect(results.map((product) => product.sku)).toEqual(
        (await products.search()).map((product) => product.sku),
      );
      expect(results.map((product) => product.category)).toEqual(
        results.map((product) => product.category).sort(),
      );
    });
  });

  describe('listCategories', () => {
    it('returns the categories that have visible products', async () => {
      expect(await products.listCategories()).toEqual([
        'cement-mortar',
        'concrete',
        'insulation',
        'masonry',
        'reinforcing-steel',
        'structural-steel',
        'timber',
      ]);
    });
  });
});
