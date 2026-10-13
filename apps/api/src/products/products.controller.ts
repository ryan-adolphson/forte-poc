import { Controller, Get, Inject } from '@nestjs/common';
import type { ProductListResponse } from '@forte/chat-contract';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  /** The product page's catalogue: the same bot-visible set the assistant can see. */
  @Get()
  async list(): Promise<ProductListResponse> {
    return { products: await this.products.listAllWithDetails() };
  }
}
