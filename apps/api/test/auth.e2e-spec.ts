import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { SESSION_COOKIE } from '../src/auth/session-token.js';
import { GEMINI_STREAM } from '../src/chat/gemini.js';
import { appConfig, validateEnv, type AppConfig } from '../src/config/app.config.js';
import { configureApp } from '../src/configure-app.js';
import { fakeGemini, textTurn } from './fake-gemini.js';
import { signIn } from './sign-in.js';

// The Gemini seam is replaced by a fake, so no test here calls the real model.
async function createApp(gemini: ReturnType<typeof fakeGemini>, override: Partial<AppConfig> = {}) {
  const app: INestApplication<App> = (
    await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GEMINI_STREAM)
      .useValue(gemini.stream)
      .overrideProvider(appConfig.KEY)
      // AppModule's ConfigModule has already loaded .env into process.env.
      .useValue({ ...validateEnv(process.env), ...override })
      .compile()
  ).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** The username and password from apps/api/.env. The tests never spell them out. */
function credentials(app: INestApplication) {
  const { authUsername, authPassword } = app.get<AppConfig>(appConfig.KEY);
  if (authUsername === undefined || authPassword === undefined) {
    throw new Error('Set AUTH_USERNAME and AUTH_PASSWORD in apps/api/.env: these tests sign in with them.');
  }
  return { username: authUsername, password: authPassword };
}

/** The `name=value` pair of the session cookie in a response, ready for a `Cookie` header. */
function sessionCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  if (cookie === undefined) throw new Error('No session cookie in the response');
  return cookie.split(';')[0]!;
}

const UNAUTHENTICATED = { code: 'unauthenticated', message: expect.any(String) as unknown };

describe('sign-in', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(textTurn('v1_a', ['ok']));
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp(gemini);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('sets an HttpOnly, SameSite=Lax session cookie and returns the username', async () => {
      const { username, password } = credentials(app);
      const { sessionTtlHours } = app.get<AppConfig>(appConfig.KEY);

      const response = await http().post('/api/auth/login').send({ username, password }).expect(200);

      expect(response.body).toEqual({ username });
      const [cookie] = response.headers['set-cookie'] as unknown as string[];
      const [pair, ...attributes] = cookie!.split('; ');
      expect(pair).toMatch(new RegExp(`^${SESSION_COOKIE}=[\\w-]+\\.[\\w-]+$`));
      expect(attributes).toEqual(
        expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${sessionTtlHours * 3600}`]),
      );
      // Plain HTTP on localhost, in dev and in the Docker stack: no Secure unless configured.
      expect(attributes).not.toContain('Secure');
      // Neither the password nor anything derived from the body is in the cookie.
      expect(cookie).not.toContain(password);
    });

    it('answers a wrong password and a wrong username with the same 401 and no cookie', async () => {
      const { username, password } = credentials(app);

      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ username, password: `${password}x` })
        .expect(401);
      const wrongUsername = await http()
        .post('/api/auth/login')
        .send({ username: `${username}x`, password })
        .expect(401);

      expect(wrongPassword.body).toEqual({ code: 'invalid_credentials', message: expect.any(String) });
      expect(wrongUsername.body).toEqual(wrongPassword.body);
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
      expect(wrongUsername.headers['set-cookie']).toBeUndefined();
    });

    it.each([
      ['a missing password', { username: 'someone' }],
      ['an empty username', { username: '', password: 'x' }],
      ['an over-long password', { username: 'someone', password: 'x'.repeat(201) }],
      ['a non-string password', { username: 'someone', password: 12345 }],
      ['an unknown property', { username: 'someone', password: 'x', remember: true }],
    ])('rejects %s with 400', async (_case, body) => {
      await http().post('/api/auth/login').send(body).expect(400);
    });
  });

  describe('GET /api/auth/session', () => {
    it('is 200 with the username for a signed-in session and 401 without one', async () => {
      const { username, password } = credentials(app);
      const login = await http().post('/api/auth/login').send({ username, password }).expect(200);

      await http().get('/api/auth/session').set('Cookie', sessionCookie(login)).expect(200, { username });

      const anonymous = await http().get('/api/auth/session').expect(401);
      expect(anonymous.body).toEqual(UNAUTHENTICATED);
    });

    it('is 401 for a tampered cookie', async () => {
      const [payload, signature] = signIn(app).slice(SESSION_COOKIE.length + 1).split('.') as [string, string];
      const forgedPayload = Buffer.from(JSON.stringify({ u: 'admin', exp: 4_000_000_000 })).toString('base64url');
      const flipped = (signature.startsWith('A') ? 'B' : 'A') + signature.slice(1);

      for (const token of [`${forgedPayload}.${signature}`, `${payload}.${flipped}`, payload, 'garbage', '']) {
        await http().get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${token}`).expect(401);
        await http().get('/api/products').set('Cookie', `${SESSION_COOKIE}=${token}`).expect(401);
      }
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the cookie, and the session is then 401', async () => {
      const { username, password } = credentials(app);
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ username, password }).expect(200);
      await agent.get('/api/auth/session').expect(200);

      const logout = await agent.post('/api/auth/logout').expect(204);

      const [cookie] = logout.headers['set-cookie'] as unknown as string[];
      expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
      // The agent keeps cookies like a browser: it dropped this one.
      await agent.get('/api/auth/session').expect(401);
      await agent.get('/api/products').expect(401);
    });

    it('answers 204 when nobody is signed in', async () => {
      await http().post('/api/auth/logout').expect(204);
    });
  });

  describe('protected routes', () => {
    it.each(['/api/products', '/api/documents', '/api/documents/DS-FRT-CON-C3240/file'])(
      'GET %s is 401 without a session and 200 with one',
      async (path) => {
        const refused = await http().get(path).expect(401);
        expect(refused.headers['content-type']).toMatch(/application\/json/);
        expect(refused.body).toEqual(UNAUTHENTICATED);

        await http().get(path).set('Cookie', signIn(app)).expect(200);
      },
    );

    it('answers a hidden-or-unknown document with 401 when signed out and 404 when signed in', async () => {
      await http().get('/api/documents/DS-NOTHING-HERE/file').expect(401);
      await http().get('/api/documents/DS-NOTHING-HERE/file').set('Cookie', signIn(app)).expect(404);
    });

    it('POST /api/chat/stream is a JSON 401 that never reaches the model, and streams with a session', async () => {
      const refused = await http().post('/api/chat/stream').send({ message: 'hi' }).expect(401);
      expect(refused.headers['content-type']).toMatch(/application\/json/);
      expect(refused.body).toEqual(UNAUTHENTICATED);
      // Refused before validation too: an invalid body gives the same 401, not a 400.
      await http().post('/api/chat/stream').send({}).expect(401);
      expect(gemini.requests).toHaveLength(0);

      const response = await http()
        .post('/api/chat/stream')
        .set('Cookie', signIn(app))
        .send({ message: 'hi' })
        .expect(200)
        .expect('Content-Type', /^text\/event-stream/);
      expect(response.text).toContain('event: done');
      expect(gemini.requests).toHaveLength(1);
    });

    it('leaves GET /api/health open', async () => {
      await http().get('/api/health').expect(200, { status: 'ok' });
    });
  });
});

describe('chat rate limit and sign-in', () => {
  let app: INestApplication<App>;
  const gemini = fakeGemini(textTurn('v1_a', ['ok']));

  beforeAll(async () => {
    app = await createApp(gemini, { chatRateLimit: 1 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not count signed-out requests toward the chat rate limit', async () => {
    const send = () => request(app.getHttpServer()).post('/api/chat/stream').send({ message: 'hi' });

    await send().expect(401);
    await send().expect(401);
    await send().expect(401);
    await send().set('Cookie', signIn(app)).expect(200);
    await send().set('Cookie', signIn(app)).expect(429);
    // Past the limit, signed out is still 401: the session guard answers first.
    await send().expect(401);
    expect(gemini.requests).toHaveLength(1);
  });
});

describe('POST /api/auth/login rate limit', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp(fakeGemini(textTurn('v1_a', ['ok'])), { loginRateLimit: 2 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the third attempt in the window with 429, Retry-After and the rate_limited body', async () => {
    const { username, password } = credentials(app);
    const attempt = (body: object) => request(app.getHttpServer()).post('/api/auth/login').send(body);

    await attempt({ username, password: `${password}x` }).expect(401);
    await attempt({ username, password: `${password}x` }).expect(401);
    // Even the right password is refused once the limit is reached.
    const limited = await attempt({ username, password }).expect(429);

    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(limited.body).toEqual({ code: 'rate_limited', message: expect.any(String) });
    expect(limited.headers['set-cookie']).toBeUndefined();

    // Its own counter: the chat route is not limited by it, and other routes are untouched.
    await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', signIn(app)).expect(200);
    await request(app.getHttpServer())
      .post('/api/chat/stream')
      .set('Cookie', signIn(app))
      .send({ message: 'hi' })
      .expect(200);
  });
});

describe('sign-in not configured', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp(fakeGemini(textTurn('v1_a', ['ok'])), { authPassword: undefined });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers every login with 503 auth_not_configured and keeps the routes closed', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'anyone', password: 'anything' })
      .expect(503);

    expect(response.body).toEqual({ code: 'auth_not_configured', message: expect.any(String) });
    expect(response.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer()).get('/api/products').expect(401);
    await request(app.getHttpServer()).get('/api/auth/session').expect(401);
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
