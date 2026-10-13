import { SseParser } from './sse-parser';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('SseParser', () => {
  it('parses a single event', () => {
    const parser = new SseParser();
    expect(parser.push(bytes('event: text\ndata: {"delta":"Hi"}\n\n'))).toEqual([
      { event: 'text', data: '{"delta":"Hi"}' },
    ]);
  });

  it('parses several events in one chunk', () => {
    const parser = new SseParser();
    const chunk =
      'event: start\ndata: {}\n\n' +
      'event: text\ndata: {"delta":"a"}\n\n' +
      'event: text\ndata: {"delta":"b"}\n\n';
    expect(parser.push(bytes(chunk))).toEqual([
      { event: 'start', data: '{}' },
      { event: 'text', data: '{"delta":"a"}' },
      { event: 'text', data: '{"delta":"b"}' },
    ]);
  });

  it('joins an event split inside the data line', () => {
    const parser = new SseParser();
    expect(parser.push(bytes('event: text\nda'))).toEqual([]);
    expect(parser.push(bytes('ta: {"del'))).toEqual([]);
    expect(parser.push(bytes('ta":"Hi"}\n\n'))).toEqual([
      { event: 'text', data: '{"delta":"Hi"}' },
    ]);
  });

  it('joins an event split between the two newlines', () => {
    const parser = new SseParser();
    expect(parser.push(bytes('event: text\ndata: {"delta":"Hi"}\n'))).toEqual([]);
    expect(parser.push(bytes('\nevent: done\n'))).toEqual([
      { event: 'text', data: '{"delta":"Hi"}' },
    ]);
  });

  it('handles every single-byte split of a stream', () => {
    const stream = bytes('event: start\ndata: {}\n\nevent: text\ndata: {"delta":"héllo ✓"}\n\n');
    const parser = new SseParser();
    const messages = [...stream].flatMap((byte) => parser.push(Uint8Array.of(byte)));
    expect(messages).toEqual([
      { event: 'start', data: '{}' },
      { event: 'text', data: '{"delta":"héllo ✓"}' },
    ]);
  });

  it('decodes a multi-byte character split across chunks', () => {
    const all = bytes('event: text\ndata: {"delta":"20 °C 🧱"}\n\n');
    const cut = all.indexOf(0xf0) + 2; // in the middle of the four-byte emoji
    const parser = new SseParser();
    expect(parser.push(all.slice(0, cut))).toEqual([]);
    expect(parser.push(all.slice(cut))).toEqual([{ event: 'text', data: '{"delta":"20 °C 🧱"}' }]);
  });

  it('ignores comment lines and unknown fields', () => {
    const parser = new SseParser();
    const chunk =
      ': keep-alive\n\nid: 7\nretry: 1000\nfoo: bar\nevent: text\ndata: {"delta":"x"}\n\n';
    expect(parser.push(bytes(chunk))).toEqual([{ event: 'text', data: '{"delta":"x"}' }]);
  });

  it('accepts CRLF line endings, also when split between CR and LF', () => {
    const parser = new SseParser();
    expect(parser.push(bytes('event: text\r\ndata: {"delta":"x"}\r'))).toEqual([]);
    expect(parser.push(bytes('\n\r\n'))).toEqual([{ event: 'text', data: '{"delta":"x"}' }]);
  });
});
