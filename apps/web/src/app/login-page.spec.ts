import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { settle } from '../testing/fake-chat-stream';
import { routes } from './app.routes';

describe('LoginPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let root: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    document.body.append(harness.fixture.nativeElement); // focus only moves in an attached document
  });

  afterEach(() => {
    harness.fixture.nativeElement.remove();
    // Answer the next page's list request, so nothing is left open.
    for (const request of http.match(() => true)) {
      request.flush({ products: [], documents: [] });
    }
  });

  /** Arrives signed out at an address, which shows the sign-in page. */
  async function arrive(url = '/login'): Promise<void> {
    const navigation = harness.navigateByUrl(url);
    await settle();
    http
      .expectOne('/api/auth/session')
      .flush({ code: 'unauthenticated', message: '' }, { status: 401, statusText: '' });
    await navigation;
    root = harness.routeNativeElement!;
    await settle(); // the focus move after the first render
  }

  const url = () => TestBed.inject(Router).url;
  const form = () => root.querySelector('form')!;
  const username = () => root.querySelector<HTMLInputElement>('input[autocomplete="username"]')!;
  const password = () =>
    root.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
  const button = () => root.querySelector<HTMLButtonElement>('button')!;
  const alert = () => root.querySelector('[role="alert"]')!.textContent.trim();
  const fieldErrors = () =>
    [...root.querySelectorAll('mat-error')].map((error) => error.textContent.trim());
  const labelOf = (input: HTMLInputElement) =>
    root.querySelector(`label[for="${input.id}"]`)!.textContent.trim();

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /** Fills in the form and submits it. The request to the API is left for the test to answer. */
  async function submit(name: string, secret: string): Promise<void> {
    type(username(), name);
    type(password(), secret);
    form().requestSubmit();
    await settle();
  }

  /** Answers the sign-in request and waits for the page to react. */
  async function answer(
    body: object,
    status = 200,
    headers: Record<string, string> = {},
  ): Promise<void> {
    http.expectOne('/api/auth/login').flush(body, { status, statusText: 'Answer', headers });
    await settle();
    await settle();
  }

  it('has a heading, the mark, and labelled fields that a password manager can fill', async () => {
    await arrive();

    expect([...root.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Sign in']);
    expect(root.querySelector('img')!.getAttribute('alt')).toBe('Forte');
    expect(labelOf(username())).toBe('Username');
    expect(labelOf(password())).toBe('Password');
    expect(password().type).toBe('password');
    expect(username().placeholder).toBe('');
    expect(password().placeholder).toBe('');
    expect(form().contains(username()) && form().contains(password())).toBe(true);
    // Enter in a field submits a form through its submit button.
    expect(button().type).toBe('submit');
    expect(button().textContent.trim()).toBe('Sign in');
    expect(form().contains(button())).toBe(true);
  });

  it('puts focus in the username field on arrival', async () => {
    await arrive();
    expect(document.activeElement).toBe(username());
  });

  it('does not call the API with empty fields, and says what is missing', async () => {
    await arrive();
    expect(fieldErrors()).toEqual([]);

    form().requestSubmit();
    await settle();

    http.expectNone('/api/auth/login');
    expect(fieldErrors()).toEqual(['Enter the username.', 'Enter the password.']);
    expect(url()).toBe('/login');
  });

  it('does not call the API without a password', async () => {
    await arrive();
    await submit('someone', '');

    http.expectNone('/api/auth/login');
    expect(fieldErrors()).toEqual(['Enter the password.']);
  });

  it('signs in and goes to the remembered page', async () => {
    await arrive('/documents');
    expect(url()).toBe('/login?returnUrl=%2Fdocuments');

    await submit('someone', 'secret');
    const request = http.expectOne({ method: 'POST', url: '/api/auth/login' });
    expect(request.request.body).toEqual({ username: 'someone', password: 'secret' });
    request.flush({ username: 'someone' });

    await vi.waitFor(() => expect(url()).toBe('/documents'));
  });

  it('goes to the products when no page is remembered', async () => {
    await arrive();
    await submit('someone', 'secret');
    http.expectOne('/api/auth/login').flush({ username: 'someone' });

    await vi.waitFor(() => expect(url()).toBe('/products'));
  });

  it('goes to the products when the remembered page is not inside the app', async () => {
    await arrive('/login?returnUrl=https:%2F%2Fevil.example');
    await submit('someone', 'secret');
    http.expectOne('/api/auth/login').flush({ username: 'someone' });

    await vi.waitFor(() => expect(url()).toBe('/products'));
  });

  it('shows wrong credentials, and empties and refocuses the password', async () => {
    await arrive('/documents');
    expect(alert()).toBe('');

    await submit('someone', 'wrong');
    await answer({ code: 'invalid_credentials', message: 'Wrong.' }, 401);

    expect(alert()).toBe('The username or password is not right.');
    expect(username().value).toBe('someone');
    expect(password().value).toBe('');
    expect(document.activeElement).toBe(password());
    expect(fieldErrors()).toEqual([]);
    expect(url()).toBe('/login?returnUrl=%2Fdocuments');
    expect(button().disabled).toBe(false);
  });

  it('shows how long to wait when rate limited', async () => {
    await arrive();
    await submit('someone', 'secret');
    await answer({ code: 'rate_limited', message: 'Too many.' }, 429, { 'Retry-After': '30' });

    expect(alert()).toBe('Too many attempts. Try again in 30 seconds.');
  });

  it('removes the message of the last attempt when trying again', async () => {
    await arrive();
    await submit('someone', 'wrong');
    await answer({ code: 'invalid_credentials', message: 'Wrong.' }, 401);

    await submit('someone', 'secret');
    expect(alert()).toBe('');
    await answer({ username: 'someone' });
  });

  it('disables the button and shows progress while signing in, and keeps the fields', async () => {
    await arrive();
    expect(button().disabled).toBe(false);
    expect(root.querySelector('mat-spinner')).toBeNull();

    await submit('someone', 'secret');

    expect(button().disabled).toBe(true);
    expect(root.querySelector('mat-spinner')).not.toBeNull();
    expect(username().value).toBe('someone');
    expect(password().value).toBe('secret');
    expect(username().disabled || password().disabled).toBe(false);

    await answer({ code: 'invalid_credentials', message: 'Wrong.' }, 401);
    expect(button().disabled).toBe(false);
    expect(root.querySelector('mat-spinner')).toBeNull();
  });
});
