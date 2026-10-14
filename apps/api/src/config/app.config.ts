import { registerAs, type ConfigType } from '@nestjs/config';

type Env = Record<string, string | undefined>;

function optional(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === '' ? undefined : value;
}

function integer(env: Env, name: string, fallback: number, min = 1): number {
  const value = optional(env, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    // The value is deliberately left out of the message: never echo env values.
    const kind = min === 0 ? 'a non-negative' : 'a positive';
    throw new Error(`Invalid environment: ${name} must be ${kind} integer`);
  }
  return parsed;
}

function boolean(env: Env, name: string, fallback: boolean): boolean {
  const value = optional(env, name);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid environment: ${name} must be true or false`);
}

/** Reads and validates the environment. Throws an error naming the bad variable. */
export function validateEnv(env: Env) {
  const databaseUrl = optional(env, 'DATABASE_URL');
  if (databaseUrl === undefined) {
    throw new Error('Invalid environment: DATABASE_URL is required');
  }

  return {
    port: integer(env, 'PORT', 3000),
    databaseUrl,
    /** Undefined when no key is set. Never log this. */
    geminiApiKey: optional(env, 'GEMINI_API_KEY'),
    geminiModel: optional(env, 'GEMINI_MODEL') ?? 'gemini-3.8-flash',
    /** Undefined when no key is set: Claude is then not offered. Never log this. */
    anthropicApiKey: optional(env, 'ANTHROPIC_API_KEY'),
    claudeModel: optional(env, 'CLAUDE_MODEL') ?? 'claude-sonnet-5-5',
    chatRateLimit: integer(env, 'CHAT_RATE_LIMIT', 10),
    chatRateTtlSeconds: integer(env, 'CHAT_RATE_TTL_SECONDS', 60),
    /** Reverse proxies in front of the API whose `X-Forwarded-For` is trusted. 0 = none. */
    trustProxy: integer(env, 'TRUST_PROXY', 0, 0),
    /**
     * The one shared sign-in. Both optional, so the seed, ingest and migrate jobs start
     * without them; when either is missing nobody can sign in. Never log the password.
     */
    authUsername: optional(env, 'AUTH_USERNAME'),
    authPassword: optional(env, 'AUTH_PASSWORD'),
    /** Signs the session cookie. Undefined = a random one per process. Never log this. */
    sessionSecret: optional(env, 'SESSION_SECRET'),
    sessionTtlHours: integer(env, 'SESSION_TTL_HOURS', 12),
    /** `Secure` on the session cookie. Off by default: dev and the Docker stack are plain HTTP. */
    cookieSecure: boolean(env, 'COOKIE_SECURE', false),
    /** Sign-in attempts allowed per client IP per minute. */
    loginRateLimit: integer(env, 'LOGIN_RATE_LIMIT', 10),
  };
}

/**
 * The one typed config for the app. Inject it with
 * `@Inject(appConfig.KEY) private readonly config: AppConfig`.
 */
export const appConfig = registerAs('app', () => validateEnv(process.env));

export type AppConfig = ConfigType<typeof appConfig>;
