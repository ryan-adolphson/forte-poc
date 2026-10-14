import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatRadioButtonHarness, MatRadioGroupHarness } from '@angular/material/radio/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import type { AssistantSettingsResponse } from '@forte/chat-contract';
import { BOTH_CONFIGURED, SETTINGS } from '../testing/assistant-settings';
import { settle } from '../testing/fake-chat-stream';
import { SettingsPage } from './settings-page';

const URL = '/api/settings/assistant';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let root: HTMLElement;
  let loader: HarnessLoader;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SettingsPage);
    root = fixture.nativeElement;
    document.body.append(root);
    loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
  });

  afterEach(() => {
    http.verify();
    root.remove();
  });

  /** Answers the page's GET. Not `whenStable` first: it waits for that very request. */
  async function load(response: AssistantSettingsResponse = SETTINGS): Promise<void> {
    TestBed.tick();
    http.expectOne({ method: 'GET', url: URL }).flush(response);
    await fixture.whenStable();
  }

  const text = (selector: string) => root.querySelector(selector)?.textContent.trim() ?? null;
  const radio = (label: string) => loader.getHarness(MatRadioButtonHarness.with({ label }));
  const select = () => loader.getHarness(MatSelectHarness);
  const saveButton = () => loader.getHarness(MatButtonHarness.with({ text: 'Save' }));
  async function modelLabels(): Promise<string[]> {
    const field = await select();
    await field.open();
    const labels = await Promise.all((await field.getOptions()).map((o) => o.getText()));
    await field.close();
    return labels;
  }

  async function save(): Promise<void> {
    await (await saveButton()).click();
    await settle();
  }

  it('shows the current setting, the server default and the options', async () => {
    await load();

    expect(text('h2')).toBe('Settings');
    expect(text('h3')).toBe('Assistant model');
    expect(text('.intro')).toContain('applies to everyone');
    expect(text('.current dd strong')).toBe('Gemini · Gemini 3.1 Flash-Lite');
    expect(text('.when')).toBe('Server default');

    const group = await loader.getHarness(MatRadioGroupHarness);
    expect(await group.getCheckedValue()).toBe('gemini');
    const host = root.querySelector('mat-radio-group')!;
    expect(text('#' + host.getAttribute('aria-labelledby'))).toBe('Provider');
    expect(await (await select()).getValueText()).toBe('Gemini 3.1 Flash-Lite');
    expect(await modelLabels()).toEqual([
      'Gemini 3.1 Flash-Lite',
      'Gemini 3.5 Flash-Lite',
      'Gemini 3.8 Flash',
    ]);
    expect(await (await saveButton()).isDisabled()).toBe(true); // unchanged
  });

  it('shows when the setting was last changed', async () => {
    await load({ ...SETTINGS, updatedAt: '2026-10-14T09:05:00.000Z' });
    expect(text('.when')).toMatch(/^Last changed 14 Oct 2026, \d\d:\d\d$/);
  });

  it('disables a provider without an API key, with a hint', async () => {
    await load();
    const claude = await radio('Claude');
    expect(await claude.isDisabled()).toBe(true);
    const hint = root.querySelector('#hint-claude')!;
    expect(hint.textContent.trim()).toBe('Not available: no API key on the server');
    const input = root.querySelectorAll('mat-radio-button input')[1];
    expect(input.getAttribute('aria-describedby')).toBe('hint-claude');
    expect(await (await radio('Gemini')).isDisabled()).toBe(false);
  });

  it('switching provider lists its models and selects its first one', async () => {
    await load(BOTH_CONFIGURED);
    await (await radio('Claude')).check();

    expect(await (await select()).getValueText()).toBe('Claude Sonnet 5.5');
    expect(await modelLabels()).toEqual([
      'Claude Sonnet 5.5',
      'Claude Haiku 5.5',
      'Claude Opus 5.5',
    ]);
    expect(await (await saveButton()).isDisabled()).toBe(false);

    await (await radio('Gemini')).check(); // back to the saved choice: nothing to save
    expect(await (await select()).getValueText()).toBe('Gemini 3.1 Flash-Lite');
    expect(await (await saveButton()).isDisabled()).toBe(true);
  });

  it('saves the choice, says so and shows the new current value', async () => {
    await load();
    const field = await select();
    await field.open();
    await field.clickOptions({ text: 'Gemini 3.5 Flash-Lite' });
    await save();

    const request = http.expectOne({ method: 'PUT', url: URL });
    expect(request.request.body).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash-lite' });
    expect(await (await saveButton()).isDisabled()).toBe(true); // while saving
    request.flush({
      ...SETTINGS,
      current: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      updatedAt: '2026-10-14T09:05:00.000Z',
    });
    await settle();
    await fixture.whenStable();

    const status = root.querySelector('.saved')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent.trim()).toBe('Saved. New questions use Gemini 3.5 Flash-Lite.');
    expect(text('.current dd strong')).toBe('Gemini · Gemini 3.5 Flash-Lite');
    expect(text('.when')).toContain('Last changed');
    expect(await (await select()).getValueText()).toBe('Gemini 3.5 Flash-Lite');
    expect(await (await saveButton()).isDisabled()).toBe(true);
  });

  it("shows the server's message for a setting it does not accept", async () => {
    await load(BOTH_CONFIGURED);
    await (await radio('Claude')).check();
    await save();

    http
      .expectOne({ method: 'PUT', url: URL })
      .flush(
        { code: 'invalid_setting', message: 'Claude is not configured on the server.' },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();
    await fixture.whenStable();

    const alert = root.querySelector('.error')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent.trim()).toBe('Claude is not configured on the server.');
    expect(text('.saved')).toBe('');
    expect(text('.current dd strong')).toBe('Gemini · Gemini 3.1 Flash-Lite');
    expect(await (await saveButton()).isDisabled()).toBe(false); // can try again
  });

  it('shows a generic message when saving fails otherwise', async () => {
    await load(BOTH_CONFIGURED);
    await (await radio('Claude')).check();
    await save();
    http.expectOne(URL).flush('', { status: 502, statusText: 'Bad Gateway' });
    await settle();
    await fixture.whenStable();
    expect(text('.error')).toBe('The setting could not be saved. Try again.');
  });

  it('shows a load error with Retry', async () => {
    TestBed.tick();
    expect(text('[role="status"]')).toContain('Loading settings');
    http.expectOne(URL).flush('', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(text('[role="alert"] p')).toBe('The settings could not be loaded.');
    // A native click: the harness would wait for the request that Retry starts.
    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await load();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text('.current dd strong')).toBe('Gemini · Gemini 3.1 Flash-Lite');
  });
});
