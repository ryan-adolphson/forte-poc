import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { appConfig, type AppConfig } from '../config/app.config.js';
import { readCookie, safeEqual, SESSION_COOKIE, signSession, verifySession } from './session-token.js';

/**
 * The one shared sign-in and its stateless session token. There is no user table and no
 * session store: a session is valid when its signature and expiry are.
 */
@Injectable()
export class AuthService {
  /** Without SESSION_SECRET the secret lives only in this process: a restart ends every session. */
  private readonly secret: string;

  constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {
    this.secret = config.sessionSecret ?? randomBytes(32).toString('base64url');
  }

  /** False until both AUTH_USERNAME and AUTH_PASSWORD are set. Then nobody can sign in. */
  get configured(): boolean {
    return this.config.authUsername !== undefined && this.config.authPassword !== undefined;
  }

  get sessionTtlSeconds(): number {
    return this.config.sessionTtlHours * 3600;
  }

  /** Both values are always compared, so a wrong username takes as long as a wrong password. */
  checkCredentials(username: string, password: string): boolean {
    const { authUsername, authPassword } = this.config;
    if (authUsername === undefined || authPassword === undefined) return false;
    const usernameOk = safeEqual(username, authUsername);
    const passwordOk = safeEqual(password, authPassword);
    return usernameOk && passwordOk;
  }

  /** A fresh session token for the shared account. The cookie value: never log it. */
  issueToken(): string {
    const { authUsername } = this.config;
    if (!this.configured || authUsername === undefined) throw new Error('Sign-in is not configured');
    return signSession(authUsername, Math.floor(Date.now() / 1000) + this.sessionTtlSeconds, this.secret);
  }

  /**
   * The signed-in username for a `Cookie` request header, or null. A token for any other
   * username than the configured one is refused, as is every token while sign-in is not
   * configured.
   */
  readSession(cookieHeader: string | undefined): string | null {
    const token = readCookie(cookieHeader, SESSION_COOKIE);
    if (token === undefined || !this.configured) return null;
    const username = verifySession(token, this.secret, Math.floor(Date.now() / 1000));
    return username !== null && username === this.config.authUsername ? username : null;
  }
}
