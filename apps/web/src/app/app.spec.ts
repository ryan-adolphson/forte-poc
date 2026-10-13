import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FakeStream, fakeFetch, settle } from '../testing/fake-chat-stream';
import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let root: HTMLElement;
  let streams: FakeStream[];

  beforeEach(async () => {
    streams = fakeFetch();
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(App);
    root = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const textarea = () => root.querySelector('textarea')!;
  const button = (label: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
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

  it('shows the empty state, the AI note and a labelled message box', () => {
    expect(root.querySelector('h1')!.textContent).toContain('Forte Search');
    expect(root.querySelectorAll('.examples button')).toHaveLength(4);
    expect(root.textContent).toContain('AI assistant');
    expect(root.querySelector('label[for="message"]')!.textContent).toContain('Message');
    expect(button('New chat')!.disabled).toBe(true);
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
    expect(button('Send')!.disabled).toBe(true);
    await type('   ');
    expect(button('Send')!.disabled).toBe(true);
    await type('hello');
    expect(button('Send')!.disabled).toBe(false);
    expect(button('Stop')).toBeUndefined();

    button('Send')!.click();
    await settle();
    await fixture.whenStable();
    expect(streams).toHaveLength(1);

    await type('next question');
    expect(button('Send')!.disabled).toBe(true);
    expect(button('Stop')).toBeDefined();
    await pressEnter();
    expect(streams).toHaveLength(1);
    expect(textarea().value).toBe('next question');

    await rendered(streams[0].emit('done', { interactionId: 'int-1', usage: null }));
    await rendered(streams[0].close());
    expect(button('Send')!.disabled).toBe(false);
    expect(button('Stop')).toBeUndefined();
  });

  it('shows the character count near the limit and blocks an over-long message', async () => {
    await type('a'.repeat(1700));
    expect(root.querySelector('.count')).toBeNull();
    await type('a'.repeat(1990));
    expect(root.querySelector('.count')!.textContent).toContain('1990 / 2000');
    expect(button('Send')!.disabled).toBe(false);
    await type('a'.repeat(2001));
    expect(button('Send')!.disabled).toBe(true);
  });

  it('sends an example question on click', async () => {
    button('What timber products do you have?')!.click();
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

    await rendered(stream.emit('tool', { name: 'search_products', status: 'started' }));
    expect(messages()[1]).toContain('Searching the catalogue…');

    await rendered(stream.emit('text', { delta: 'C32/40 reaches ' }));
    expect(root.querySelectorAll('.message .text')[1].textContent).toBe('C32/40 reaches ');
    expect(messages()[1]).not.toContain('Searching');

    await rendered(stream.emit('text', { delta: '40 MPa.\n<b>not html</b>' }));
    const text = root.querySelectorAll('.message .text')[1];
    expect(text.textContent).toBe('C32/40 reaches 40 MPa.\n<b>not html</b>');
    expect(text.children).toHaveLength(0);
    expect(liveRegion()).toBe('');

    await rendered(stream.emit('done', { interactionId: 'int-1', usage: null }));
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
    expect(button('Send')!.disabled).toBe(true); // empty box, but usable again:
    await type('again');
    expect(button('Send')!.disabled).toBe(false);

    button('Try again')!.click();
    await settle();
    await fixture.whenStable();
    expect(streams[1].body).toEqual({ message: 'q' });
    expect(root.querySelector('.error')).toBeNull();
  });

  it('Stop keeps the partial text and marks it stopped', async () => {
    await type('q');
    await pressEnter();
    await rendered(streams[0].emit('text', { delta: 'So far' }));

    button('Stop')!.click();
    await settle();
    await fixture.whenStable();

    expect(messages()[1]).toContain('So far');
    expect(messages()[1]).toContain('Stopped.');
    expect(document.activeElement).toBe(textarea());
  });

  it('New chat clears the conversation and focuses the message box', async () => {
    await type('q');
    await pressEnter();
    await rendered(streams[0].emit('done', { interactionId: 'int-1', usage: null }));
    await rendered(streams[0].close());

    button('New chat')!.click();
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
});
