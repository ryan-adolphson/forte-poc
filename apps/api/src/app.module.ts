import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { appConfig } from './config/app.config.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [
    // Global, so any provider can inject `appConfig.KEY` without importing ConfigModule.
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    PrismaModule,
    // Registers the global session guard: every route is closed unless marked @Public().
    AuthModule,
    ProductsModule,
    DocumentsModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
