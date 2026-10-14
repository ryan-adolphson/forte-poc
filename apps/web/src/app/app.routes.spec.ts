import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SETTINGS } from '../testing/assistant-settings';
import { provideSignedIn } from '../testing/auth';
import { routes } from './app.routes';
import { signedIn } from './auth-guards';
import { SettingsPage } from './settings-page';
import { DocumentsPage } from './documents-page';
import { ForteAiPage } from './forte-ai-page';
import { ProductsPage } from './products-page';

describe('routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSignedIn(),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    // Answer the page's list request, so nothing is left open.
    for (const request of TestBed.inject(HttpTestingController).match(() => true)) {
      request.flush(
        request.request.url === '/api/settings/assistant'
          ? SETTINGS
          : { products: [], documents: [] },
      );
    }
  });

  const url = () => TestBed.inject(Router).url;
  const title = () => TestBed.inject(Title).getTitle();
  const heading = () => harness.routeNativeElement!.querySelector('h2')!.textContent.trim();

  it('redirects the root to the products page', async () => {
    await harness.navigateByUrl('/', ProductsPage);
    expect(url()).toBe('/products');
    expect(heading()).toBe('Products');
    expect(title()).toBe('Products – Forte');
  });

  it('shows the documents page', async () => {
    await harness.navigateByUrl('/documents', DocumentsPage);
    expect(url()).toBe('/documents');
    expect(heading()).toBe('Documents');
    expect(title()).toBe('Documents – Forte');
  });

  it('shows the Forte AI page', async () => {
    await harness.navigateByUrl('/forte-ai', ForteAiPage);
    expect(url()).toBe('/forte-ai');
    expect(heading()).toBe('Forte AI');
    expect(title()).toBe('Forte AI – Forte');
  });

  it('shows the settings page, for signed-in users only', async () => {
    await harness.navigateByUrl('/settings', SettingsPage);
    expect(url()).toBe('/settings');
    expect(heading()).toBe('Settings');
    expect(title()).toBe('Settings – Forte');
    const route = routes.find((r) => r.path === 'settings')!;
    expect(route.canActivate).toEqual([signedIn]);
  });

  it('redirects an unknown address to the products page', async () => {
    await harness.navigateByUrl('/no/such/page', ProductsPage);
    expect(url()).toBe('/products');
    expect(title()).toBe('Products – Forte');
  });
});
