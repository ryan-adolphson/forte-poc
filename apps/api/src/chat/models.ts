import type { AssistantModelOption, ChatProviderId } from '@forte/chat-contract';

/**
 * The models the Settings page may choose, per provider. Each id was checked against the
 * current-model lists of the `gemini-api-dev` skill and the `claude-api` skill. A model's
 * request differences live in its adapter (`gemini.ts`, `claude.ts`).
 */
export const ALLOWED_MODELS: Record<ChatProviderId, readonly AssistantModelOption[]> = {
  gemini: [
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  ],
  claude: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  ],
};

export const PROVIDER_LABELS: Record<ChatProviderId, string> = { gemini: 'Gemini', claude: 'Claude' };

/** Order of preference for the default when nothing usable is saved. */
export const PROVIDER_IDS: readonly ChatProviderId[] = ['gemini', 'claude'];

/**
 * The models a provider may use: the fixed list, plus the provider's configured default
 * (`GEMINI_MODEL` / `CLAUDE_MODEL`) when an operator set one that is not in the list, so
 * the override keeps working and can be chosen again. It is labelled with its id.
 */
export function modelsFor(provider: ChatProviderId, configuredDefault: string): AssistantModelOption[] {
  const listed = ALLOWED_MODELS[provider];
  return listed.some((model) => model.id === configuredDefault)
    ? [...listed]
    : [...listed, { id: configuredDefault, label: configuredDefault }];
}
