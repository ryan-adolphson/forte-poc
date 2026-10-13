import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { settle } from '../testing/fake-chat-stream';
import { routes } from './app.routes';

describe('route guards', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await RouterTestingHarness.create();
  });

  afterEach(() => {
    // Answer the page's list request, so nothing is left open.
    for (const request of http.match(() => true)) {
      request.flush({ products: [], documents: [] });
    }
  });

  /** Goes to an address and answers the session check that the guard makes. */
  async function visit(url: string, username: string | null): Promise<void> {
    const navigation = router.navigateByUrl(url);
    await settle();
    expect(router.url).toBe('/'); // nothing is shown before the check is answered

    const check = http.expectOne('/api/auth/session');
    if (username) {
      check.flush({ username });
    } else {
      check.flush({ code: 'unauthenticated', message: '' }, { status: 401, statusText: '' });
    }
    await navigation;
  }

  it('waits for the session check, then lets a signed-in user in', async () => {
    await visit('/documents', 'someone');
    expect(router.url).toBe('/documents');
  });

  it('sends a signed-out user to sign in, remembering the page', async () => {
    await visit('/documents', null);
    expect(router.url).toBe('/login?returnUrl=%2Fdocuments');
  });

  it('remembers the products page for the root address', async () => {
    await visit('/', null);
    expect(router.url).toBe('/login?returnUrl=%2Fproducts');
  });

  it('guards every page of the app', async () => {
    await visit('/forte-ai', null);
    expect(router.url).toBe('/login?returnUrl=%2Fforte-ai');

    await router.navigateByUrl('/products');
    expect(router.url).toBe('/login?returnUrl=%2Fproducts');
    http.expectNone('/api/auth/session'); // the first answer is reused
  });

  it('shows the sign-in page to a signed-out user', async () => {
    await visit('/login', null);
    expect(router.url).toBe('/login');
  });

  it('sends a signed-in user from the sign-in page to the products', async () => {
    await visit('/login?returnUrl=%2Fdocuments', 'someone');
    expect(router.url).toBe('/products');
  });
});
