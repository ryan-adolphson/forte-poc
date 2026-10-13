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
    chatRateLimit: integer(env, 'CHAT_RATE_LIMIT', 10),
    chatRateTtlSeconds: integer(env, 'CHAT_RATE_TTL_SECONDS', 60),
    /** Reverse proxies in front of the API whose `X-Forwarded-For` is trusted. 0 = none. */
    trustProxy: integer(env, 'TRUST_PROXY', 0, 0),
  };
}

/**
 * The one typed config for the app. Inject it with
 * `@Inject(appConfig.KEY) private readonly config: AppConfig`.
 */
export const appConfig = registerAs('app', () => validateEnv(process.env));

export type AppConfig = ConfigType<typeof appConfig>;
