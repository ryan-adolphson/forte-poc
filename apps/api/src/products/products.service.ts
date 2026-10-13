import { Inject, Injectable } from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Product, ProductProperty } from './product.js';

const MAX_RESULTS = 25;

/** Makes user text match literally in ILIKE (backslash is Postgres's default escape). */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/**
 * The only data access the assistant has.
 *
 * Every query starts from `visible()`, which filters `visibleToBot = true` in SQL and
 * returns only the columns of `Product`. A hidden product and a non-existent one are
 * therefore indistinguishable to callers. New methods must start from `visible()` too.
 */
@Injectable()
export class ProductsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private visible() {
    return this.prisma.db.orm.public.Product.where({ visibleToBot: true });
  }

  /**
   * Case-insensitive match of `query` against name, sku and description, with an
   * optional exact category. No params returns all visible products (capped).
   */
  async search(params: { query?: string; category?: string } = {}): Promise<Product[]> {
    const query = params.query?.trim();
    const category = params.category?.trim();

    let products = this.visible();
    if (category) {
      products = products.where({ category });
    }
    if (query) {
      const pattern = `%${escapeLike(query)}%`;
      products = products.where((p) =>
        or(p.name.ilike(pattern), p.sku.ilike(pattern), p.description.ilike(pattern)),
      );
    }

    const rows = await products
      .select('sku', 'name', 'category', 'description', 'properties')
      .orderBy([(p) => p.category.asc(), (p) => p.name.asc()])
      .limit(MAX_RESULTS)
      .all();
    return rows.map(toProduct);
  }

  /** Case-insensitive exact match. Returns null for unknown and for hidden SKUs alike. */
  async getBySku(sku: string): Promise<Product | null> {
    const row = await this.visible()
      .where((p) => p.sku.ilike(escapeLike(sku.trim())))
      .select('sku', 'name', 'category', 'description', 'properties')
      .first();
    return row === null ? null : toProduct(row);
  }

  /** Distinct categories that have at least one visible product, sorted. */
  async listCategories(): Promise<string[]> {
    const groups = await this.visible()
      .groupBy('category')
      .aggregate((aggregate) => ({ products: aggregate.count() }));
    return groups.map((group) => group.category).sort();
  }
}

type ProductRow = Omit<Product, 'properties'> & { properties: unknown };

function toProduct(row: ProductRow): Product {
  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    description: row.description,
    // The column is untyped JSON; the seed is the only writer and is typed as Product.
    properties: row.properties as ProductProperty[],
  };
}
