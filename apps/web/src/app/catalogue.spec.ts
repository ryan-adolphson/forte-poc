import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Product } from '@forte/chat-contract';
import { PRODUCTS } from '../testing/products';
import { Catalogue } from './catalogue';

describe('Catalogue', () => {
  let fixture: ComponentFixture<Catalogue>;
  let root: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
    expect(card.querySelector('button')!.getAttribute('aria-label')).toBe(
      'Ask Forte about Ready-Mix Concrete C32/40',
    );
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
