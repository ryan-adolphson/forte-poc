import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatProgressSpinnerHarness } from '@angular/material/progress-spinner/testing';
import type { ChatSource } from '@forte/chat-contract';
import {
  CATALOGUE_ENTRY,
  CATALOGUE_ENTRY_WITH_SHEET,
  DATA_SHEET_REFERENCE,
  DATA_SHEET,
  FakeStream,
  done,
  fakeFetch,
  settle,
} from '../testing/fake-chat-stream';
import { PRODUCTS } from '../testing/products';
import { Chat } from './chat';
import { ChatPanel } from './chat-panel';

describe('ChatPanel', () => {
  let fixture: ComponentFixture<ChatPanel>;
  let root: HTMLElement;
  let loader: HarnessLoader;
  let streams: FakeStream[];

  beforeEach(async () => {
    streams = fakeFetch();
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(ChatPanel);
    root = fixture.nativeElement;
    loader = TestbedHarnessEnvironment.loader(fixture);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const textarea = () => root.querySelector('textarea')!;
  /** The Material button with exactly this label, or null when it is not on the page. */
  const button = (label: string) => loader.getHarnessOrNull(MatButtonHarness.with({ text: label }));
  const disabled = async (label: string) => (await button(label))!.isDisabled();
  const spinners = () => loader.getAllHarnesses(MatProgressSpinnerHarness);
  const messages = () => [...root.querySelectorAll('.message')].map((m) => m.textContent.trim());
  const liveRegion = () => root.querySelector('[aria-live="polite"]')!.textContent.trim();

  async function type(text: string): Promise<void> {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function pressEnter(init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...init });
    textarea().dispatchEvent(event);
    await settle();
    await fixture.whenStable();
    return event;
  }

  /** Waits for the faked stream callbacks, then for Angular to render. */
  async function rendered(action: Promise<void>): Promise<void> {
    await action;
    await fixture.whenStable();
  }

  it('shows the empty state, the AI note and a labelled message box', async () => {
    expect(root.querySelector('h2')!.textContent).toContain('Ask Forte');
    expect(root.querySelector('app-product-card')).toBeNull();
    expect(root.querySelectorAll('.examples button')).toHaveLength(4);
    const field = await loader.getHarness(MatFormFieldHarness);
    expect(await field.getLabel()).toBe('Message');
    expect(root.querySelector('label[for="message"]')).not.toBeNull();
    const note = root.querySelector('#ai-note')!;
    expect(note.textContent).toContain('AI assistant');
    expect(textarea().getAttribute('aria-describedby')).toContain('ai-note');
    expect(await disabled('New chat')).toBe(true);
  });

  it('sends on Enter, clears the box and keeps focus in it', async () => {
    await type('What timber do you have?');
    const event = await pressEnter();

    expect(event.defaultPrevented).toBe(true);
    expect(streams[0].body).toEqual({ message: 'What timber do you have?' });
    expect(textarea().value).toBe('');
    expect(document.activeElement).toBe(textarea());
    expect(messages()[0]).toContain('What timber do you have?');
    expect(root.querySelector('.examples')).toBeNull();
  });

  it('does not send on Shift+Enter', async () => {
    await type('line one');
    const event = await pressEnter({ shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(streams).toHaveLength(0);
    expect(textarea().value).toBe('line one');
  });

  it('disables Send when the box is empty or a reply is in progress', async () => {
    expect(await disabled('Send')).toBe(true);
    await type('   ');
    expect(await disabled('Send')).toBe(true);
    await type('hello');
    expect(await disabled('Send')).toBe(false);
    expect(await button('Stop')).toBeNull();

    await (await button('Send'))!.click();
    await settle();
    await fixture.whenStable();
    expect(streams).toHaveLength(1);

    await type('next question');
    expect(await disabled('Send')).toBe(true);
    expect(await button('Stop')).not.toBeNull();
    await pressEnter();
    expect(streams).toHaveLength(1);
    expect(textarea().value).toBe('next question');

    await rendered(streams[0].emit('done', done('int-1')));
    await rendered(streams[0].close());
    expect(await disabled('Send')).toBe(false);
    expect(await button('Stop')).toBeNull();
  });

  it('shows the character count near the limit and blocks an over-long message', async () => {
    await type('a'.repeat(1700));
    expect(root.querySelector('.count')).toBeNull();
    await type('a'.repeat(1990));
    const field = await loader.getHarness(MatFormFieldHarness);
    expect(await field.getTextHints()).toEqual(['1990 / 2000']);
    expect(await disabled('Send')).toBe(false);
    await type('a'.repeat(2001));
    expect(await disabled('Send')).toBe(true);
  });

  it('sends an example question on click', async () => {
    await (await button('What timber products do you have?'))!.click();
    await settle();
    await fixture.whenStable();

    expect(streams[0].body).toEqual({ message: 'What timber products do you have?' });
    expect(messages()[0]).toContain('What timber products do you have?');
    expect(document.activeElement).toBe(textarea());
  });

  it('renders the reply as it grows, then announces it once', async () => {
    await type('q');
    await pressEnter();
    const stream = streams[0];
    expect(messages()[1]).toContain('Thinking…');
    expect(await spinners()).toHaveLength(1);

    await rendered(stream.emit('tool', { name: 'search_products', status: 'started' }));
    expect(messages()[1]).toContain('Searching the catalogue…');

    await rendered(stream.emit('text', { delta: 'C32/40 reaches ' }));
    expect(root.querySelectorAll('.message .text')[1].textContent).toBe('C32/40 reaches ');
    expect(messages()[1]).not.toContain('Searching');
    expect(await spinners()).toHaveLength(0);

    await rendered(stream.emit('text', { delta: '40 MPa.\n<b>not html</b>' }));
    const text = root.querySelectorAll('.message .text')[1];
    expect(text.textContent).toBe('C32/40 reaches 40 MPa.\n<b>not html</b>');
    expect(text.children).toHaveLength(0);
    expect(liveRegion()).toBe('');

    await rendered(stream.emit('done', done('int-1')));
    await rendered(stream.close());
    expect(liveRegion()).toBe('Assistant: C32/40 reaches 40 MPa.\n<b>not html</b>');
  });

  it('shows an error under the partial text and offers Try again', async () => {
    await type('q');
    await pressEnter();
    await rendered(streams[0].emit('text', { delta: 'Partial' }));
    await rendered(
      streams[0].emit('error', { code: 'model_error', message: 'The answer was cut off.' }),
    );
    await rendered(streams[0].close());

    expect(messages()[1]).toContain('Partial');
    expect(root.querySelector('.error')!.textContent).toContain('The answer was cut off.');
    expect(liveRegion()).toContain('The answer was cut off.');
    expect(await disabled('Send')).toBe(true); // empty box, but usable again:
    await type('again');
    expect(await disabled('Send')).toBe(false);

    await (await button('Try again'))!.click();
    await settle();
    await fixture.whenStable();
    expect(streams[1].body).toEqual({ message: 'q' });
    expect(root.querySelector('.error')).toBeNull();
  });

  it('Stop keeps the partial text and marks it stopped', async () => {
    await type('q');
    await pressEnter();
    await rendered(streams[0].emit('text', { delta: 'So far' }));

    await (await button('Stop'))!.click();
    await settle();
    await fixture.whenStable();

    expect(messages()[1]).toContain('So far');
    expect(messages()[1]).toContain('Stopped.');
    expect(document.activeElement).toBe(textarea());
  });

  it('New chat clears the conversation and focuses the message box', async () => {
    await type('q');
    await pressEnter();
    await rendered(streams[0].emit('done', done('int-1')));
    await rendered(streams[0].close());

    await (await button('New chat'))!.click();
    await fixture.whenStable();

    expect(messages()).toEqual([]);
    expect(root.querySelectorAll('.examples button')).toHaveLength(4);
    expect(document.activeElement).toBe(textarea());
  });

  it('follows new content only while the user is at the bottom', async () => {
    const scroller = root.querySelector<HTMLElement>('.messages')!;
    // jsdom does no layout, so give the scroller a content height by hand.
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });

    await type('q');
    await pressEnter();
    await rendered(streams[0].emit('text', { delta: 'one' }));
    expect(scroller.scrollTop).toBe(1000);

    scroller.scrollTop = 300; // the user scrolls up
    scroller.dispatchEvent(new Event('scroll'));
    await rendered(streams[0].emit('text', { delta: ' two' }));
    expect(scroller.scrollTop).toBe(300);

    scroller.scrollTop = 790; // back near the bottom
    scroller.dispatchEvent(new Event('scroll'));
    await rendered(streams[0].emit('text', { delta: ' three' }));
    expect(scroller.scrollTop).toBe(1000);
  });

  it('shows the selected product and questions about it, and sends its SKU', async () => {
    TestBed.inject(Chat).selectProduct(PRODUCTS[0]);
    await fixture.whenStable();

    const card = root.querySelector('app-product-card')!;
    expect(card.querySelector('h3')!.textContent).toContain('Ready-Mix Concrete C32/40');
    expect(card.textContent).toContain('CON-C3240');
    expect(card.textContent).toContain('Concrete');
    expect(card.textContent).toContain('Structural concrete for slabs, beams and columns.');
    const properties = [...card.querySelectorAll('dl > div')].map((p) =>
      p.textContent.replace(/\s+/g, ' ').trim(),
    );
    expect(properties).toEqual([
      'Compressive strength: 40 MPa',
      'Density: 2400 kg/m³',
      'Slump class: S3',
    ]);
    expect([...root.querySelectorAll('.examples button')].map((b) => b.textContent.trim())).toEqual(
      [
        'What are its key properties?',
        'Which standards does it meet?',
        'What is it used for?',
        'Which similar products do you have?',
      ],
    );

    await (await button('What are its key properties?'))!.click();
    await settle();
    await fixture.whenStable();
    expect(streams[0].body).toEqual({
      message: 'What are its key properties?',
      productSku: 'CON-C3240',
    });
    // The card stays while the conversation runs.
    expect(root.querySelector('app-product-card')).not.toBeNull();
  });

  it('asks to be closed with the Close button', async () => {
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await (await button('Close'))!.click();
    expect(closed).toBe(1);
  });

  describe('sources', () => {
    const blocks = () => root.querySelectorAll('app-chat-sources');
    const items = () =>
      [...root.querySelectorAll('app-chat-sources li')].map((li) =>
        li.textContent.replace(/\s+/g, ' ').trim(),
      );

    /** Asks a question and completes the answer with these sources. */
    async function answer(sources: ChatSource[], text = 'Cure for 7 days.'): Promise<void> {
      await type('q');
      await pressEnter();
      const stream = streams.at(-1)!;
      await rendered(stream.emit('text', { delta: text }));
      await rendered(stream.emit('done', done('int-1', sources)));
      await rendered(stream.close());
    }

    it('links a data sheet to its PDF in a new tab, showing number, revision and date', async () => {
      await answer([DATA_SHEET, CATALOGUE_ENTRY]);

      const block = root.querySelectorAll('.message')[1].querySelector('app-chat-sources')!;
      expect(block.querySelector('h4')!.textContent).toBe('Sources');
      expect(block.querySelector('ul')).not.toBeNull();
      const links = block.querySelectorAll('a');
      expect(links).toHaveLength(1);
      const link = links[0];
      expect(link.getAttribute('href')).toBe('/api/documents/DS-FRT-CON-C3240/file');
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener');
      expect(items()[0]).toBe(
        'Ready-Mix Concrete C32/40 data sheet · DS-FRT-CON-C3240 · Rev C · issued 19 Jan 2026PDF',
      );
      expect(link.getAttribute('aria-label')).toBe(
        'Ready-Mix Concrete C32/40 data sheet · DS-FRT-CON-C3240 · Rev C · issued 19 Jan 2026 (PDF, opens in a new tab)',
      );
      expect(link.querySelector('.badge')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('shows a catalogue source without a data sheet as text, not a link', async () => {
      await answer([CATALOGUE_ENTRY]);

      expect(items()).toEqual(['Product catalogue · Ready-Mix Concrete C32/40 · FRT-CON-C3240']);
      expect(root.querySelector('app-chat-sources a')).toBeNull();
      expect(root.querySelector('app-chat-sources button')).toBeNull();
    });

    it("shows a catalogue source's current data sheet with its revision, linked to the PDF", async () => {
      await answer([CATALOGUE_ENTRY_WITH_SHEET]);

      expect(items()).toEqual([
        // Two lines on screen: the entry is a block, the link follows it.
        'Product catalogue · Ready-Mix Concrete C32/40 · FRT-CON-C3240' +
          'Current data sheet · DS-FRT-CON-C3240 · Rev C · issued 19 Jan 2026PDF',
      ]);
      const links = root.querySelectorAll<HTMLAnchorElement>('app-chat-sources a');
      expect(links).toHaveLength(1);
      // The link is the data sheet only: the catalogue entry itself stays plain text.
      expect(links[0].textContent).toBe('Current data sheet · DS-FRT-CON-C3240 · Rev C · issued 19 Jan 2026PDF');
      expect(links[0].getAttribute('href')).toBe('/api/documents/DS-FRT-CON-C3240/file');
      expect(links[0].target).toBe('_blank');
      expect(links[0].rel).toBe('noopener');
      expect(links[0].getAttribute('aria-label')).toBe(
        'Ready-Mix Concrete C32/40 current data sheet · DS-FRT-CON-C3240 · Rev C · issued 19 Jan 2026 (PDF, opens in a new tab)',
      );
      expect(links[0].querySelector('.badge')!.getAttribute('aria-hidden')).toBe('true');
    });

    it.each(['https://evil.example/x', 'javascript:alert(1)', '//evil.example/api/documents/x/file', ''])(
      "shows a catalogue source's data sheet as text when its url is %j",
      async (url) => {
        await answer([{ ...CATALOGUE_ENTRY, dataSheet: { ...DATA_SHEET_REFERENCE, url } } as ChatSource]);

        expect(root.querySelector('app-chat-sources a')).toBeNull();
        expect(root.querySelector('app-chat-sources')!.innerHTML).not.toContain('evil');
        expect(items()).toEqual([
          'Product catalogue · Ready-Mix Concrete C32/40 · FRT-CON-C3240 ' +
            'Current data sheet · DS-FRT-CON-C3240 · Rev C · issued 19 Jan 2026',
        ]);
      },
    );

    it('shows no block for an answer without sources', async () => {
      await answer([]);
      expect(blocks()).toHaveLength(0);
      expect(liveRegion()).toBe('Assistant: Cure for 7 days.');
    });

    it('shows no block while the answer is being written, or when it fails', async () => {
      await type('q');
      await pressEnter();
      await rendered(streams[0].emit('tool', { name: 'get_data_sheet', status: 'started' }));
      expect(messages()[1]).toContain('Reading the data sheet…');
      await rendered(streams[0].emit('text', { delta: 'Cure for' }));
      expect(blocks()).toHaveLength(0);

      await rendered(streams[0].emit('error', { code: 'model_error', message: 'Cut off.' }));
      await rendered(streams[0].close());
      expect(blocks()).toHaveLength(0);
      expect(liveRegion()).not.toContain('source');
    });

    it.each([
      'https://evil.example/x',
      'javascript:alert(1)',
      '//evil.example/api/documents/x/file',
      '/api/documents/\\evil.example',
      '/api/other/DS-FRT-CON-C3240/file',
      'api/documents/DS-FRT-CON-C3240/file',
      '',
    ])('does not make a link of the url %j', async (url) => {
      await answer([{ ...DATA_SHEET, url } as ChatSource]);

      expect(root.querySelector('app-chat-sources a')).toBeNull();
      expect(root.querySelector('app-chat-sources')!.innerHTML).not.toContain('evil');
      expect(items()).toEqual([
        'Ready-Mix Concrete C32/40 data sheet · DS-FRT-CON-C3240 · Rev C · issued 19 Jan 2026',
      ]);
    });

    it('never makes a link from the answer text', async () => {
      await answer([], 'See https://evil.example/x or /api/documents/DS-1/file <a href="/x">x</a>');
      expect(root.querySelector('.messages a')).toBeNull();
    });

    it('shows an unreadable issue date as it came', async () => {
      await answer([{ ...DATA_SHEET, issueDate: 'January 2026' } as ChatSource]);
      expect(items()[0]).toContain('issued January 2026');
    });

    it('announces the number of sources after the answer, not the list', async () => {
      await answer([DATA_SHEET, CATALOGUE_ENTRY]);
      expect(liveRegion()).toBe('Assistant: Cure for 7 days. 2 sources.');
    });

    it('announces a single source in the singular', async () => {
      await answer([DATA_SHEET]);
      expect(liveRegion()).toBe('Assistant: Cure for 7 days. 1 source.');
    });

    it('keeps each answer\'s sources under that answer', async () => {
      await answer([DATA_SHEET]);
      await answer([]);
      const bubbles = root.querySelectorAll('.message');
      expect(bubbles[1].querySelector('app-chat-sources')).not.toBeNull();
      expect(bubbles[3].querySelector('app-chat-sources')).toBeNull();
    });
  });
});
