import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideSignedIn } from '../testing/auth';
import { fakeFetch } from '../testing/fake-chat-stream';
import { routes } from './app.routes';
import { Auth } from './auth';
import { authInterceptor } from './auth-interceptor';
import { Chat } from './chat';

/** Losing the session while using the app, with the real routes, guards and interceptor. */
describe('session loss', () => {
  let http: HttpTestingController;
  let router: Router;
  let auth: Auth;

  const unauthenticated = { code: 'unauthenticated', message: 'Sign in first.' };
  const status401 = { status: 401, statusText: 'Unauthorized' };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideSignedIn(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    auth = TestBed.inject(Auth);
    await RouterTestingHarness.create();
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  it.each(['products', 'documents'])('signs out on a 401 from the %s request', async (page) => {
    await router.navigateByUrl(`/${page}`);
    TestBed.tick(); // the page asks for its list
    expect(auth.session()).toEqual({ username: 'someone' });

    http.expectOne(`/api/${page}`).flush(unauthenticated, status401);

    expect(auth.session()).toBeNull();
    await vi.waitFor(() => expect(router.url).toBe(`/login?returnUrl=%2F${page}`));
  });

  it('stays signed in on another error', async () => {
    await router.navigateByUrl('/documents');
    TestBed.tick();

    http.expectOne('/api/documents').flush('Oops', { status: 500, statusText: 'Server Error' });

    expect(auth.session()).toEqual({ username: 'someone' });
    expect(router.url).toBe('/documents');
  });

  it('signs out on a 401 from the chat request, and the chat is not left busy', async () => {
    const chat = TestBed.inject(Chat);
    await router.navigateByUrl('/forte-ai');
    fakeFetch(() => Response.json(unauthenticated, { status: 401 }));

    await chat.send('What timber do you have?');

    expect(chat.busy()).toBe(false);
    expect(chat.messages().at(-1)).toMatchObject({
      role: 'assistant',
      text: '',
      error: 'You were signed out. Sign in and try again.',
      retryable: true,
    });
    expect(auth.session()).toBeNull();
    await vi.waitFor(() => expect(router.url).toBe('/login?returnUrl=%2Fforte-ai'));
  });

  it('does not treat a wrong password as a lost session', async () => {
    await router.navigateByUrl('/documents');
    TestBed.tick();
    http.expectOne('/api/documents').flush({ documents: [] });

    const login = auth.login('someone', 'wrong');
    http
      .expectOne('/api/auth/login')
      .flush({ code: 'invalid_credentials', message: '' }, status401);
    await login;

    expect(auth.session()).toEqual({ username: 'someone' });
    expect(router.url).toBe('/documents');
  });
});
