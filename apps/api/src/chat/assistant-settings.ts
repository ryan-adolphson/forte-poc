import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  AssistantSettings,
  AssistantSettingsResponse,
  ChatProviderId,
  SettingsErrorBody,
  UpdateAssistantSettingsRequest,
} from '@forte/chat-contract';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { SettingsService, type AssistantSetting } from '../settings/settings.service.js';
import { modelsFor, PROVIDER_IDS, PROVIDER_LABELS } from './models.js';
import { CHAT_MODELS, type ChatModels } from './provider.js';

/**
 * Where a turn's provider and model came from, for the log line: the saved setting, the
 * default because nothing was saved, or the default because the saved value is not usable
 * now (its provider lost its key, or its model is no longer allowed).
 */
export type SettingSource = 'saved' | 'default' | 'fallback';

export type ResolvedAssistant = {
  /** Null when no provider has a key: the turn ends with `not_configured`. */
  current: AssistantSettings | null;
  source: SettingSource;
  saved: AssistantSetting | null;
};

/**
 * The app-wide assistant setting with its rules: which providers and models may be chosen
 * and what a chat turn uses right now. Storage is `SettingsService`; this decides.
 */
@Injectable()
export class AssistantSettingsResolver {
  constructor(
    @Inject(CHAT_MODELS) private readonly models: ChatModels,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /** The provider's model when nothing is saved: `GEMINI_MODEL` / `CLAUDE_MODEL`. */
  private defaultModel(provider: ChatProviderId): string {
    return provider === 'gemini' ? this.config.geminiModel : this.config.claudeModel;
  }

  private configured(provider: ChatProviderId): boolean {
    return this.models[provider] !== null;
  }

  /** Null when the value can be used now, otherwise why not (for the 400 message). */
  private problem(provider: string, model: string): string | null {
    if (!PROVIDER_IDS.includes(provider as ChatProviderId)) return `Unknown provider "${provider}".`;
    const id = provider as ChatProviderId;
    if (!this.configured(id)) return `${PROVIDER_LABELS[id]} is not configured on the server.`;
    if (!modelsFor(id, this.defaultModel(id)).some((option) => option.id === model)) {
      return `"${model}" is not an allowed ${PROVIDER_LABELS[id]} model.`;
    }
    return null;
  }

  /**
   * What a chat turn uses now: the saved value when it is usable, otherwise Gemini with
   * `GEMINI_MODEL` if Gemini has a key, otherwise Claude with `CLAUDE_MODEL`, otherwise null.
   */
  async resolve(): Promise<ResolvedAssistant> {
    const saved = await this.settings.getAssistant();
    if (saved !== null && this.problem(saved.provider, saved.model) === null) {
      return { current: { provider: saved.provider as ChatProviderId, model: saved.model }, source: 'saved', saved };
    }
    const provider = PROVIDER_IDS.find((id) => this.configured(id));
    return {
      current: provider === undefined ? null : { provider, model: this.defaultModel(provider) },
      source: saved === null ? 'default' : 'fallback',
      saved,
    };
  }

  /** Body of GET /api/settings/assistant. */
  async response(): Promise<AssistantSettingsResponse> {
    const { current, saved } = await this.resolve();
    return {
      // With no provider configured nothing can answer; Gemini's default is shown, and
      // every option says `configured: false`.
      current: current ?? { provider: 'gemini', model: this.defaultModel('gemini') },
      options: PROVIDER_IDS.map((id) => ({
        id,
        label: PROVIDER_LABELS[id],
        configured: this.configured(id),
        models: modelsFor(id, this.defaultModel(id)),
      })),
      updatedAt: saved?.updatedAt ?? null,
    };
  }

  /** Saves a usable value, or throws 400 `invalid_setting`. Returns the new response. */
  async save(value: UpdateAssistantSettingsRequest): Promise<AssistantSettingsResponse> {
    const problem = this.problem(value.provider, value.model);
    if (problem !== null) {
      const body: SettingsErrorBody = { code: 'invalid_setting', message: problem };
      throw new BadRequestException(body);
    }
    await this.settings.setAssistant({ provider: value.provider, model: value.model });
    return this.response();
  }
}
