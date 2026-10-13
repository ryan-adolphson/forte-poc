import type { Product } from '@forte/chat-contract';

/** Three products in two categories, in the order the API sends them. */
export const PRODUCTS: Product[] = [
  {
    sku: 'CON-C3240',
    name: 'Ready-Mix Concrete C32/40',
    category: 'concrete',
    description: 'Structural concrete for slabs, beams and columns.',
    properties: [
      {
        name: 'Compressive strength',
        value: 40,
        unit: 'MPa',
        standard: 'EN 206',
      },
      { name: 'Density', value: 2400, unit: 'kg/m³' },
      { name: 'Slump class', value: 'S3' },
      { name: 'Maximum aggregate size', value: 20, unit: 'mm' },
      { name: 'Exposure class', value: 'XC4' },
    ],
  },
  {
    sku: 'CON-C2025',
    name: 'Ready-Mix Concrete C20/25',
    category: 'concrete',
    description: 'General purpose concrete for foundations.',
    properties: [{ name: 'Compressive strength', value: 25, unit: 'MPa' }],
  },
  {
    sku: 'RST-B500B-12',
    name: 'Rebar B500B 12 mm',
    category: 'reinforcing-steel',
    description: 'Ribbed reinforcing bar.',
    properties: [{ name: 'Yield strength', value: 500, unit: 'MPa' }],
  },
];
