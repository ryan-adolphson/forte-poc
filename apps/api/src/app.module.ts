import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module.js';
import { appConfig } from './config/app.config.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [
    // Global, so any provider can inject `appConfig.KEY` without importing ConfigModule.
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    PrismaModule,
    ProductsModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
