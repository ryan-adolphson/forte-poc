export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Incremental parser for a `text/event-stream` body. Feed it the raw byte chunks in order; it
 * returns the events completed by each chunk and keeps any unfinished tail for the next one.
 */
export class SseParser {
  // A streaming decoder holds back the bytes of a character that is split across chunks.
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private event = '';
  private data: string[] = [];

  push(chunk: Uint8Array): SseMessage[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    // A trailing "\r" is not treated as a line end yet: the next chunk may start with "\n".
    const lines = this.buffer.split(/\r\n|\n|\r(?!$)/);
    this.buffer = lines.pop() ?? '';

    const messages: SseMessage[] = [];
    for (const line of lines) {
      if (line === '') {
        if (this.data.length > 0) {
          messages.push({ event: this.event || 'message', data: this.data.join('\n') });
        }
        this.event = '';
        this.data = [];
        continue;
      }
      if (line.startsWith(':')) {
        continue; // comment, for example ": keep-alive"
      }
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      if (field === 'event') {
        this.event = value;
      } else if (field === 'data') {
        this.data.push(value);
      }
      // Other fields (id, retry, unknown) are ignored.
    }
    return messages;
  }
}
