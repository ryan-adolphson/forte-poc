import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatSidenavHarness } from '@angular/material/sidenav/testing';
import { FakeStream, fakeFetch, settle } from '../testing/fake-chat-stream';
import { PRODUCTS } from '../testing/products';
import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let root: HTMLElement;
  let loader: HarnessLoader;
  let streams: FakeStream[];

  beforeEach(async () => {
    streams = fakeFetch(); // the chat stream; the products go through HttpTestingController
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MATERIAL_ANIMATIONS,
          useValue: { animationsDisabled: true },
        },
      ],
    });
    fixture = TestBed.createComponent(App);
    root = fixture.nativeElement;
    document.body.append(root); // focus only moves in an attached document
    loader = TestbedHarnessEnvironment.loader(fixture);
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne('/api/products').flush({ products: PRODUCTS });
    await fixture.whenStable();
  });

  afterEach(() => {
    root.remove();
    vi.unstubAllGlobals();
  });

  const panel = () => loader.getHarness(MatSidenavHarness);
  const headerButton = () => root.querySelector<HTMLButtonElement>('mat-toolbar button')!;
  const cardButton = (name: string) =>
    root.querySelector<HTMLButtonElement>(`[aria-label="Ask Forte about ${name}"]`)!;
  const closeButton = () =>
    [...root.querySelectorAll<HTMLElement>('app-chat-panel button')].find(
      (b) => b.textContent.trim() === 'Close',
    )!;
  const productCard = () => root.querySelector('app-product-card');
  const textarea = () => root.querySelector('textarea')!;
  const messages = () => root.querySelectorAll('.message');

  /** Focuses and clicks a button, as a user does, then waits for the panel to settle. */
  async function click(element: HTMLElement): Promise<void> {
    element.focus();
    element.click();
    await settle();
    await fixture.whenStable();
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
    await stream.emit('done', { interactionId, usage: null });
    await stream.close();
    await fixture.whenStable();
  }

  it('is a landing page with the catalogue and a closed chat panel', async () => {
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')!.textContent).toContain('Forte');
    expect(root.querySelector('main')!.textContent).toContain('ask Forte');
    expect(root.querySelectorAll('main mat-card')).toHaveLength(3);
    expect(headerButton().textContent).toContain('Ask Forte');

    expect(await (await panel()).isOpen()).toBe(false);
    expect(await (await panel()).getMode()).toBe('over');
    expect(await (await panel()).getPosition()).toBe('end');
    const host = root.querySelector('mat-sidenav')!;
    expect(host.getAttribute('role')).toBe('dialog');
    expect(host.getAttribute('aria-label')).toBe('Ask Forte');
  });

  it('opens the panel for a product with its card, and focuses the message box', async () => {
    await click(cardButton('Ready-Mix Concrete C32/40'));

    expect(await (await panel()).isOpen()).toBe(true);
    expect(productCard()!.textContent).toContain('Ready-Mix Concrete C32/40');
    expect(productCard()!.textContent).toContain('CON-C3240');
    expect(root.querySelector('.examples')!.textContent).toContain('What are its key properties?');
    expect(document.activeElement).toBe(textarea());

    const stream = await send('What is its strength?');
    expect(stream.body).toEqual({
      message: 'What is its strength?',
      productSku: 'CON-C3240',
    });
  });

  it('opens the panel from the header with no product card', async () => {
    await click(headerButton());

    expect(await (await panel()).isOpen()).toBe(true);
    expect(productCard()).toBeNull();
    expect(root.querySelector('.examples')!.textContent).toContain('What timber products');
    expect(document.activeElement).toBe(textarea());

    const stream = await send('What timber do you have?');
    expect(stream.body).toEqual({ message: 'What timber do you have?' });
  });

  it('closes on Escape and with Close, returning focus to the button that opened it', async () => {
    const opener = cardButton('Rebar B500B 12 mm');
    await click(opener);
    textarea().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        bubbles: true,
      }),
    );
    await settle();
    await fixture.whenStable();
    expect(await (await panel()).isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);

    await click(headerButton());
    await click(closeButton());
    expect(await (await panel()).isOpen()).toBe(false);
    expect(document.activeElement).toBe(headerButton());
  });

  it('keeps the conversation for the same product and starts a new one for another', async () => {
    await click(cardButton('Ready-Mix Concrete C32/40'));
    await finish(await send('one'), 'int-1');
    expect(messages()).toHaveLength(2);

    await click(closeButton());
    await click(cardButton('Ready-Mix Concrete C32/40'));
    expect(messages()).toHaveLength(2);
    const next = await send('two');
    expect(next.body).toEqual({
      message: 'two',
      previousInteractionId: 'int-1',
      productSku: 'CON-C3240',
    });
    await finish(next, 'int-2');

    await click(closeButton());
    await click(cardButton('Rebar B500B 12 mm'));
    expect(messages()).toHaveLength(0);
    expect(productCard()!.textContent).toContain('Rebar B500B 12 mm');
    expect((await send('three')).body).toEqual({
      message: 'three',
      productSku: 'RST-B500B-12',
    });

    // To the general chat: a reply in progress is aborted and the conversation is cleared.
    await click(closeButton());
    await click(headerButton());
    expect(streams.at(-1)!.signal.aborted).toBe(true);
    expect(messages()).toHaveLength(0);
    expect(productCard()).toBeNull();
  });
});
