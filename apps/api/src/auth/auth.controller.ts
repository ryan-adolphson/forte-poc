import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthErrorBody, SessionResponse } from '@forte/chat-contract';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { AuthService } from './auth.service.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';
import { LoginDto } from './login.dto.js';
import { Public, unauthenticated } from './session.guard.js';
import { SESSION_COOKIE } from './session-token.js';

/** Every route here is public: these are the routes that create, report and end a session. */
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  /** The cookie's attributes. `clearCookie` must be given the same ones to remove it. */
  private get cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', path: '/', secure: this.config.cookieSecure };
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(LoginThrottlerGuard)
  login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response): SessionResponse {
    if (!this.auth.configured) {
      const error: AuthErrorBody = {
        code: 'auth_not_configured',
        message: 'Sign-in is not set up on this server.',
      };
      throw new ServiceUnavailableException(error);
    }
    if (!this.auth.checkCredentials(body.username, body.password)) {
      // The same answer whichever of the two was wrong.
      const error: AuthErrorBody = {
        code: 'invalid_credentials',
        message: 'Wrong username or password.',
      };
      throw new UnauthorizedException(error);
    }
    res.cookie(SESSION_COOKIE, this.auth.issueToken(), {
      ...this.cookieOptions,
      // Express takes milliseconds and writes `Max-Age` in seconds.
      maxAge: this.auth.sessionTtlSeconds * 1000,
    });
    return { username: body.username };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions);
  }

  /** Who is signed in, or 401. The web app asks this on load. */
  @Get('session')
  session(@Req() req: Request): SessionResponse {
    const username = this.auth.readSession(req.headers.cookie);
    if (username === null) throw unauthenticated();
    return { username };
  }
}
