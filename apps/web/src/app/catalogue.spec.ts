import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import type { Product } from '@forte/chat-contract';
import { PRODUCTS } from '../testing/products';
import { Catalogue } from './catalogue';

describe('Catalogue', () => {
  let fixture: ComponentFixture<Catalogue>;
  let root: HTMLElement;
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
    fixture = TestBed.createComponent(Catalogue);
    root = fixture.nativeElement;
    // Not `whenStable`: the app is not stable until the products request is answered.
    TestBed.tick();
  });

  afterEach(() => {
    http.verify();
  });

  const text = (selector: string) =>
    [...root.querySelectorAll(selector)].map((e) => e.textContent.replace(/\s+/g, ' ').trim());

  it('shows a loading state, then the products grouped by category', async () => {
    expect(root.querySelector('[role="status"]')!.textContent).toContain('Loading products');
    expect(root.querySelector('mat-card')).toBeNull();

    http.expectOne({ method: 'GET', url: '/api/products' }).flush({ products: PRODUCTS });
    await fixture.whenStable();

    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(text('h2')).toEqual(['Concrete', 'Reinforcing steel']);
    const sections = root.querySelectorAll('section');
    expect(sections[0].querySelectorAll('mat-card')).toHaveLength(2);
    expect(sections[1].querySelectorAll('mat-card')).toHaveLength(1);
    expect(sections[0].getAttribute('aria-labelledby')).toBe(sections[0].querySelector('h2')!.id);

    const card = root.querySelector('mat-card')!;
    expect(card.querySelector('h3')!.textContent).toContain('Ready-Mix Concrete C32/40');
    expect(card.textContent).toContain('CON-C3240');
    expect(card.textContent).toContain('Structural concrete for slabs, beams and columns.');
    expect(
      [...card.querySelectorAll('dl > div')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Compressive strength: 40 MPa', 'Density: 2400 kg/m³', 'Slump class: S3']);
    expect(card.querySelector('app-product-icon svg')).not.toBeNull();
  });

  it('gives every card a View details and an Ask Forte button named after the product', async () => {
    http.expectOne('/api/products').flush({ products: PRODUCTS });
    await fixture.whenStable();

    const cards = [...root.querySelectorAll('mat-card')];
    expect(cards).toHaveLength(PRODUCTS.length);
    cards.forEach((card, i) => {
      const buttons = [...card.querySelectorAll('button')];
      expect(buttons.map((b) => b.textContent.trim())).toEqual(['View details', 'Ask Forte']);
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
        `View details of ${PRODUCTS[i].name}`,
        `Ask Forte about ${PRODUCTS[i].name}`,
      ]);
    });
  });

  describe('details dialog', () => {
    let overlay: HarnessLoader;
    let asked: Product[];

    const dialogs = () => overlay.getAllHarnesses(MatDialogHarness);
    const dialogButton = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('mat-dialog-container button')].find(
        (b) => b.textContent.trim() === label,
      )!;

    /** Loads the products and opens the details of the first one, which has five properties. */
    beforeEach(async () => {
      overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
      asked = [];
      fixture.componentInstance.ask.subscribe((product) => asked.push(product));
      http.expectOne('/api/products').flush({ products: PRODUCTS });
      await fixture.whenStable();

      root
        .querySelector<HTMLElement>('[aria-label="View details of Ready-Mix Concrete C32/40"]')!
        .click();
      // The dialog's code is imported on the click.
      await vi.waitFor(async () => expect(await dialogs()).toHaveLength(1));
    });

    it('shows the name, SKU, category, description and every property of the product', async () => {
      const [dialog] = await dialogs();
      expect(await dialog.getTitleText()).toBe('Ready-Mix Concrete C32/40');
      const host = await dialog.host();
      expect(await host.getAttribute('aria-labelledby')).toBeTruthy();
      const content = (await host.text()).replace(/\s+/g, ' ');
      expect(content).toContain('CON-C3240 · Concrete');
      expect(content).toContain('Structural concrete for slabs, beams and columns.');

      const container = document.querySelector('mat-dialog-container')!;
      expect(container.querySelector('app-product-icon svg')).not.toBeNull();
      const cells = (row: Element) =>
        [...row.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
      expect(cells(container.querySelector('thead tr')!)).toEqual([
        'Property',
        'Value',
        'Standard',
      ]);
      expect([...container.querySelectorAll('tbody tr')].map(cells)).toEqual([
        ['Compressive strength', '40 MPa', 'EN 206'],
        ['Density', '2400 kg/m³', '–'],
        ['Slump class', 'S3', '–'],
        ['Maximum aggregate size', '20 mm', '–'],
        ['Exposure class', 'XC4', '–'],
      ]);
    });

    it('closes and emits the product when Ask Forte is clicked in the dialog', async () => {
      dialogButton('Ask Forte').click();
      await fixture.whenStable();

      expect(await dialogs()).toHaveLength(0);
      expect(asked).toEqual([PRODUCTS[0]]);
    });

    it('closes without asking when Close is clicked', async () => {
      dialogButton('Close').click();
      await fixture.whenStable();

      expect(await dialogs()).toHaveLength(0);
      expect(asked).toEqual([]);
    });
  });

  it('emits the product when its Ask Forte button is clicked', async () => {
    const asked: Product[] = [];
    fixture.componentInstance.ask.subscribe((product) => asked.push(product));
    http.expectOne('/api/products').flush({ products: PRODUCTS });
    await fixture.whenStable();

    root.querySelector<HTMLElement>('[aria-label="Ask Forte about Rebar B500B 12 mm"]')!.click();
    expect(asked).toEqual([PRODUCTS[2]]);
  });

  it('shows an error with a Retry button that loads the products again', async () => {
    http.expectOne('/api/products').flush('', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    expect(root.querySelector('[role="alert"]')!.textContent).toContain('could not be loaded');
    expect(root.querySelector('mat-card')).toBeNull();

    root.querySelector<HTMLElement>('[role="alert"] button')!.click();
    TestBed.tick();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('[role="status"]')).not.toBeNull();

    http.expectOne('/api/products').flush({ products: PRODUCTS });
    await fixture.whenStable();
    expect(root.querySelectorAll('mat-card')).toHaveLength(3);
  });

  it('says so when there are no products', async () => {
    http.expectOne('/api/products').flush({ products: [] });
    await fixture.whenStable();

    expect(root.textContent).toContain('There are no products to show yet.');
    expect(root.querySelector('h2')).toBeNull();
  });

  it('gives an unknown category a readable heading', async () => {
    http.expectOne('/api/products').flush({
      products: [
        { ...PRODUCTS[0], category: 'roof-tiles' },
        { ...PRODUCTS[2], category: 'cement-mortar' },
      ],
    });
    await fixture.whenStable();

    expect(text('h2')).toEqual(['Roof tiles', 'Cement and mortar']);
  });
});
