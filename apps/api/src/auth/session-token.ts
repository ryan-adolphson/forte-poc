import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'forte_session';

/** What the cookie carries: who signed in and when the session ends (epoch seconds). */
interface SessionPayload {
  u: string;
  exp: number;
}

const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest();

/**
 * Compares two strings without leaking where, or at what length, they differ: both are
 * hashed first, so `timingSafeEqual` always gets two buffers of the same length.
 */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** `base64url(JSON payload)` + `.` + `base64url(HMAC-SHA256(payload part))`. */
export function signSession(username: string, expiresAt: number, secret: string): string {
  const payload: SessionPayload = { u: username, exp: expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${mac(encoded, secret).toString('base64url')}`;
}

/**
 * The username in a token, or null when the token is not ours, was changed or has expired.
 * The signature is checked first, so nothing unsigned is ever parsed.
 */
export function verifySession(token: string, secret: string, now: number): string | null {
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length > 0) return null;

  const given = Buffer.from(signature, 'base64url');
  const expected = mac(encoded, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Partial<SessionPayload>;
    if (typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null;
    return payload.exp > now ? payload.u : null;
  } catch {
    return null;
  }
}

/** The value of one cookie in a `Cookie` request header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}
