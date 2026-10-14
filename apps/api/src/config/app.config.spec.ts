import { validateEnv } from './app.config.js';

const DATABASE_URL = 'postgresql://forte:forte@127.0.0.1:5434/forte_search';

describe('validateEnv', () => {
  it('rejects a missing DATABASE_URL and names it', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required/);
    expect(() => validateEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('applies defaults', () => {
    expect(validateEnv({ DATABASE_URL, GEMINI_API_KEY: '', ANTHROPIC_API_KEY: ' ' })).toEqual({
      port: 3000,
      databaseUrl: DATABASE_URL,
      geminiApiKey: undefined,
      geminiModel: 'gemini-3.8-flash',
      anthropicApiKey: undefined,
      claudeModel: 'claude-sonnet-5-5',
      chatRateLimit: 10,
      chatRateTtlSeconds: 60,
      trustProxy: 0,
      authUsername: undefined,
      authPassword: undefined,
      sessionSecret: undefined,
      sessionTtlHours: 12,
      cookieSecure: false,
      loginRateLimit: 10,
    });
  });

  it('reads values and converts numbers', () => {
    const config = validateEnv({
      DATABASE_URL,
      PORT: '4000',
      GEMINI_API_KEY: 'key',
      ANTHROPIC_API_KEY: 'claude-key',
      CLAUDE_MODEL: 'claude-other',
      CHAT_RATE_LIMIT: '5',
    });
    expect(config).toMatchObject({
      port: 4000,
      geminiApiKey: 'key',
      anthropicApiKey: 'claude-key',
      claudeModel: 'claude-other',
      chatRateLimit: 5,
    });
  });

  it('rejects a non-integer number and names the variable', () => {
    expect(() => validateEnv({ DATABASE_URL, CHAT_RATE_LIMIT: 'ten' })).toThrow(
      /CHAT_RATE_LIMIT must be a positive integer/,
    );
  });

  it('reads TRUST_PROXY as a non-negative integer', () => {
    expect(validateEnv({ DATABASE_URL, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(validateEnv({ DATABASE_URL, TRUST_PROXY: '0' }).trustProxy).toBe(0);
    for (const bad of ['-1', '1.5', 'true']) {
      expect(() => validateEnv({ DATABASE_URL, TRUST_PROXY: bad })).toThrow(
        /TRUST_PROXY must be a non-negative integer/,
      );
    }
  });

  it('reads the sign-in settings, all optional, blank meaning not set', () => {
    expect(
      validateEnv({ DATABASE_URL, AUTH_USERNAME: ' ', AUTH_PASSWORD: '', SESSION_SECRET: '' }),
    ).toMatchObject({ authUsername: undefined, authPassword: undefined, sessionSecret: undefined });

    expect(
      validateEnv({
        DATABASE_URL,
        AUTH_USERNAME: 'someone',
        AUTH_PASSWORD: 'a password',
        SESSION_SECRET: 'secret',
        SESSION_TTL_HOURS: '1',
        LOGIN_RATE_LIMIT: '3',
      }),
    ).toMatchObject({
      authUsername: 'someone',
      authPassword: 'a password',
      sessionSecret: 'secret',
      sessionTtlHours: 1,
      loginRateLimit: 3,
    });
  });

  it('rejects a bad SESSION_TTL_HOURS and names it', () => {
    for (const bad of ['0', '-1', '1.5', 'forever']) {
      expect(() => validateEnv({ DATABASE_URL, SESSION_TTL_HOURS: bad })).toThrow(
        /SESSION_TTL_HOURS must be a positive integer/,
      );
    }
  });

  it('reads COOKIE_SECURE as true or false only', () => {
    expect(validateEnv({ DATABASE_URL, COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
    expect(validateEnv({ DATABASE_URL, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
    expect(validateEnv({ DATABASE_URL, COOKIE_SECURE: '' }).cookieSecure).toBe(false);
    for (const bad of ['1', 'yes', 'TRUE']) {
      expect(() => validateEnv({ DATABASE_URL, COOKIE_SECURE: bad })).toThrow(
        /COOKIE_SECURE must be true or false/,
      );
    }
  });
});
