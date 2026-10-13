import type { Product } from '@forte/chat-contract';
import { PRODUCTS } from '../testing/products';
import { filterProducts } from './filter-products';

const [c3240, c2025, rebar] = PRODUCTS;
/** A product whose category label and property standard appear nowhere else in it. */
const grout: Product = {
  sku: 'CEM-GRT-25',
  name: 'Non-Shrink Grout 25 kg',
  category: 'cement-mortar',
  description: 'Flowable grout for base plates.',
  properties: [{ name: 'Flow', value: 250, unit: 'mm', standard: 'EN 1504-6' }],
};
const ALL = [...PRODUCTS, grout];

describe('filterProducts', () => {
  const skus = (query: string, category = '') =>
    filterProducts(ALL, query, category).map((p) => p.sku);

  it('returns everything for an empty or blank query', () => {
    expect(filterProducts(ALL, '', '')).toEqual(ALL);
    expect(filterProducts(ALL, '   ', '')).toEqual(ALL);
  });

  it('ignores letter case and surrounding spaces', () => {
    expect(skus('  REBAR ')).toEqual([rebar.sku]);
    expect(skus('rst-b500b')).toEqual([rebar.sku]);
  });

  it('matches the name, SKU and description', () => {
    expect(skus('C32/40')).toEqual([c3240.sku]);
    expect(skus('CON-C2025')).toEqual([c2025.sku]);
    expect(skus('foundations')).toEqual([c2025.sku]);
  });

  it('matches the category label, property names and standards', () => {
    expect(skus('mortar')).toEqual([grout.sku]);
    expect(skus('slump class')).toEqual([c3240.sku]);
    expect(skus('yield')).toEqual([rebar.sku]);
    expect(skus('EN 206')).toEqual([c3240.sku]);
    expect(skus('1504-6')).toEqual([grout.sku]);
  });

  it('does not match property values', () => {
    expect(skus('2400')).toEqual([]);
  });

  it('needs every word to match somewhere, in any order', () => {
    expect(skus('concrete columns')).toEqual([c3240.sku]);
    expect(skus('columns   concrete')).toEqual([c3240.sku]);
    expect(skus('206 ready-mix')).toEqual([c3240.sku]);
    expect(skus('concrete rebar')).toEqual([]);
  });

  it('filters by category alone', () => {
    expect(skus('', 'concrete')).toEqual([c3240.sku, c2025.sku]);
    expect(skus('', 'timber')).toEqual([]);
  });

  it('combines the category and the query', () => {
    expect(skus('strength')).toEqual([c3240.sku, c2025.sku, rebar.sku]);
    expect(skus('strength', 'reinforcing-steel')).toEqual([rebar.sku]);
    expect(skus('foundations', 'reinforcing-steel')).toEqual([]);
  });

  it('returns nothing when no product matches', () => {
    expect(skus('zzz')).toEqual([]);
  });

  it('treats regex characters as plain text', () => {
    expect(skus('C32/40 (')).toEqual([]);
    expect(skus('.*')).toEqual([]);
    expect(skus('[a-z]+ \\')).toEqual([]);
  });
});
