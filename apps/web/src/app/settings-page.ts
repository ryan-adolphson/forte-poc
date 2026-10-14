import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormField, form, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatRadioButton, MatRadioChange, MatRadioGroup } from '@angular/material/radio';
import { MatOption, MatSelect } from '@angular/material/select';
import type {
  AssistantSettings,
  AssistantSettingsResponse,
  ChatProviderId,
  SettingsErrorBody,
  UpdateAssistantSettingsRequest,
} from '@forte/chat-contract';
import { firstValueFrom } from 'rxjs';

const URL = '/api/settings/assistant';
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The assistant model: which provider and model answer every chat. Saved on the server and
 * shared by everyone using the app.
 */
@Component({
  imports: [
    FormField,
    MatButton,
    MatFormField,
    MatLabel,
    MatOption,
    MatProgressSpinner,
    MatRadioButton,
    MatRadioGroup,
    MatSelect,
  ],
  selector: 'app-settings-page',
  styleUrl: './settings-page.css',
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  private readonly http = inject(HttpClient);

  /** What the server has now. Replaced by the PUT's answer after a save. */
  protected readonly settings = httpResource<AssistantSettingsResponse>(() => URL);

  /** The choice in the form: the current setting until the user changes it, and after a save. */
  private readonly choice = linkedSignal<AssistantSettings>(() =>
    this.settings.hasValue() ? { ...this.settings.value().current } : { provider: 'gemini', model: '' },
  );
  protected readonly form = form(this.choice);

  protected readonly options = computed(() =>
    this.settings.hasValue() ? this.settings.value().options : [],
  );
  /** The models of the chosen provider, for the select. */
  protected readonly models = computed(
    () => this.options().find((p) => p.id === this.choice().provider)?.models ?? [],
  );
  /** The current setting as people read it, for example `Claude · Claude Sonnet 5.5`. */
  protected readonly currentLabel = computed(() => {
    if (!this.settings.hasValue()) {
      return '';
    }
    const { provider, model } = this.settings.value().current;
    return this.describe(provider, model);
  });
  /**
   * When the setting was last saved, for example `14 Oct 2026, 17:56` in the browser's time zone,
   * or null while the server default applies. `Intl`, not DatePipe: the pipe's code would be
   * shared with, and so loaded by, the first page.
   */
  protected readonly lastChanged = computed(() => {
    const updatedAt = this.settings.hasValue() ? this.settings.value().updatedAt : null;
    return updatedAt ? DATE_TIME.format(new Date(updatedAt)) : null;
  });
  protected readonly changed = computed(() => {
    const current = this.settings.hasValue() ? this.settings.value().current : null;
    const choice = this.choice();
    return !!current && (choice.provider !== current.provider || choice.model !== current.model);
  });

  protected readonly saving = signal(false);
  /** The polite message after a successful save. */
  protected readonly saved = signal<string | null>(null);
  /** Why the last save failed. */
  protected readonly saveError = signal<string | null>(null);

  /** A different provider keeps the model if that provider has it, else takes its first model. */
  protected chooseProvider(change: MatRadioChange): void {
    const provider = change.value as ChatProviderId;
    const models = this.options().find((p) => p.id === provider)?.models ?? [];
    this.choice.update(({ model }) => ({
      provider,
      model: models.some((m) => m.id === model) ? model : (models[0]?.id ?? ''),
    }));
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (!this.changed() || this.saving()) {
      return;
    }
    void submit(this.form, async () => {
      this.saving.set(true);
      this.saved.set(null);
      this.saveError.set(null);
      const body: UpdateAssistantSettingsRequest = { ...this.choice() };
      try {
        const response = await firstValueFrom(
          this.http.put<AssistantSettingsResponse>(URL, body),
        );
        this.settings.set(response);
        const { provider, model } = response.current;
        this.saved.set(`Saved. New questions use ${this.modelLabel(provider, model)}.`);
      } catch (error) {
        const body = error instanceof HttpErrorResponse ? error.error : null;
        this.saveError.set(
          (body as SettingsErrorBody | null)?.code === 'invalid_setting'
            ? (body as SettingsErrorBody).message
            : 'The setting could not be saved. Try again.',
        );
      } finally {
        this.saving.set(false);
      }
    });
  }

  private modelLabel(provider: ChatProviderId, model: string): string {
    const option = this.options().find((p) => p.id === provider);
    return option?.models.find((m) => m.id === model)?.label ?? model;
  }

  private describe(provider: ChatProviderId, model: string): string {
    const option = this.options().find((p) => p.id === provider);
    return `${option?.label ?? provider} · ${this.modelLabel(provider, model)}`;
  }
}
