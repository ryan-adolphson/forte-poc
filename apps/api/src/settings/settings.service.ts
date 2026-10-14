import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** The assistant's provider and model as saved on the server, with when it was last saved. */
export interface AssistantSetting {
  provider: string;
  model: string;
  /** ISO 8601 timestamp of the last save. */
  updatedAt: string;
}

/** The one row of `assistant_settings`. The database refuses any other id. */
const ROW_ID = 1;

/**
 * Stores and reads the app-wide assistant setting. Storage only: which providers and models
 * are allowed is checked by the caller. Not for anything served to the assistant.
 */
@Injectable()
export class SettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** The saved setting, or null when it was never saved (use the configured default). */
  async getAssistant(): Promise<AssistantSetting | null> {
    const row = await this.prisma.db.orm.public.AssistantSetting.where({ id: ROW_ID })
      .select('provider', 'model', 'updatedAt')
      .first();
    return row === null ? null : toSetting(row);
  }

  /** Saves the setting, creating or overwriting the one row, and returns what was saved. */
  async setAssistant(value: { provider: string; model: string }): Promise<AssistantSetting> {
    const { provider, model } = value;
    const row = await this.prisma.db.orm.public.AssistantSetting.select(
      'provider',
      'model',
      'updatedAt',
    ).upsert({
      create: { id: ROW_ID, provider, model },
      update: { provider, model },
    });
    return toSetting(row);
  }
}

function toSetting(row: { provider: string; model: string; updatedAt: string }): AssistantSetting {
  // Normalise to ISO 8601 whatever text form the codec hands back.
  return { provider: row.provider, model: row.model, updatedAt: new Date(row.updatedAt).toISOString() };
}
