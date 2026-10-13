import { isDeepStrictEqual } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { PrismaService } from './prisma.service.js';
import { seedProducts } from './seed-data.js';

/**
 * Upserts the sample products by SKU. Safe to re-run: a row that already matches is
 * left untouched, so a second run writes nothing. Run with `npm run db:seed -w api`.
 */
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
const { Product } = app.get(PrismaService).db.orm.public;

const existing = new Map(
  (
    await Product.select(
      'sku',
      'name',
      'category',
      'description',
      'visibleToBot',
      'properties',
    ).all()
  ).map((row) => [row.sku, row]),
);

let created = 0;
let updated = 0;
for (const { visibleToBot = true, ...product } of seedProducts) {
  const wanted = { ...product, visibleToBot };
  const current = existing.get(product.sku);
  if (current === undefined) {
    await Product.create(wanted);
    created += 1;
  } else if (!isDeepStrictEqual({ ...current }, wanted)) {
    await Product.where({ sku: product.sku }).update(wanted);
    updated += 1;
  }
}

console.log(
  `Seeded products: ${created} created, ${updated} updated, ${seedProducts.length - created - updated} unchanged.`,
);
await app.close();
