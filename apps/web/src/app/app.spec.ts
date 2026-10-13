import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatSidenavHarness } from '@angular/material/sidenav/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { provideSignedIn } from '../testing/auth';
import { DOCUMENTS } from '../testing/documents';
import { FakeStream, done, fakeFetch, settle } from '../testing/fake-chat-stream';
import { PRODUCTS } from '../testing/products';
import { App } from './app';
import { Chat } from './chat';
import { routes } from './app.routes';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let root: HTMLElement;
  let loader: HarnessLoader;
  let streams: FakeStream[];
  let http: HttpTestingController;
  /** The faked "narrower than 960px" media query. */
  let narrow: BehaviorSubject<BreakpointState>;

  beforeEach(() => {
    streams = fakeFetch(); // the chat stream; the lists go through HttpTestingController
    narrow = new BehaviorSubject<BreakpointState>({ matches: false, breakpoints: {} });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSignedIn(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: BreakpointObserver, useValue: { observe: () => narrow } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(App);
    root = fixture.nativeElement;
    document.body.append(root); // focus only moves in an attached document
    loader = TestbedHarnessEnvironment.loader(fixture);
  });

  afterEach(() => {
    root.remove();
    vi.unstubAllGlobals();
  });

  /** Goes to an address as the browser's address bar does, and answers the page's list request. */
  async function visit(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await answerLists();
  }

  async function answerLists(): Promise<void> {
    TestBed.tick();
    for (const request of http.match(() => true)) {
      request.flush({ products: PRODUCTS, documents: DOCUMENTS });
    }
    await settle(); // the focus move after a navigation
    await fixture.whenStable();
  }

  const path = () => TestBed.inject(Router).url;
  const panel = () => loader.getHarness(MatSidenavHarness.with({ selector: '.panel' }));
  const nav = () => loader.getHarness(MatSidenavHarness.with({ selector: '.nav' }));
  const navLinks = () => [...root.querySelectorAll<HTMLAnchorElement>('nav a')];
  const navLink = (label: string) => navLinks().find((a) => a.textContent.trim() === label)!;
  const menuButton = () =>
    root.querySelector<HTMLButtonElement>('mat-toolbar [aria-label="Open navigation"]');
  const pageHeading = () => root.querySelector<HTMLElement>('main h2')!;
  const cardButton = (name: string) =>
    root.querySelector<HTMLButtonElement>(`[aria-label="Ask Forte about ${name}"]`)!;
  const closeButton = () =>
    [...root.querySelectorAll<HTMLElement>('app-chat-panel button')].find(
      (b) => b.textContent.trim() === 'Close',
    )!;
  const productCard = () => root.querySelector('app-product-card');
  const textarea = () => root.querySelector('textarea')!;
  const messages = () => root.querySelectorAll('.message');

  /** Focuses and clicks, as a user does, then waits for a panel or a navigation to settle. */
  async function click(element: HTMLElement): Promise<void> {
    element.focus();
    element.click();
    await settle();
    await fixture.whenStable();
  }

  /** Clicks a card's Ask Forte button and waits until the panel has taken focus. */
  async function ask(name: string): Promise<void> {
    await click(cardButton(name));
    await vi.waitFor(() => expect(document.activeElement).toBe(textarea()));
    await fixture.whenStable();
  }

  /** Follows a link of the navigation. Not `click`: a page is not stable until its list loads. */
  async function follow(label: string): Promise<void> {
    navLink(label).focus();
    navLink(label).click();
    await vi.waitFor(() => expect(navLink(label).getAttribute('aria-current')).toBe('page'));
    await answerLists();
  }

  async function send(text: string): Promise<FakeStream> {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input'));
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await settle();
    await fixture.whenStable();
    return streams.at(-1)!;
  }

  async function finish(stream: FakeStream, interactionId: string): Promise<void> {
    await stream.emit('done', done(interactionId));
    await stream.close();
    await fixture.whenStable();
  }

  /**
   * Waits until the opened navigation has taken focus. In a browser that is its first link; jsdom
   * has no layout, so Material finds nothing tabbable there and focuses the navigation itself.
   */
  const inNav = () =>
    vi.waitFor(() =>
      expect(root.querySelector('.nav')!.contains(document.activeElement)).toBe(true),
    );

  async function pressEscape(): Promise<void> {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
    await settle();
    await fixture.whenStable();
  }

  describe('shell', () => {
    it('has the Forte mark as the only h1, the landmarks, and no Ask Forte button', async () => {
      await visit('/');

      expect(root.querySelectorAll('h1')).toHaveLength(1);
      expect(root.querySelector('header mat-toolbar h1 img')!.getAttribute('alt')).toBe('Forte');
      expect(root.querySelector('mat-toolbar')!.textContent).not.toContain('Ask Forte');
      expect(root.querySelectorAll('header, nav, main')).toHaveLength(3);
      expect(root.querySelector('nav')!.getAttribute('aria-label')).toBe('Main');
      expect(root.querySelector('.skip')!.textContent).toBe('Skip to content');
    });

    it('lands on the products page, with the catalogue and no chat panel', async () => {
      await visit('/');

      expect(path()).toBe('/products');
      expect(TestBed.inject(Title).getTitle()).toBe('Products – Forte');
      expect(pageHeading().textContent).toBe('Products');
      expect(root.querySelector('main')!.textContent).toContain('ask Forte');
      expect(root.querySelectorAll('main mat-card')).toHaveLength(3);

      expect(await (await panel()).isOpen()).toBe(false);
      expect(await (await panel()).getMode()).toBe('over');
      expect(await (await panel()).getPosition()).toBe('end');
      const host = root.querySelector('.panel')!;
      expect(host.getAttribute('role')).toBe('dialog');
      expect(host.getAttribute('aria-label')).toBe('Ask Forte');
      expect(root.querySelector('app-chat-panel')).toBeNull();
    });

    it('moves focus to the page heading with the skip link', async () => {
      await visit('/');

      root.querySelector<HTMLElement>('.skip')!.click();
      expect(document.activeElement).toBe(pageHeading());
      expect(path()).toBe('/products');
    });
  });

  describe('signing in and out', () => {
    const signOutButton = () =>
      [...root.querySelectorAll<HTMLButtonElement>('mat-toolbar button')].find(
        (b) => b.textContent.trim() === 'Sign out',
      )!;

    it('shows who is signed in and a Sign out button in the toolbar', async () => {
      await visit('/');

      expect(root.querySelector('mat-toolbar .user')!.textContent).toBe('someone');
      expect(signOutButton()).toBeTruthy();
    });

    it('shows nothing before the first page is known', () => {
      fixture.detectChanges();

      expect(root.querySelector('mat-toolbar, nav, .panel, .skip, h1')).toBeNull();
      expect(root.querySelector('main')!.textContent.trim()).toBe('');
    });

    it('signs out: tells the API, forgets the chat and shows the sign-in page alone', async () => {
      const chat = TestBed.inject(Chat);
      await visit('/products');
      await ask('Ready-Mix Concrete C32/40');
      await finish(await send('What is its strength?'), 'i-1');
      expect(chat.product()).not.toBeNull();
      expect(chat.messages()).toHaveLength(2);

      signOutButton().click();
      await settle();
      http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      await vi.waitFor(() => expect(path()).toBe('/login'));
      await fixture.whenStable();

      expect(chat.product()).toBeNull();
      expect(chat.messages()).toEqual([]);
      expect(chat.interactionId()).toBeNull();
      // No toolbar, navigation, chat panel or skip link: only the sign-in page.
      expect(root.querySelector('mat-toolbar, nav, .panel, .skip, app-chat-panel')).toBeNull();
      expect([...root.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Sign in']);
      expect(root.querySelector('main app-login-page')).not.toBeNull();
    });

    it('does not show a page of the app again after signing out', async () => {
      await visit('/documents');

      signOutButton().click();
      await settle();
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await vi.waitFor(() => expect(path()).toBe('/login'));

      await TestBed.inject(Router).navigateByUrl('/documents');
      await fixture.whenStable();

      expect(path()).toBe('/login?returnUrl=%2Fdocuments');
      expect(root.querySelector('mat-toolbar')).toBeNull();
      http.expectNone('/api/documents');
    });
  });

  describe('navigation', () => {
    it('has three links in order, with an icon each', async () => {
      await visit('/');

      expect(navLinks().map((a) => a.textContent.trim())).toEqual([
        'Products',
        'Documents',
        'Forte AI',
      ]);
      expect(navLinks().map((a) => a.getAttribute('href'))).toEqual([
        '/products',
        '/documents',
        '/forte-ai',
      ]);
      for (const link of navLinks()) {
        expect(link.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('marks the link of the current page', async () => {
      await visit('/documents');
      const current = () => navLinks().map((a) => a.getAttribute('aria-current'));

      expect(current()).toEqual([null, 'page', null]);
      expect(navLink('Documents').classList).toContain('mdc-list-item--activated');
      expect(navLink('Products').classList).not.toContain('mdc-list-item--activated');

      await follow('Forte AI');
      expect(current()).toEqual([null, null, 'page']);
    });

    it('goes to each page, sets its title and moves focus to its heading', async () => {
      await visit('/');
      const title = () => TestBed.inject(Title).getTitle();

      await follow('Documents');
      expect(path()).toBe('/documents');
      expect(title()).toBe('Documents – Forte');
      expect(pageHeading().textContent).toBe('Documents');
      expect(root.querySelectorAll('main tbody tr:not(.group)')).toHaveLength(DOCUMENTS.length);
      expect(document.activeElement).toBe(pageHeading());

      await follow('Forte AI');
      expect(path()).toBe('/forte-ai');
      expect(title()).toBe('Forte AI – Forte');
      expect(pageHeading().textContent).toBe('Forte AI');
      expect(document.activeElement).toBe(pageHeading());

      await follow('Products');
      expect(path()).toBe('/products');
      expect(title()).toBe('Products – Forte');
      expect(root.querySelectorAll('main mat-card')).toHaveLength(3);
      expect(document.activeElement).toBe(pageHeading());
    });

    it('is beside the page on a wide screen, with no menu button', async () => {
      await visit('/');

      expect(await (await nav()).getMode()).toBe('side');
      expect(await (await nav()).isOpen()).toBe(true);
      expect(menuButton()).toBeNull();

      // Escape does not close a navigation that has no button to open it again.
      navLink('Products').focus();
      await pressEscape();
      expect(await (await nav()).isOpen()).toBe(true);
    });

    it('opens over the page from the menu button on a narrow screen', async () => {
      narrow.next({ matches: true, breakpoints: {} });
      await visit('/');

      expect(await (await nav()).getMode()).toBe('over');
      expect(await (await nav()).isOpen()).toBe(false);
      expect(menuButton()!.getAttribute('aria-expanded')).toBe('false');

      await click(menuButton()!);
      expect(await (await nav()).isOpen()).toBe(true);
      expect(menuButton()!.getAttribute('aria-expanded')).toBe('true');
      await inNav();

      // Escape closes it and returns focus to the menu button.
      await pressEscape();
      expect(await (await nav()).isOpen()).toBe(false);
      expect(document.activeElement).toBe(menuButton());
    });

    it('closes after a destination is chosen on a narrow screen', async () => {
      narrow.next({ matches: true, breakpoints: {} });
      await visit('/');
      await click(menuButton()!);
      await inNav();

      await follow('Documents');
      expect(path()).toBe('/documents');
      expect(await (await nav()).isOpen()).toBe(false);
      expect(document.activeElement).toBe(pageHeading());

      // The link of the page that is already shown closes it too, back to the menu button.
      await click(menuButton()!);
      await inNav();
      await click(navLink('Documents'));
      expect(await (await nav()).isOpen()).toBe(false);
      expect(document.activeElement).toBe(menuButton());
    });

    it('closes when the screen becomes wide, and starts closed when narrow again', async () => {
      narrow.next({ matches: true, breakpoints: {} });
      await visit('/');
      await click(menuButton()!);

      narrow.next({ matches: false, breakpoints: {} });
      await fixture.whenStable();
      expect(await (await nav()).getMode()).toBe('side');
      expect(await (await nav()).isOpen()).toBe(true);

      narrow.next({ matches: true, breakpoints: {} });
      await settle();
      await fixture.whenStable();
      expect(await (await nav()).isOpen()).toBe(false);
    });
  });

  describe('product chat panel', () => {
    beforeEach(() => visit('/products'));

    it('opens for a product with its card, and focuses the message box', async () => {
      await ask('Ready-Mix Concrete C32/40');

      expect(await (await panel()).isOpen()).toBe(true);
      expect(productCard()!.textContent).toContain('Ready-Mix Concrete C32/40');
      expect(productCard()!.textContent).toContain('CON-C3240');
      expect(root.querySelector('.examples')!.textContent).toContain(
        'What are its key properties?',
      );
      expect(root.querySelector('app-chat-panel h2')!.textContent).toBe('Ask Forte');

      const stream = await send('What is its strength?');
      expect(stream.body).toEqual({
        message: 'What is its strength?',
        productSku: 'CON-C3240',
      });
    });

    it('opens for a product from its details dialog, and focuses the message box', async () => {
      const opener = root.querySelector<HTMLButtonElement>(
        '[aria-label="View details of Rebar B500B 12 mm"]',
      )!;
      opener.focus();
      opener.click();
      const dialog = () => document.querySelector<HTMLElement>('mat-dialog-container');
      await vi.waitFor(() => expect(dialog()).not.toBeNull()); // its code is imported on the click
      await fixture.whenStable();
      expect(dialog()!.contains(document.activeElement)).toBe(true);

      const askButton = [...dialog()!.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Ask Forte',
      )!;
      await click(askButton);

      // The dialog closes first and returns focus to its opener; then the panel opens.
      await vi.waitFor(() => expect(document.activeElement).toBe(textarea()));
      expect(dialog()).toBeNull();
      expect(await (await panel()).isOpen()).toBe(true);
      expect(productCard()!.textContent).toContain('Rebar B500B 12 mm');
      expect(productCard()!.querySelector('app-product-icon svg')).not.toBeNull();

      // Closing the panel returns focus to the button that opened the dialog.
      await click(closeButton());
      expect(document.activeElement).toBe(opener);
    });

    it('closes the details dialog on Escape, returning focus to its View details button', async () => {
      const opener = root.querySelector<HTMLButtonElement>(
        '[aria-label="View details of Rebar B500B 12 mm"]',
      )!;
      opener.focus();
      opener.click();
      const dialog = () => document.querySelector<HTMLElement>('mat-dialog-container');
      await vi.waitFor(() => expect(dialog()).not.toBeNull());
      await fixture.whenStable();

      await pressEscape();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(await (await panel()).isOpen()).toBe(false);
    });

    it('closes on Escape and with Close, returning focus to the button that opened it', async () => {
      const opener = cardButton('Rebar B500B 12 mm');
      await ask('Rebar B500B 12 mm');
      await pressEscape();
      expect(await (await panel()).isOpen()).toBe(false);
      expect(document.activeElement).toBe(opener);
      // The chat is rendered only while the panel is open.
      await vi.waitFor(() => expect(root.querySelector('app-chat-panel')).toBeNull());

      await ask('Rebar B500B 12 mm');
      await click(closeButton());
      expect(await (await panel()).isOpen()).toBe(false);
      expect(document.activeElement).toBe(opener);
    });

    it('keeps the conversation for the same product and starts a new one for another', async () => {
      await ask('Ready-Mix Concrete C32/40');
      await finish(await send('one'), 'int-1');
      expect(messages()).toHaveLength(2);

      await click(closeButton());
      await ask('Ready-Mix Concrete C32/40');
      expect(messages()).toHaveLength(2);
      const next = await send('two');
      expect(next.body).toEqual({
        message: 'two',
        previousInteractionId: 'int-1',
        productSku: 'CON-C3240',
      });
      await finish(next, 'int-2');

      await click(closeButton());
      await ask('Rebar B500B 12 mm');
      expect(messages()).toHaveLength(0);
      expect(productCard()!.textContent).toContain('Rebar B500B 12 mm');
      expect((await send('three')).body).toEqual({
        message: 'three',
        productSku: 'RST-B500B-12',
      });
    });
  });

  describe('Forte AI page', () => {
    it('shows the general chat in the page, and the panel is not open', async () => {
      await visit('/forte-ai');

      expect(root.querySelectorAll('app-chat-panel')).toHaveLength(1);
      expect(root.querySelector('main app-chat-panel')).not.toBeNull();
      expect(await (await panel()).isOpen()).toBe(false);
      expect(productCard()).toBeNull();
      expect(root.querySelector('.examples')!.textContent).toContain('What timber products');

      const stream = await send('What timber do you have?');
      expect(stream.body).toEqual({ message: 'What timber do you have?' });
      await stream.emit('text', { delta: 'We have C24.' });
      await finish(stream, 'int-1');
      expect(messages()).toHaveLength(2);
      expect(root.querySelectorAll('app-chat-panel > [aria-live="polite"]')).toHaveLength(1);
    });

    it('closes an open product chat and starts a clean general chat', async () => {
      await visit('/products');
      await ask('Rebar B500B 12 mm');
      const productStream = await send('What is its yield strength?');
      expect(messages()).toHaveLength(2);

      // The panel is modal, so the way out with it open is the browser's back or forward button.
      await visit('/forte-ai');

      expect(productStream.signal.aborted).toBe(true);
      expect(await (await panel()).isOpen()).toBe(false);
      expect(root.querySelectorAll('app-chat-panel')).toHaveLength(1);
      expect(root.querySelectorAll('#message')).toHaveLength(1);
      expect(root.querySelector('main app-chat-panel')).not.toBeNull();
      expect(messages()).toHaveLength(0);
      expect(productCard()).toBeNull();
      expect((await send('hello')).body).toEqual({ message: 'hello' });
    });

    it('keeps the general conversation across a visit to another page', async () => {
      await visit('/forte-ai');
      await finish(await send('one'), 'int-1');

      await follow('Documents');
      await follow('Forte AI');

      expect(messages()).toHaveLength(2);
      expect((await send('two')).body).toEqual({ message: 'two', previousInteractionId: 'int-1' });
    });
  });
});
