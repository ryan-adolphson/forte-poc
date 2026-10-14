import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { CLAUDE_STREAM } from '../src/chat/claude.js';
import { GEMINI_STREAM } from '../src/chat/gemini.js';
import { appConfig, validateEnv } from '../src/config/app.config.js';
import { configureApp } from '../src/configure-app.js';
import { SettingsService } from '../src/settings/settings.service.js';
import type { fakeClaude } from './fake-claude.js';
import type { fakeGemini } from './fake-gemini.js';
import { fakeSettings } from './fake-settings.js';

/**
 * The app with the Gemini and Claude seams replaced by fakes, so no test calls a real
 * model. Claude is configured only when a fake is given; `config` overrides the loaded
 * settings. The assistant setting is an in-memory fake (nothing saved: the server default)
 * unless `realSettings` is set: the real one is a single shared database row, so only
 * `settings.e2e-spec.ts`, which saves and restores it, uses it.
 */
export async function createApp(
  gemini: ReturnType<typeof fakeGemini>,
  chatRateLimit?: number,
  claude?: ReturnType<typeof fakeClaude>,
  config: Record<string, unknown> = {},
  realSettings = false,
) {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GEMINI_STREAM)
    .useValue(gemini.stream)
    .overrideProvider(CLAUDE_STREAM)
    .useValue(claude?.stream ?? null);
  // AppModule's ConfigModule has already loaded .env into process.env.
  builder.overrideProvider(appConfig.KEY).useValue({
    ...validateEnv(process.env),
    ...(chatRateLimit === undefined ? {} : { chatRateLimit }),
    ...config,
  });
  if (!realSettings) builder.overrideProvider(SettingsService).useValue(fakeSettings());
  const app: INestApplication<App> = (await builder.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Parses an SSE body into `{ event, data }` pairs. */
export function parseEvents(body: string) {
  return body
    .trim()
    .split('\n\n')
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n');
      return {
        event: eventLine!.replace(/^event: /, ''),
        data: JSON.parse(dataLine!.replace(/^data: /, '')) as unknown,
      };
    });
}
