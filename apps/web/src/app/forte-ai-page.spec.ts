import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FakeStream, done, fakeFetch, settle } from '../testing/fake-chat-stream';
import { PRODUCTS } from '../testing/products';
import { Chat } from './chat';
import { ForteAiPage } from './forte-ai-page';

describe('ForteAiPage', () => {
  let fixture: ComponentFixture<ForteAiPage>;
  let root: HTMLElement;
  let streams: FakeStream[];
  let chat: Chat;

  beforeEach(() => {
    streams = fakeFetch();
    TestBed.configureTestingModule({});
    chat = TestBed.inject(Chat);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(ForteAiPage);
    root = fixture.nativeElement;
    await fixture.whenStable();
  }

  const textarea = () => root.querySelector('textarea')!;
  const buttons = () => [...root.querySelectorAll('button')].map((b) => b.textContent.trim());
  const messages = () => [...root.querySelectorAll('.message .text')].map((m) => m.textContent);

  async function send(text: string): Promise<FakeStream> {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input'));
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await settle();
    await fixture.whenStable();
    return streams.at(-1)!;
  }

  it('is the chat as a page: its heading, general examples, no product card, no Close', async () => {
    await open();

    const heading = root.querySelector('h2')!;
    expect(heading.textContent).toBe('Forte AI');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(root.querySelector('app-chat-panel')!.classList).toContain('page');
    expect(root.querySelector('app-product-card')).toBeNull();
    expect(root.querySelectorAll('.examples button')).toHaveLength(4);
    expect(root.querySelector('.examples')!.textContent).toContain('What timber products');
    expect(buttons()).toContain('New chat');
    expect(buttons()).not.toContain('Close');
    // Entering the page does not move focus into the message box.
    expect(document.activeElement).not.toBe(textarea());
  });

  it('sends a general question and shows the streamed answer', async () => {
    await open();

    const stream = await send('What timber do you have?');
    expect(stream.body).toEqual({ message: 'What timber do you have?' });
    await stream.emit('text', { delta: 'We have C24.' });
    await stream.emit('done', done('int-1'));
    await stream.close();
    await fixture.whenStable();

    expect(messages()).toEqual(['What timber do you have?', 'We have C24.']);
    expect((await send('And glulam?')).body).toEqual({
      message: 'And glulam?',
      previousInteractionId: 'int-1',
    });
  });

  it('clears the product and its conversation when entered after a product chat', async () => {
    chat.selectProduct(PRODUCTS[0]);
    void chat.send('What is its strength?');
    await settle();
    expect(chat.messages()).toHaveLength(2);

    await open();

    expect(streams[0].signal.aborted).toBe(true); // the product chat's reply in progress
    expect(chat.product()).toBeNull();
    expect(chat.busy()).toBe(false);
    expect(root.querySelectorAll('.message')).toHaveLength(0);
    expect(root.querySelector('app-product-card')).toBeNull();
    expect((await send('hello')).body).toEqual({ message: 'hello' });
  });

  it('keeps the general conversation when the page is left and entered again', async () => {
    await open();
    const stream = await send('one');
    await stream.emit('text', { delta: 'first answer' });
    await stream.emit('done', done('int-1'));
    await stream.close();
    fixture.destroy();

    await open();

    expect(messages()).toEqual(['one', 'first answer']);
    expect(chat.interactionId()).toBe('int-1');
  });

  it('lets a reply finish in the service while the page is away', async () => {
    await open();
    const stream = await send('one');
    fixture.destroy();
    await stream.emit('text', { delta: 'written while away' });
    await stream.emit('done', done('int-1'));
    await stream.close();

    await open();

    expect(messages()).toEqual(['one', 'written while away']);
    expect(chat.busy()).toBe(false);
  });
});
