import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { minutes, ThrottlerGuard } from '@nestjs/throttler';
import type { ChatErrorBody } from '@forte/chat-contract';
import { appConfig, type AppConfig } from '../config/app.config.js';

type ThrottlerRequest = Parameters<ThrottlerGuard['handleRequest']>[0];

/**
 * Per-IP limit on sign-in attempts. It uses the throttler that ChatModule registers (that
 * module is global) with its own limit; the counter is kept per route, so sign-in attempts
 * and chat messages never share one. Same 429 body and `Retry-After` as the chat route.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  @Inject(appConfig.KEY) private readonly config!: AppConfig;

  protected override handleRequest(request: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest({ ...request, limit: this.config.loginRateLimit, ttl: minutes(1) });
  }

  protected override throwThrottlingException(): Promise<void> {
    const body: ChatErrorBody = {
      code: 'rate_limited',
      message: 'Too many sign-in attempts. Please wait a moment and try again.',
    };
    throw new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
}
