import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { DocumentSummary } from '@forte/chat-contract';
import { DOCUMENTS } from '../testing/documents';
import { DocumentsPage } from './documents-page';

describe('DocumentsPage', () => {
  let fixture: ComponentFixture<DocumentsPage>;
  let root: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DocumentsPage);
    root = fixture.nativeElement;
    // Not `whenStable`: the app is not stable until the documents request is answered.
    TestBed.tick();
  });

  afterEach(() => {
    http.verify();
  });

  const clean = (element: Element) => element.textContent.replace(/\s+/g, ' ').trim();
  const rows = () => [...root.querySelectorAll('tbody tr:not(.group)')];
  const cells = (row: Element) => [...row.children].map(clean);
  const results = () => clean(root.querySelector('.results')!);

  async function load(documents = DOCUMENTS): Promise<void> {
    http.expectOne({ method: 'GET', url: '/api/documents' }).flush({ documents });
    await fixture.whenStable();
  }

  async function search(text: string): Promise<void> {
    const input = root.querySelector('input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('has a page heading that can take focus, and says these are current revisions', async () => {
    const heading = root.querySelector('h2')!;
    expect(heading.textContent).toBe('Documents');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(root.querySelector('.intro')!.textContent).toContain('current revision');
    await load();
  });

  it('shows a loading state, then the documents in a table grouped by category', async () => {
    expect(root.querySelector('[role="status"]')!.textContent).toContain('Loading documents');
    expect(root.querySelector('table')).toBeNull();

    await load();

    expect(root.querySelector('[role="status"]')).toBeNull();
    expect([...root.querySelectorAll('thead th')].map(clean)).toEqual([
      'Product',
      'Document number',
      'Revision',
      'Issued',
      'PDF',
    ]);
    expect([...root.querySelectorAll('.group th')].map(clean)).toEqual(['Concrete', 'Insulation']);
    expect(rows()).toHaveLength(3);
    expect(cells(rows()[0])).toEqual([
      'Ready-Mix Concrete C32/40 FRT-CON-C3240',
      'DS-FRT-CON-C3240',
      'Revision C, 3 versions Rev C 3 versions',
      '19 Jan 2026',
      'Open PDF',
    ]);
    expect(rows()[0].querySelector('th[scope="row"] app-product-icon svg')).not.toBeNull();
    expect(results()).toBe('Showing 3 of 3 documents');
    expect(root.querySelector('.results')!.getAttribute('aria-live')).toBe('polite');
  });

  it('links each document to its PDF in a new tab, with a name that says so', async () => {
    await load();

    const link = rows()[0].querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/api/documents/DS-FRT-CON-C3240/file');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
    expect(link.getAttribute('aria-label')).toBe(
      'Open PDF of data sheet DS-FRT-CON-C3240, Rev C (opens in a new tab)',
    );
  });

  it('does not link an address that is not one of the API’s own files', async () => {
    await load();

    expect(cells(rows()[2]).slice(0, 4)).toEqual([
      'Mineral Wool Slab 100 mm FRT-INS-MW100',
      'DS-FRT-INS-MW100',
      'Revision B, 1 version Rev B 1 version',
      '3 Nov 2025',
    ]);
    expect(rows()[2].querySelector('a')).toBeNull();
    expect(root.querySelectorAll('a')).toHaveLength(2);
  });

  describe('the Revision cell', () => {
    /** What is shown, and what a screen reader is given in its place. */
    const revision = (row: Element) => ({
      shown: clean(row.querySelector('.revision [aria-hidden="true"]')!),
      read: clean(row.querySelector('.revision .visually-hidden')!),
    });

    it('shows how many versions a document has, next to its current revision', async () => {
      await load();

      expect(revision(rows()[0])).toEqual({
        shown: 'Rev C 3 versions',
        read: 'Revision C, 3 versions',
      });
      expect(clean(rows()[0].querySelector('.versions')!)).toBe('3 versions');
    });

    it('says “1 version” for a document that has only its current revision', async () => {
      await load();

      expect(revision(rows()[1])).toEqual({
        shown: 'Rev A 1 version',
        read: 'Revision A, 1 version',
      });
    });

    it('shows only the revision when the API does not send a usable count', async () => {
      const { revisionCount: _, ...old } = DOCUMENTS[0];
      const counts: unknown[] = [0, 2.5, '3', null];
      await load([
        old as DocumentSummary,
        ...counts.map(
          (revisionCount, i) =>
            ({ ...DOCUMENTS[1], documentNumber: `DS-${i}`, revisionCount }) as DocumentSummary,
        ),
      ]);

      expect(rows()).toHaveLength(5);
      expect(revision(rows()[0])).toEqual({ shown: 'Rev C', read: 'Revision C' });
      for (const row of rows()) {
        expect(row.querySelector('.versions')).toBeNull();
        expect(row.textContent).not.toMatch(/version|undefined|null|NaN/);
      }
    });
  });

  it('narrows the rows as the user types, and updates the count', async () => {
    await load();

    await search('PIR');
    expect(rows().map((row) => cells(row)[1])).toEqual(['DS-FRT-INS-PIR100']);
    expect([...root.querySelectorAll('.group th')].map(clean)).toEqual(['Insulation']);
    expect(results()).toBe('Showing 1 of 3 documents');

    await search('insulation 100');
    expect(rows()).toHaveLength(2);
    expect(results()).toBe('Showing 2 of 3 documents');
  });

  it('says when nothing matches, and Clear search brings every document back', async () => {
    await load();
    await search('  roof tiles ');

    expect(root.querySelector('table')).toBeNull();
    expect(clean(root.querySelector('.state')!)).toContain('No documents match “roof tiles”.');
    expect(results()).toBe('Showing 0 of 3 documents');

    const clear = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Clear search',
    )!;
    clear.click();
    await fixture.whenStable();
    expect(rows()).toHaveLength(3);
    expect(root.querySelector('input')!.value).toBe('');
  });

  it('says when there are no documents at all', async () => {
    await load([]);

    expect(clean(root.querySelector('.state')!)).toBe('There are no documents to show yet.');
    expect(root.querySelector('input')).toBeNull();
  });

  it('shows an error with a Retry button that loads the documents again', async () => {
    http.expectOne('/api/documents').flush('down', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    const alert = root.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('The documents could not be loaded.');
    alert.querySelector('button')!.click();
    TestBed.tick();

    await load();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(rows()).toHaveLength(3);
  });
});
