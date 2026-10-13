import { inputBinding } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductIcon } from './product-icon';

describe('ProductIcon', () => {
  /** The markup of the icon drawn for a category. */
  async function draw(category: string): Promise<SVGElement> {
    const fixture = TestBed.createComponent(ProductIcon, {
      bindings: [inputBinding('category', () => category)],
    });
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('svg');
  }

  const CATEGORIES = [
    'concrete',
    'reinforcing-steel',
    'structural-steel',
    'timber',
    'masonry',
    'insulation',
    'cement-mortar',
  ];

  it('draws a different icon for each category, hidden from assistive technology', async () => {
    const drawings = new Set<string>();
    for (const category of CATEGORIES) {
      const svg = await draw(category);
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      expect(svg.querySelector('path, circle')).not.toBeNull();
      drawings.add(svg.innerHTML);
    }
    expect(drawings.size).toBe(CATEGORIES.length);
  });

  it('draws the fallback box for an unknown category', async () => {
    const fallback = await draw('roof-tiles');
    expect(fallback.getAttribute('aria-hidden')).toBe('true');
    expect(fallback.querySelector('path')).not.toBeNull();
    expect(fallback.innerHTML).toBe((await draw('something-else')).innerHTML);
    for (const category of CATEGORIES) {
      expect((await draw(category)).innerHTML).not.toBe(fallback.innerHTML);
    }
  });
});
