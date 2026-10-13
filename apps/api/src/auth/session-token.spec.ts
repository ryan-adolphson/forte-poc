import { readCookie, safeEqual, signSession, verifySession } from './session-token.js';

const SECRET = 'test-secret';
const NOW = 1_800_000_000;

describe('session token', () => {
  const token = signSession('someone', NOW + 60, SECRET);
  const [payload, signature] = token.split('.') as [string, string];

  it('verifies a token it signed and returns the username', () => {
    expect(verifySession(token, SECRET, NOW)).toBe('someone');
  });

  it('refuses a changed payload, even one that is otherwise valid', () => {
    const forged = Buffer.from(JSON.stringify({ u: 'admin', exp: NOW + 60 })).toString('base64url');
    expect(verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    const longer = Buffer.from(JSON.stringify({ u: 'someone', exp: NOW + 999_999 })).toString('base64url');
    expect(verifySession(`${longer}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('refuses a changed signature', () => {
    const flipped = (signature.startsWith('A') ? 'B' : 'A') + signature.slice(1);
    expect(verifySession(`${payload}.${flipped}`, SECRET, NOW)).toBeNull();
    expect(verifySession(`${payload}.${signature.slice(0, -4)}`, SECRET, NOW)).toBeNull();
    expect(verifySession(`${payload}.`, SECRET, NOW)).toBeNull();
  });

  it('refuses an expired token, from the second it expires', () => {
    expect(verifySession(token, SECRET, NOW + 59)).toBe('someone');
    expect(verifySession(token, SECRET, NOW + 60)).toBeNull();
    expect(verifySession(signSession('someone', NOW - 1, SECRET), SECRET, NOW)).toBeNull();
  });

  it.each(['', '.', 'garbage', 'a.b', 'a.b.c', `${token}.extra`, '%%%.%%%', 'null.null'])(
    'refuses garbage %j',
    (garbage) => {
      expect(verifySession(garbage, SECRET, NOW)).toBeNull();
    },
  );

  it('refuses a correctly signed payload of the wrong shape', () => {
    // Signed with the real secret, so only the shape check stands between it and a session.
    const wrongTypes = signSession(1 as unknown as string, 'never' as unknown as number, SECRET);
    expect(verifySession(wrongTypes, SECRET, NOW)).toBeNull();
    const noExpiry = signSession('someone', undefined as unknown as number, SECRET);
    expect(verifySession(noExpiry, SECRET, NOW)).toBeNull();
  });

  it('refuses a token signed with another secret', () => {
    expect(verifySession(signSession('someone', NOW + 60, 'other-secret'), SECRET, NOW)).toBeNull();
    expect(verifySession(token, 'other-secret', NOW)).toBeNull();
  });
});

describe('safeEqual', () => {
  it('is true only for the same string, whatever the lengths', () => {
    expect(safeEqual('fortePlatform', 'fortePlatform')).toBe(true);
    expect(safeEqual('fortePlatform', 'fortePlatforn')).toBe(false);
    expect(safeEqual('short', 'a much longer value than that')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('a=1; forte_session=abc.def; b=2', 'forte_session')).toBe('abc.def');
    expect(readCookie('forte_session=abc.def', 'forte_session')).toBe('abc.def');
  });

  it('returns undefined when the cookie or the header is missing', () => {
    expect(readCookie(undefined, 'forte_session')).toBeUndefined();
    expect(readCookie('', 'forte_session')).toBeUndefined();
    expect(readCookie('xforte_session=1; forte_session_old=2', 'forte_session')).toBeUndefined();
  });
});
