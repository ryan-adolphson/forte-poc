import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChipListboxHarness } from '@angular/material/chips/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatInputHarness } from '@angular/material/input/testing';
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

  describe('filters', () => {
    let loader: HarnessLoader;

    const search = () => loader.getHarness(MatInputHarness);
    const chips = () => loader.getHarness(MatChipListboxHarness);
    const selectedChips = async () =>
      Promise.all((await (await chips()).getChips({ selected: true })).map((c) => c.getText()));
    const selectCategory = async (label: string) =>
      (await (await chips()).getChips({ text: new RegExp('^' + label) }))[0].select();
    const cards = () => text('mat-card h3');
    const results = () => text('.results')[0];
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLElement>('button')].find(
        (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === label,
      );

    beforeEach(async () => {
      document.body.append(root); // focus only moves in an attached document
      loader = TestbedHarnessEnvironment.loader(fixture);
      http.expectOne('/api/products').flush({ products: PRODUCTS });
      await fixture.whenStable();
    });

    afterEach(() => root.remove());

    it('shows a labelled search field and one category option per category, with counts', async () => {
      const bar = root.querySelector('[role="search"]')!;
      expect(bar.getAttribute('aria-label')).toBe('Products');
      expect(bar.querySelector('mat-label')!.textContent).toBe('Search products');
      expect(await (await search()).getType()).toBe('search');

      const listbox = await chips();
      expect(await (await listbox.host()).getAttribute('aria-label')).toBe('Category');
      expect(await listbox.isMultiple()).toBe(false);
      expect(await Promise.all((await listbox.getChips()).map((c) => c.getText()))).toEqual([
        'All 3',
        'Concrete 2',
        'Reinforcing steel 1',
      ]);
      expect(await selectedChips()).toEqual(['All 3']);
      expect(results()).toBe('Showing 3 of 3 products');
      expect(root.querySelector('.results')!.getAttribute('aria-live')).toBe('polite');
      expect(button('Clear search')).toBeUndefined();
    });

    it('hides the filters while loading, on an error and when there are no products', async () => {
      const reload = async (flush: (request: ReturnType<typeof http.expectOne>) => void) => {
        fixture.componentInstance['products'].reload();
        TestBed.tick();
        expect(root.querySelector('[role="search"]')).toBeNull();
        flush(http.expectOne('/api/products'));
        await fixture.whenStable();
      };

      await reload((r) => r.flush('', { status: 500, statusText: 'Server Error' }));
      expect(root.querySelector('[role="search"]')).toBeNull();
      await reload((r) => r.flush({ products: [] }));
      expect(root.querySelector('[role="search"]')).toBeNull();
      expect(root.querySelector('.results')).toBeNull();
    });

    it('narrows the cards as the user types and hides the categories without a match', async () => {
      await (await search()).setValue('  REBAR ');

      expect(cards()).toEqual(['Rebar B500B 12 mm']);
      expect(text('h2')).toEqual(['Reinforcing steel']);
      expect(results()).toBe('Showing 1 of 3 products');

      await (await search()).setValue('en 206');
      expect(cards()).toEqual(['Ready-Mix Concrete C32/40']);
      expect(text('h2')).toEqual(['Concrete']);
    });

    it('shows only the selected category, and everything again with All', async () => {
      await selectCategory('Reinforcing steel');

      expect(await selectedChips()).toEqual(['Reinforcing steel 1']);
      expect(text('h2')).toEqual(['Reinforcing steel']);
      expect(cards()).toEqual(['Rebar B500B 12 mm']);
      expect(results()).toBe('Showing 1 of 3 products');

      await selectCategory('All');
      expect(cards()).toHaveLength(3);
      expect(results()).toBe('Showing 3 of 3 products');
    });

    it('goes back to All when the selected category is clicked again, and keeps All selected', async () => {
      await selectCategory('Concrete');
      const [concrete] = await (await chips()).getChips({ selected: true });
      await concrete.deselect();

      expect(await selectedChips()).toEqual(['All 3']);
      expect(cards()).toHaveLength(3);

      const [all] = await (await chips()).getChips({ selected: true });
      await all.deselect();
      expect(await selectedChips()).toEqual(['All 3']);
      expect(cards()).toHaveLength(3);
    });

    it('combines the search with the category', async () => {
      await (await search()).setValue('strength');
      expect(cards()).toHaveLength(3);

      await selectCategory('Concrete');
      expect(cards()).toEqual(['Ready-Mix Concrete C32/40', 'Ready-Mix Concrete C20/25']);
      expect(results()).toBe('Showing 2 of 3 products');

      await (await search()).setValue('strength foundations');
      expect(cards()).toEqual(['Ready-Mix Concrete C20/25']);
    });

    it('empties the search with the clear button and with Escape', async () => {
      const input = await search();
      await input.setValue('rebar');
      button('Clear search')!.click();
      await fixture.whenStable();

      expect(await input.getValue()).toBe('');
      expect(await input.isFocused()).toBe(true);
      expect(cards()).toHaveLength(3);
      expect(button('Clear search')).toBeUndefined();

      await input.setValue('rebar');
      root
        .querySelector('input')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();
      expect(await input.getValue()).toBe('');
      expect(cards()).toHaveLength(3);
    });

    it('says when nothing matches, and Clear filters restores every card', async () => {
      await selectCategory('Concrete');
      await (await search()).setValue(' rebar ');

      expect(root.querySelector('mat-card')).toBeNull();
      expect(root.querySelector('h2')).toBeNull();
      expect(results()).toBe('Showing 0 of 3 products');
      expect(text('.state p')).toEqual(['No products match “rebar” in Concrete.']);
      expect(root.textContent).not.toContain('There are no products to show yet.');

      button('Clear filters')!.click();
      await fixture.whenStable();

      expect(cards()).toHaveLength(3);
      expect(await (await search()).getValue()).toBe('');
      expect(await (await search()).isFocused()).toBe(true);
      expect(await selectedChips()).toEqual(['All 3']);
      expect(button('Clear filters')).toBeUndefined();
    });

    it('keeps Ask Forte and View details working on a filtered card', async () => {
      const asked: Product[] = [];
      fixture.componentInstance.ask.subscribe((product) => asked.push(product));
      await (await search()).setValue('rebar');

      button('Ask Forte about Rebar B500B 12 mm')!.click();
      expect(asked).toEqual([PRODUCTS[2]]);

      button('View details of Rebar B500B 12 mm')!.click();
      const overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
      const dialog = await vi.waitFor(() => overlay.getHarness(MatDialogHarness));
      expect(await dialog.getTitleText()).toBe('Rebar B500B 12 mm');
      await dialog.close();
    });
  });
});
