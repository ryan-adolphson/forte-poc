import { AssistantSettingsResolver } from '../src/chat/assistant-settings.js';
import type { ChatModels } from '../src/chat/provider.js';
import type { AppConfig } from '../src/config/app.config.js';
import type { AssistantSetting, SettingsService } from '../src/settings/settings.service.js';

/** The configured default models the unit tests assume. */
export const TEST_CONFIG = { geminiModel: 'gemini-3.8-flash', claudeModel: 'claude-sonnet-5-5' } as AppConfig;

/** An in-memory `SettingsService`: the one row, or null when never saved. */
export function fakeSettings(saved: { provider: string; model: string } | null = null) {
  let row: AssistantSetting | null = saved && { ...saved, updatedAt: '2026-10-14T09:00:00.000Z' };
  const settings = {
    getAssistant: async () => row,
    setAssistant: async (value: { provider: string; model: string }) => {
      row = { ...value, updatedAt: new Date().toISOString() };
      return row;
    },
  };
  return settings as unknown as SettingsService;
}

/** A resolver over the given providers and saved row, with `TEST_CONFIG` unless overridden. */
export function testResolver(
  models: ChatModels,
  saved: { provider: string; model: string } | null = null,
  config: Partial<AppConfig> = {},
) {
  return new AssistantSettingsResolver(models, { ...TEST_CONFIG, ...config }, fakeSettings(saved));
}
