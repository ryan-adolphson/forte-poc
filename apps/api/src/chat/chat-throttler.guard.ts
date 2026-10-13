import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ChatErrorBody } from '@forte/chat-contract';

/**
 * Per-IP rate limit for the chat route. The base guard sets `Retry-After` (seconds);
 * this only changes the 429 body to the contract's `ChatErrorBody`.
 */
@Injectable()
export class ChatThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): Promise<void> {
    const body: ChatErrorBody = {
      code: 'rate_limited',
      message: 'Too many messages. Please wait a moment and try again.',
    };
    throw new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
}
