import { Body, Controller, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ChatRequestDto } from './chat-request.dto.js';
import { ChatThrottlerGuard } from './chat-throttler.guard.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  /**
   * Streams one assistant turn as server-sent events (see `@forte/chat-contract`).
   * The guard (429) and the validation pipe (400) both answer before the stream opens.
   */
  @Post('stream')
  @UseGuards(ChatThrottlerGuard)
  async stream(@Body() body: ChatRequestDto, @Res() res: Response): Promise<void> {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells nginx not to buffer the stream.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // 'close' before we finish means the client went away: stop the upstream request.
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    for await (const { event, data } of this.chat.run(body, abort.signal)) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    res.end();
  }
}
