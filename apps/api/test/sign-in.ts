import type { INestApplication } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { SESSION_COOKIE } from '../src/auth/session-token.js';

/**
 * A `Cookie` header for a signed-in session: `.set('Cookie', signIn(app))`. The token
 * is minted by the app's own AuthService, so no test spends the login route's rate limit.
 */
export function signIn(app: INestApplication): string {
  const auth = app.get(AuthService);
  if (!auth.configured) {
    throw new Error('Set AUTH_USERNAME and AUTH_PASSWORD in apps/api/.env: the e2e tests sign in with them.');
  }
  return `${SESSION_COOKIE}=${auth.issueToken()}`;
}
