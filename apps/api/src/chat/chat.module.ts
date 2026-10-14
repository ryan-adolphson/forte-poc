import { Module } from '@nestjs/common';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AssistantSettingsController } from './assistant-settings.controller.js';
import { AssistantSettingsResolver } from './assistant-settings.js';
import { ChatThrottlerGuard } from './chat-throttler.guard.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ClaudeConversations } from './claude-conversations.js';
import { CLAUDE_STREAM, claudeModel, claudeStreamProvider, type ClaudeStream } from './claude.js';
import { GEMINI_STREAM, geminiModel, geminiStreamProvider, type GeminiStream } from './gemini.js';
import { CHAT_MODELS, type ChatModels } from './provider.js';

@Module({
  imports: [
    ProductsModule,
    DocumentsModule,
    SettingsModule,
    // In memory, keyed by client IP. Used only by ChatThrottlerGuard on the chat route.
    ThrottlerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => [
        // The throttler takes milliseconds; the config is in seconds.
        { limit: config.chatRateLimit, ttl: seconds(config.chatRateTtlSeconds) },
      ],
    }),
  ],
  controllers: [ChatController, AssistantSettingsController],
  providers: [
    ChatService,
    AssistantSettingsResolver,
    ChatThrottlerGuard,
    geminiStreamProvider,
    claudeStreamProvider,
    ClaudeConversations,
    {
      // The tests replace GEMINI_STREAM / CLAUDE_STREAM with fakes; the adapters stay real.
      provide: CHAT_MODELS,
      inject: [GEMINI_STREAM, CLAUDE_STREAM, ClaudeConversations],
      useFactory: (
        gemini: GeminiStream | null,
        claude: ClaudeStream | null,
        conversations: ClaudeConversations,
      ): ChatModels => ({
        gemini: gemini && geminiModel(gemini),
        claude: claude && claudeModel(claude, conversations),
      }),
    },
  ],
  exports: [ChatService],
})
export class ChatModule {}
