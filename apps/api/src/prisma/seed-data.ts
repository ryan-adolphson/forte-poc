import type { Product } from '../products/product.js';

/**
 * Sample catalogue for a fictional supplier. The values are typical figures for each
 * kind of material, not a real manufacturer's data sheets.
 *
 * Exactly two rows are hidden from the bot (`visibleToBot: false`); see `hiddenSkus`.
 */
export type SeedProduct = Product & { visibleToBot?: false };

export const seedProducts: SeedProduct[] = [
  // concrete
  {
    sku: 'FRT-CON-C2530',
    name: 'Ready-Mix Concrete C25/30',
    category: 'concrete',
    description:
      'General-purpose ready-mix concrete for foundations, ground-bearing slabs and lightly loaded reinforced elements.',
    properties: [
      { name: 'Characteristic compressive strength, cylinder (28 days)', value: 25, unit: 'MPa', standard: 'EN 206' },
      { name: 'Characteristic compressive strength, cube (28 days)', value: 30, unit: 'MPa', standard: 'EN 12390-3' },
      { name: 'Slump class', value: 'S3', standard: 'EN 12350-2' },
      { name: 'Maximum aggregate size', value: 20, unit: 'mm', standard: 'EN 12620' },
      { name: 'Density', value: 2350, unit: 'kg/m³', standard: 'EN 12390-7' },
      { name: 'Exposure class', value: 'XC2', standard: 'EN 206' },
    ],
  },
  {
    sku: 'FRT-CON-C3240',
    name: 'Ready-Mix Concrete C32/40',
    category: 'concrete',
    description:
      'Structural ready-mix concrete for reinforced beams, columns and suspended slabs, including external elements exposed to rain.',
    properties: [
      { name: 'Characteristic compressive strength, cylinder (28 days)', value: 32, unit: 'MPa', standard: 'EN 206' },
      { name: 'Characteristic compressive strength, cube (28 days)', value: 40, unit: 'MPa', standard: 'EN 12390-3' },
      { name: 'Slump class', value: 'S3', standard: 'EN 12350-2' },
      { name: 'Maximum aggregate size', value: 20, unit: 'mm', standard: 'EN 12620' },
      { name: 'Density', value: 2380, unit: 'kg/m³', standard: 'EN 12390-7' },
      { name: 'Exposure class', value: 'XC4, XD1', standard: 'EN 206' },
    ],
  },
  {
    sku: 'FRT-CON-C4050',
    name: 'Ready-Mix Concrete C40/50',
    category: 'concrete',
    description:
      'High-strength ready-mix concrete for heavily loaded columns, transfer structures and elements exposed to chlorides.',
    properties: [
      { name: 'Characteristic compressive strength, cylinder (28 days)', value: 40, unit: 'MPa', standard: 'EN 206' },
      { name: 'Characteristic compressive strength, cube (28 days)', value: 50, unit: 'MPa', standard: 'EN 12390-3' },
      { name: 'Slump class', value: 'S4', standard: 'EN 12350-2' },
      { name: 'Maximum aggregate size', value: 16, unit: 'mm', standard: 'EN 12620' },
      { name: 'Density', value: 2400, unit: 'kg/m³', standard: 'EN 12390-7' },
      { name: 'Exposure class', value: 'XD3, XS3', standard: 'EN 206' },
    ],
  },
  {
    sku: 'FRT-CON-H2835',
    name: 'Heritage Mix H28 (discontinued)',
    category: 'concrete',
    description:
      'Discontinued C28/35 mix kept for records of past deliveries. No longer supplied.',
    visibleToBot: false,
    properties: [
      { name: 'Characteristic compressive strength, cylinder (28 days)', value: 28, unit: 'MPa', standard: 'EN 206' },
      { name: 'Characteristic compressive strength, cube (28 days)', value: 35, unit: 'MPa', standard: 'EN 12390-3' },
      { name: 'Slump class', value: 'S2', standard: 'EN 12350-2' },
      { name: 'Maximum aggregate size', value: 20, unit: 'mm', standard: 'EN 12620' },
      { name: 'Density', value: 2360, unit: 'kg/m³', standard: 'EN 12390-7' },
    ],
  },

  // reinforcing-steel
  {
    sku: 'FRT-RST-B500B12',
    name: 'Reinforcing Bar B500B 12 mm',
    category: 'reinforcing-steel',
    description:
      'Ribbed weldable reinforcing bar for slabs, walls and links in reinforced concrete.',
    properties: [
      { name: 'Characteristic yield strength', value: 500, unit: 'MPa', standard: 'EN 10080' },
      { name: 'Tensile strength', value: 540, unit: 'MPa', standard: 'ISO 15630-1' },
      { name: 'Elongation at maximum force (Agt)', value: 5, unit: '%', standard: 'ISO 15630-1' },
      { name: 'Nominal diameter', value: 12, unit: 'mm', standard: 'EN 10080' },
      { name: 'Mass per metre', value: 0.888, unit: 'kg/m', standard: 'EN 10080' },
    ],
  },
  {
    sku: 'FRT-RST-B500B16',
    name: 'Reinforcing Bar B500B 16 mm',
    category: 'reinforcing-steel',
    description:
      'Ribbed weldable reinforcing bar for beams, columns and foundations in reinforced concrete.',
    properties: [
      { name: 'Characteristic yield strength', value: 500, unit: 'MPa', standard: 'EN 10080' },
      { name: 'Tensile strength', value: 540, unit: 'MPa', standard: 'ISO 15630-1' },
      { name: 'Elongation at maximum force (Agt)', value: 5, unit: '%', standard: 'ISO 15630-1' },
      { name: 'Nominal diameter', value: 16, unit: 'mm', standard: 'EN 10080' },
      { name: 'Mass per metre', value: 1.58, unit: 'kg/m', standard: 'EN 10080' },
    ],
  },
  {
    sku: 'FRT-RST-M10200',
    name: 'Welded Reinforcing Mesh B500A 10 mm at 200 mm',
    category: 'reinforcing-steel',
    description:
      'Square welded fabric for crack control and reinforcement of ground slabs and suspended slabs.',
    properties: [
      { name: 'Characteristic yield strength', value: 500, unit: 'MPa', standard: 'EN 10080' },
      { name: 'Tensile strength', value: 525, unit: 'MPa', standard: 'ISO 15630-2' },
      { name: 'Elongation at maximum force (Agt)', value: 2.5, unit: '%', standard: 'ISO 15630-2' },
      { name: 'Wire diameter', value: 10, unit: 'mm', standard: 'EN 10080' },
      { name: 'Wire spacing', value: 200, unit: 'mm' },
      { name: 'Mass per square metre', value: 6.16, unit: 'kg/m²', standard: 'EN 10080' },
    ],
  },

  // structural-steel
  {
    sku: 'FRT-STS-UB406S355',
    name: 'Universal Beam 406 x 178 x 60 S355JR',
    category: 'structural-steel',
    description:
      'Hot-rolled I-section for primary floor beams and rafters in steel-framed buildings.',
    properties: [
      { name: 'Minimum yield strength', value: 355, unit: 'MPa', standard: 'EN 10025-2' },
      { name: 'Tensile strength', value: 470, unit: 'MPa', standard: 'EN 10025-2' },
      { name: 'Elastic modulus', value: 210, unit: 'GPa', standard: 'EN 1993-1-1' },
      { name: 'Mass per metre', value: 60.1, unit: 'kg/m', standard: 'EN 10365' },
      { name: 'Section depth', value: 406.4, unit: 'mm', standard: 'EN 10365' },
    ],
  },
  {
    sku: 'FRT-STS-SHS100S275',
    name: 'Square Hollow Section 100 x 100 x 5 S275J0H',
    category: 'structural-steel',
    description:
      'Hot-finished square hollow section for columns, bracing and exposed architectural steelwork.',
    properties: [
      { name: 'Minimum yield strength', value: 275, unit: 'MPa', standard: 'EN 10210-1' },
      { name: 'Tensile strength', value: 410, unit: 'MPa', standard: 'EN 10210-1' },
      { name: 'Elastic modulus', value: 210, unit: 'GPa', standard: 'EN 1993-1-1' },
      { name: 'Mass per metre', value: 14.7, unit: 'kg/m', standard: 'EN 10210-2' },
      { name: 'Wall thickness', value: 5, unit: 'mm', standard: 'EN 10210-2' },
    ],
  },

  // timber
  {
    sku: 'FRT-TIM-C24',
    name: 'Structural Softwood C24 47 x 195',
    category: 'timber',
    description:
      'Kiln-dried, strength-graded softwood for floor joists, rafters and stud walls.',
    properties: [
      { name: 'Characteristic bending strength', value: 24, unit: 'MPa', standard: 'EN 338' },
      { name: 'Mean modulus of elasticity', value: 11000, unit: 'MPa', standard: 'EN 338' },
      { name: 'Characteristic density', value: 350, unit: 'kg/m³', standard: 'EN 338' },
      { name: 'Moisture content', value: 18, unit: '%', standard: 'EN 14081-1' },
      { name: 'Service class', value: '1 and 2', standard: 'EN 1995-1-1' },
    ],
  },
  {
    sku: 'FRT-TIM-GL28H',
    name: 'Glulam Beam GL28h 140 x 405',
    category: 'timber',
    description:
      'Homogeneous glued laminated timber for long-span roof beams, purlins and exposed frames.',
    properties: [
      { name: 'Characteristic bending strength', value: 28, unit: 'MPa', standard: 'EN 14080' },
      { name: 'Mean modulus of elasticity', value: 12600, unit: 'MPa', standard: 'EN 14080' },
      { name: 'Characteristic density', value: 425, unit: 'kg/m³', standard: 'EN 14080' },
      { name: 'Moisture content', value: 12, unit: '%', standard: 'EN 14080' },
      { name: 'Service class', value: '1 and 2', standard: 'EN 1995-1-1' },
    ],
  },
  {
    sku: 'FRT-TIM-CLT120',
    name: 'CLT Panel 120 mm (3-layer)',
    category: 'timber',
    description:
      'Cross-laminated timber panel for load-bearing walls, floors and roofs in mass-timber buildings.',
    properties: [
      { name: 'Characteristic bending strength', value: 24, unit: 'MPa', standard: 'EN 16351' },
      { name: 'Mean modulus of elasticity', value: 11600, unit: 'MPa', standard: 'EN 16351' },
      { name: 'Mean density', value: 470, unit: 'kg/m³', standard: 'EN 16351' },
      { name: 'Moisture content', value: 12, unit: '%', standard: 'EN 16351' },
      { name: 'Service class', value: '1 and 2', standard: 'EN 1995-1-1' },
      { name: 'Thickness', value: 120, unit: 'mm' },
    ],
  },

  // masonry
  {
    sku: 'FRT-MAS-BRK65',
    name: 'Clay Facing Brick 65 mm Red Multi',
    category: 'masonry',
    description:
      'Frost-resistant clay facing brick for external cavity walls and garden walls.',
    properties: [
      { name: 'Mean compressive strength', value: 40, unit: 'MPa', standard: 'EN 772-1' },
      { name: 'Water absorption', value: 10, unit: '%', standard: 'EN 772-21' },
      { name: 'Thermal conductivity', value: 0.77, unit: 'W/m·K', standard: 'EN 1745' },
      { name: 'Dimensions (L x W x H)', value: '215 x 102.5 x 65', unit: 'mm', standard: 'EN 772-16' },
      { name: 'Gross dry density', value: 1850, unit: 'kg/m³', standard: 'EN 772-13' },
    ],
  },
  {
    sku: 'FRT-MAS-BLK140D',
    name: 'Dense Concrete Block 140 mm 7.3N',
    category: 'masonry',
    description:
      'Dense aggregate concrete block for load-bearing walls, party walls and work below ground.',
    properties: [
      { name: 'Mean compressive strength', value: 7.3, unit: 'MPa', standard: 'EN 772-1' },
      { name: 'Water absorption', value: 7, unit: '%', standard: 'EN 772-11' },
      { name: 'Thermal conductivity', value: 1.33, unit: 'W/m·K', standard: 'EN 1745' },
      { name: 'Dimensions (L x W x H)', value: '440 x 140 x 215', unit: 'mm', standard: 'EN 772-16' },
      { name: 'Gross dry density', value: 2000, unit: 'kg/m³', standard: 'EN 772-13' },
    ],
  },
  {
    sku: 'FRT-MAS-AAC100',
    name: 'Aerated Concrete (AAC) Block 100 mm',
    category: 'masonry',
    description:
      'Lightweight autoclaved aerated concrete block for the inner leaf of cavity walls and internal partitions.',
    properties: [
      { name: 'Mean compressive strength', value: 3.6, unit: 'MPa', standard: 'EN 772-1' },
      { name: 'Water absorption', value: 45, unit: '%', standard: 'EN 772-11' },
      { name: 'Thermal conductivity', value: 0.15, unit: 'W/m·K', standard: 'EN 1745' },
      { name: 'Dimensions (L x W x H)', value: '440 x 100 x 215', unit: 'mm', standard: 'EN 772-16' },
      { name: 'Gross dry density', value: 600, unit: 'kg/m³', standard: 'EN 772-13' },
    ],
  },

  // insulation
  {
    sku: 'FRT-INS-MW100',
    name: 'Mineral Wool Slab 100 mm',
    category: 'insulation',
    description:
      'Non-combustible rigid stone wool slab for external wall insulation, flat roofs and fire stopping.',
    properties: [
      { name: 'Thermal conductivity', value: 0.036, unit: 'W/m·K', standard: 'EN 12667' },
      { name: 'Reaction-to-fire class', value: 'A1', standard: 'EN 13501-1' },
      { name: 'Compressive strength at 10 % deformation', value: 30, unit: 'kPa', standard: 'EN 826' },
      { name: 'Density', value: 100, unit: 'kg/m³', standard: 'EN 1602' },
      { name: 'Thickness', value: 100, unit: 'mm', standard: 'EN 823' },
    ],
  },
  {
    sku: 'FRT-INS-PIR080',
    name: 'PIR Insulation Board 80 mm',
    category: 'insulation',
    description:
      'Foil-faced rigid polyisocyanurate board for pitched roofs, cavity walls and floors where thickness is limited.',
    properties: [
      { name: 'Thermal conductivity', value: 0.022, unit: 'W/m·K', standard: 'EN 12667' },
      { name: 'Reaction-to-fire class', value: 'E', standard: 'EN 13501-1' },
      { name: 'Compressive strength at 10 % deformation', value: 150, unit: 'kPa', standard: 'EN 826' },
      { name: 'Density', value: 32, unit: 'kg/m³', standard: 'EN 1602' },
      { name: 'Thickness', value: 80, unit: 'mm', standard: 'EN 823' },
    ],
  },
  {
    sku: 'FRT-INS-XPS050',
    name: 'XPS Insulation Board 50 mm',
    category: 'insulation',
    description:
      'Closed-cell extruded polystyrene board for inverted roofs, basement walls and floors under load.',
    properties: [
      { name: 'Thermal conductivity', value: 0.034, unit: 'W/m·K', standard: 'EN 12667' },
      { name: 'Reaction-to-fire class', value: 'E', standard: 'EN 13501-1' },
      { name: 'Compressive strength at 10 % deformation', value: 300, unit: 'kPa', standard: 'EN 826' },
      { name: 'Density', value: 33, unit: 'kg/m³', standard: 'EN 1602' },
      { name: 'Thickness', value: 50, unit: 'mm', standard: 'EN 823' },
    ],
  },
  {
    sku: 'FRT-INS-KT07',
    name: 'Project Kestrel Trial Board KT-07 (internal)',
    category: 'insulation',
    description:
      'Internal trial of a thin high-performance board. Not released for sale; figures are provisional.',
    visibleToBot: false,
    properties: [
      { name: 'Thermal conductivity', value: 0.019, unit: 'W/m·K', standard: 'EN 12667' },
      { name: 'Reaction-to-fire class', value: 'B-s1, d0', standard: 'EN 13501-1' },
      { name: 'Compressive strength at 10 % deformation', value: 120, unit: 'kPa', standard: 'EN 826' },
      { name: 'Density', value: 110, unit: 'kg/m³', standard: 'EN 1602' },
      { name: 'Thickness', value: 40, unit: 'mm', standard: 'EN 823' },
    ],
  },

  // cement-mortar
  {
    sku: 'FRT-CEM-I525N',
    name: 'Portland Cement CEM I 52.5N',
    category: 'cement-mortar',
    description:
      'High early strength Portland cement for precast elements, structural concrete and cold-weather work.',
    properties: [
      { name: 'Strength class', value: '52.5 N', standard: 'EN 197-1' },
      { name: 'Compressive strength at 2 days', value: 27, unit: 'MPa', standard: 'EN 196-1' },
      { name: 'Compressive strength at 28 days', value: 60, unit: 'MPa', standard: 'EN 196-1' },
      { name: 'Initial setting time', value: 150, unit: 'min', standard: 'EN 196-3' },
      { name: 'Soundness (expansion)', value: 1, unit: 'mm', standard: 'EN 196-3' },
    ],
  },
  {
    sku: 'FRT-CEM-MORM4',
    name: 'Masonry Mortar M4 (dry premix)',
    category: 'cement-mortar',
    description:
      'General-purpose bricklaying and blocklaying mortar for walls above ground. Add water only.',
    properties: [
      { name: 'Strength class', value: 'M4', standard: 'EN 998-2' },
      { name: 'Compressive strength at 28 days', value: 4, unit: 'MPa', standard: 'EN 1015-11' },
      { name: 'Setting time (workable life)', value: 120, unit: 'min', standard: 'EN 1015-9' },
      { name: 'Maximum aggregate size', value: 2, unit: 'mm', standard: 'EN 1015-1' },
      { name: 'Dry bulk density', value: 1800, unit: 'kg/m³', standard: 'EN 1015-10' },
    ],
  },
];

/** SKUs the bot must never see. Tests use these to check the visibility rule. */
export const hiddenSkus: string[] = seedProducts
  .filter((product) => product.visibleToBot === false)
  .map((product) => product.sku);
