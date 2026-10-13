import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [PrismaModule],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
