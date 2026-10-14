import type { AssistantSettingsResponse } from '@forte/chat-contract';

/** GET /api/settings/assistant on a server with only a Gemini key and nothing saved. */
export const SETTINGS: AssistantSettingsResponse = {
  current: { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
  options: [
    {
      id: 'gemini',
      label: 'Gemini',
      configured: true,
      models: [
        { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      ],
    },
    {
      id: 'claude',
      label: 'Claude',
      configured: false,
      models: [
        { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
        { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
        { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      ],
    },
  ],
  updatedAt: null,
};

/** The same server with both keys. */
export const BOTH_CONFIGURED: AssistantSettingsResponse = {
  ...SETTINGS,
  options: SETTINGS.options.map((option) => ({ ...option, configured: true })),
};
