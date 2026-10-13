import { validateEnv } from '../config/app.config.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE } from './session-token.js';

const DATABASE_URL = 'postgresql://forte:forte@127.0.0.1:5434/forte_search';
const service = (env: Record<string, string> = {}) =>
  new AuthService(validateEnv({ DATABASE_URL, AUTH_USERNAME: 'someone', AUTH_PASSWORD: 'correct horse', ...env }));
const cookie = (auth: AuthService) => `${SESSION_COOKIE}=${auth.issueToken()}`;

describe('AuthService', () => {
  describe('checkCredentials', () => {
    const auth = service();

    it('accepts the configured username and password', () => {
      expect(auth.checkCredentials('someone', 'correct horse')).toBe(true);
    });

    it.each([
      ['a wrong username', 'someone-else', 'correct horse'],
      ['a wrong password', 'someone', 'correct hors3'],
      ['both wrong', 'x', 'y'],
      ['a shorter password', 'someone', 'correct'],
      ['a longer password', 'someone', 'correct horse battery staple'],
      ['an empty password', 'someone', ''],
      ['the two swapped', 'correct horse', 'someone'],
      ['another case', 'Someone', 'correct horse'],
    ])('refuses %s', (_case, username, password) => {
      expect(auth.checkCredentials(username, password)).toBe(false);
    });
  });

  describe('sessions', () => {
    it('reads back a session it issued', () => {
      const auth = service();
      expect(auth.readSession(`other=1; ${cookie(auth)}`)).toBe('someone');
      expect(auth.readSession(undefined)).toBeNull();
      expect(auth.readSession(`${SESSION_COOKIE}=nonsense`)).toBeNull();
    });

    it('keeps sessions across instances only when SESSION_SECRET is set', () => {
      const shared = { SESSION_SECRET: 'the same secret' };
      expect(service(shared).readSession(cookie(service(shared)))).toBe('someone');
      // No secret: each process makes its own, so a restart ends every session.
      expect(service().readSession(cookie(service()))).toBeNull();
    });

    it('refuses a session issued for another username', () => {
      const shared = { SESSION_SECRET: 'the same secret' };
      const before = service(shared);
      const after = service({ ...shared, AUTH_USERNAME: 'renamed' });
      expect(after.readSession(cookie(before))).toBeNull();
    });

    it('lasts SESSION_TTL_HOURS', () => {
      vi.useFakeTimers();
      try {
        const auth = service({ SESSION_TTL_HOURS: '2' });
        const header = cookie(auth);
        vi.advanceTimersByTime(2 * 3600 * 1000 - 1000);
        expect(auth.readSession(header)).toBe('someone');
        vi.advanceTimersByTime(1000);
        expect(auth.readSession(header)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe.each([
    ['no username', { AUTH_USERNAME: '' }],
    ['no password', { AUTH_PASSWORD: '' }],
  ])('not configured: %s', (_case, env) => {
    const shared = { SESSION_SECRET: 'the same secret' };
    const auth = service({ ...shared, ...env });

    it('lets nobody in and accepts no session', () => {
      expect(auth.configured).toBe(false);
      expect(auth.checkCredentials('someone', 'correct horse')).toBe(false);
      expect(auth.checkCredentials('', '')).toBe(false);
      expect(() => auth.issueToken()).toThrow(/not configured/);
      // Even a session signed with the same secret while sign-in was still configured.
      expect(auth.readSession(cookie(service(shared)))).toBeNull();
    });
  });
});
