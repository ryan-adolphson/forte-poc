import { validateEnv } from './app.config.js';

const DATABASE_URL = 'postgresql://forte:forte@127.0.0.1:5434/forte_search';

describe('validateEnv', () => {
  it('rejects a missing DATABASE_URL and names it', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required/);
    expect(() => validateEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('applies defaults', () => {
    expect(validateEnv({ DATABASE_URL, GEMINI_API_KEY: '' })).toEqual({
      port: 3000,
      databaseUrl: DATABASE_URL,
      geminiApiKey: undefined,
      geminiModel: 'gemini-3.8-flash',
      chatRateLimit: 10,
      chatRateTtlSeconds: 60,
    });
  });

  it('reads values and converts numbers', () => {
    const config = validateEnv({
      DATABASE_URL,
      PORT: '4000',
      GEMINI_API_KEY: 'key',
      CHAT_RATE_LIMIT: '5',
    });
    expect(config).toMatchObject({
      port: 4000,
      geminiApiKey: 'key',
      chatRateLimit: 5,
    });
  });

  it('rejects a non-integer number and names the variable', () => {
    expect(() => validateEnv({ DATABASE_URL, CHAT_RATE_LIMIT: 'ten' })).toThrow(
      /CHAT_RATE_LIMIT must be a positive integer/,
    );
  });
});
