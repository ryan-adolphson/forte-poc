import {
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthErrorBody } from '@forte/chat-contract';
import { AuthService } from './auth.service.js';

const IS_PUBLIC = 'isPublic';

/** Marks a route, or a whole controller, as reachable without signing in. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export function unauthenticated(): UnauthorizedException {
  const body: AuthErrorBody = { code: 'unauthenticated', message: 'Sign in to continue.' };
  return new UnauthorizedException(body);
}

/**
 * Global guard: every route needs a valid session cookie unless it is marked `@Public()`.
 * A global guard runs before any route guard, so an unauthenticated request is refused
 * before it reaches a rate limiter or a handler.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (this.auth.readSession(request.headers.cookie) === null) throw unauthenticated();
    return true;
  }
}
