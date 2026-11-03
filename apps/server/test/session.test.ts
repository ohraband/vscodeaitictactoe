import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { apiErrorSchema, sessionResponseSchema } from '@ttt/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import { createPrismaClient } from '../src/db.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const testConfig: ServerConfig = {
  nodeEnv: 'test',
  isProduction: false,
  host: '127.0.0.1',
  port: 0,
  databaseUrl: databaseUrl ?? 'postgresql://invalid',
  sessionSecret: 'integration-test-secret-with-enough-length',
  sessionTtlDays: 30,
  turnSeconds: 60,
  socketPingIntervalMs: 25_000,
  socketPingTimeoutMs: 20_000,
  redisUrl: null,
  logLevel: 'silent',
  rateLimitEnabled: false,
  cspUpgradeInsecureRequests: false,
  sessionCookieSecure: false,
  metricsReplicaId: 'test-replica',
  kafka: null,
};

function getSetCookie(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('Expected a set-cookie header.');
  }

  return value;
}

function sessionCookieFrom(setCookie: string): string {
  const cookie = setCookie.split(';')[0];

  if (!cookie) {
    throw new Error('Expected a session cookie.');
  }

  return cookie;
}

describeWithDatabase('guest sessions', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient(testConfig.databaseUrl);
    app = await buildApp({ config: testConfig, prisma });
  });

  beforeEach(async () => {
    await prisma.move.deleteMany();
    await prisma.game.deleteMany();
    await prisma.analyticsGameCompleted.deleteMany();
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createSession(displayName: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { displayName },
    });

    return response;
  }

  it('creates a guest, sets a hardened cookie, and returns the profile', async () => {
    const response = await createSession('  Ada   Lovelace  ');
    const body = sessionResponseSchema.parse(response.json());
    const setCookie = getSetCookie(response.headers);

    expect(response.statusCode).toBe(201);
    expect(body.player.displayName).toBe('Ada Lovelace');
    expect(body.player.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(setCookie).toContain('ttt_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).not.toContain('Secure');

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: sessionCookieFrom(setCookie) },
    });
    const meBody = sessionResponseSchema.parse(me.json());

    expect(me.statusCode).toBe(200);
    expect(meBody.player).toEqual(body.player);
  });

  it('rejects duplicate names case-insensitively', async () => {
    expect((await createSession('Ada Lovelace')).statusCode).toBe(201);

    const duplicate = await createSession('  ada   lovelace ');

    expect(duplicate.statusCode).toBe(409);
    expect(apiErrorSchema.parse(duplicate.json()).error).toMatchObject({
      code: 'NAME_TAKEN',
    });
  });

  it('renames a guest and keeps the unique name constraint', async () => {
    await createSession('Ada Lovelace');
    const grace = await createSession('Grace Hopper');
    const graceCookie = sessionCookieFrom(getSetCookie(grace.headers));

    const conflict = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { cookie: graceCookie },
      payload: { displayName: 'ADA LOVELACE' },
    });

    expect(conflict.statusCode).toBe(409);
    expect(apiErrorSchema.parse(conflict.json()).error.code).toBe('NAME_TAKEN');

    const renamed = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { cookie: graceCookie },
      payload: { displayName: '  Grace   Hopper ' },
    });
    const renamedBody = sessionResponseSchema.parse(renamed.json());

    expect(renamed.statusCode).toBe(200);
    expect(renamedBody.player.displayName).toBe('Grace Hopper');

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: graceCookie },
    });

    expect(sessionResponseSchema.parse(me.json()).player.displayName).toBe('Grace Hopper');
  });

  it('allows changing the casing of your own name', async () => {
    const created = await createSession('Ada Lovelace');
    const cookie = sessionCookieFrom(getSetCookie(created.headers));
    const renamed = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { cookie },
      payload: { displayName: 'ADA LOVELACE' },
    });

    expect(renamed.statusCode).toBe(200);
    expect(sessionResponseSchema.parse(renamed.json()).player.displayName).toBe('ADA LOVELACE');
  });

  it('rejects invalid input and unauthenticated requests', async () => {
    const invalid = await createSession('a');

    expect(invalid.statusCode).toBe(400);
    expect(apiErrorSchema.parse(invalid.json()).error).toMatchObject({
      code: 'INVALID_REQUEST',
      requestId: expect.any(String),
    });
    expect(invalid.headers['x-request-id']).toBe(
      apiErrorSchema.parse(invalid.json()).error.requestId,
    );

    const missing = await app.inject({ method: 'GET', url: '/api/me' });

    expect(missing.statusCode).toBe(401);
    expect(apiErrorSchema.parse(missing.json()).error.code).toBe('UNAUTHORIZED');

    const tampered = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'ttt_session=11111111-1111-4111-8111-111111111111.bad' },
    });

    expect(tampered.statusCode).toBe(401);
    expect(apiErrorSchema.parse(tampered.json()).error.code).toBe('UNAUTHORIZED');
    expect(getSetCookie(tampered.headers)).toContain('ttt_session=');

    const renameWithoutSession = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      payload: { displayName: 'Ada Lovelace' },
    });

    expect(renameWithoutSession.statusCode).toBe(401);
  });

  it('keeps the session cookie on invalid rename input', async () => {
    const created = await createSession('Ada Lovelace');
    const cookie = sessionCookieFrom(getSetCookie(created.headers));
    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { cookie },
      payload: { displayName: '!' },
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.headers['set-cookie']).toBeUndefined();
  });

  it('reports liveness and database readiness', async () => {
    const live = await app.inject({ method: 'GET', url: '/api/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
    });
  });
});
