import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Auth, safeReturnUrl } from './auth';

@Component({ template: '' })
class Blank {}

describe('Auth', () => {
  let auth: Auth;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'documents', component: Blank },
          { path: 'login', component: Blank },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const unauthenticated = { code: 'unauthenticated', message: 'Sign in first.' };

  async function signIn(): Promise<void> {
    const check = auth.checkSession();
    http.expectOne('/api/auth/session').flush({ username: 'someone' });
    await check;
  }

  describe('session check', () => {
    it('does not know who is signed in before the check', () => {
      expect(auth.session()).toBeUndefined();
    });

    it('is signed in when the API has a session, and asks only once', async () => {
      const first = auth.checkSession();
      const second = auth.checkSession();
      http.expectOne({ method: 'GET', url: '/api/auth/session' }).flush({ username: 'someone' });
      await Promise.all([first, second]);

      expect(auth.session()).toEqual({ username: 'someone' });
      await auth.checkSession(); // `verify` fails if this asks again
    });

    it('is signed out when the API answers 401', async () => {
      const check = auth.checkSession();
      http
        .expectOne('/api/auth/session')
        .flush(unauthenticated, { status: 401, statusText: 'Unauthorized' });
      await check;

      expect(auth.session()).toBeNull();
    });

    it('is signed out when the API cannot be reached', async () => {
      const check = auth.checkSession();
      http.expectOne('/api/auth/session').error(new ProgressEvent('error'));
      await check;

      expect(auth.session()).toBeNull();
    });
  });

  describe('login', () => {
    it('posts the credentials and is then signed in', async () => {
      const login = auth.login('someone', 'secret');
      const request = http.expectOne({ method: 'POST', url: '/api/auth/login' });
      expect(request.request.body).toEqual({ username: 'someone', password: 'secret' });
      request.flush({ username: 'someone' });

      expect(await login).toBeNull();
      expect(auth.session()).toEqual({ username: 'someone' });
    });

    async function failedLogin(
      status: number,
      body: object | string,
      headers: Record<string, string> = {},
    ): Promise<string | null> {
      const login = auth.login('someone', 'wrong');
      http.expectOne('/api/auth/login').flush(body, { status, statusText: 'Error', headers });
      const message = await login;
      expect(auth.session()).toBeFalsy();
      return message;
    }

    it('says the credentials are not right on 401', async () => {
      expect(
        await failedLogin(401, { code: 'invalid_credentials', message: 'Wrong.' }),
      ).toBe('The username or password is not right.');
    });

    it('says the credentials are not right when the API rejects a field', async () => {
      expect(
        await failedLogin(400, { message: ['username is too long'], statusCode: 400 }),
      ).toBe('The username or password is not right.');
    });

    it('says how long to wait when rate limited', async () => {
      const body = { code: 'rate_limited', message: 'Too many.' };
      expect(await failedLogin(429, body, { 'Retry-After': '42' })).toBe(
        'Too many attempts. Try again in 42 seconds.',
      );
      expect(await failedLogin(429, body, { 'Retry-After': '1' })).toBe(
        'Too many attempts. Try again in 1 second.',
      );
      expect(await failedLogin(429, body)).toBe('Too many attempts. Try again shortly.');
    });

    it('says sign-in is not set up on 503', async () => {
      expect(
        await failedLogin(503, { code: 'auth_not_configured', message: 'Not set up.' }),
      ).toBe('Sign-in is not set up on the server.');
    });

    it('says the server could not be reached for anything else', async () => {
      expect(await failedLogin(500, 'Internal Server Error')).toBe(
        'Could not reach the server. Try again.',
      );

      const login = auth.login('someone', 'secret');
      http.expectOne('/api/auth/login').error(new ProgressEvent('error'));
      expect(await login).toBe('Could not reach the server. Try again.');
    });
  });

  describe('logout', () => {
    it('tells the API and is then signed out', async () => {
      await signIn();

      const logout = auth.logout();
      http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      await logout;

      expect(auth.session()).toBeNull();
    });

    it('is signed out even when the API cannot be reached', async () => {
      await signIn();

      const logout = auth.logout();
      http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));
      await logout;

      expect(auth.session()).toBeNull();
    });
  });

  describe('session loss', () => {
    it('signs out and goes to the sign-in page, remembering the current page', async () => {
      const router = TestBed.inject(Router);
      await signIn();
      await router.navigateByUrl('/documents');

      auth.sessionLost();
      auth.sessionLost(); // a second failed request changes nothing
      expect(auth.session()).toBeNull();
      await vi.waitFor(() => expect(router.url).toBe('/login?returnUrl=%2Fdocuments'));
    });

    it('does nothing when nobody is signed in', async () => {
      const router = TestBed.inject(Router);
      auth.sessionLost();
      await new Promise((resolve) => setTimeout(resolve));

      expect(auth.session()).toBeUndefined();
      expect(router.url).toBe('/');
    });
  });
});

describe('safeReturnUrl', () => {
  it('keeps a path inside the app', () => {
    expect(safeReturnUrl('/documents')).toBe('/documents');
    expect(safeReturnUrl('/forte-ai?x=1')).toBe('/forte-ai?x=1');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'documents',
    '',
    null,
  ])('goes to the products for %j', (value) => {
    expect(safeReturnUrl(value)).toBe('/products');
  });
});
