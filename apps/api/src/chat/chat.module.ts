import { Module } from '@nestjs/common';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { ProductsModule } from '../products/products.module.js';
import { ChatThrottlerGuard } from './chat-throttler.guard.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { geminiStreamProvider } from './gemini.js';

@Module({
  imports: [
    ProductsModule,
    // In memory, keyed by client IP. Used only by ChatThrottlerGuard on the chat route.
    ThrottlerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => [
        // The throttler takes milliseconds; the config is in seconds.
        { limit: config.chatRateLimit, ttl: seconds(config.chatRateTtlSeconds) },
      ],
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatThrottlerGuard, geminiStreamProvider],
  exports: [ChatService],
})
export class ChatModule {}
