import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@ttt/contracts';
import { ActionWindow } from '../src/rate-limit.js';
import { createTestContext, type TestContext } from './support/database.js';

describe('server hardening', () => {
  let context: TestContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    context = await createTestContext();
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
    await context.prisma.$disconnect();
  });

  it('adds security headers and request IDs', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('rejects cross-origin REST mutations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/session',
      headers: {
        host: 'ttt.example',
        origin: 'https://evil.example',
      },
      payload: { displayName: 'Ada Lovelace' },
    });

    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('FORBIDDEN');
  });

  it('reports shutdown draining in readiness', async () => {
    app.lifecycle.shuttingDown = true;

    try {
      const response = await app.inject({ method: 'GET', url: '/api/health/ready' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        status: 'unavailable',
        checks: { shutdown: 'draining' },
      });
    } finally {
      app.lifecycle.shuttingDown = false;
    }
  });

  it('serves Prometheus metrics with a replica label', async () => {
    await app.inject({ method: 'GET', url: '/api/health/live' });

    const response = await app.inject({ method: 'GET', url: '/api/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('ttt_http_request_duration_seconds');
    expect(response.body).toContain('replica="test-replica"');
  });

  it('serves Swagger UI and the OpenAPI document outside production', async () => {
    const ui = await app.inject({ method: 'GET', url: '/api/docs/' });
    const document = await app.inject({ method: 'GET', url: '/api/docs/json' });

    expect(ui.statusCode).toBe(200);
    expect(ui.headers['content-type']).toContain('text/html');
    expect(ui.headers['content-security-policy']).toContain("default-src 'self'");
    expect(document.statusCode).toBe(200);
    expect(document.json()).toMatchObject({
      openapi: '3.0.3',
      paths: expect.objectContaining({
        '/api/games': expect.any(Object),
      }),
    });
  });
});

describe('rate limiting', () => {
  let context: TestContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    context = await createTestContext({ config: { rateLimitEnabled: true } });
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
    await context.prisma.$disconnect();
  });

  it('limits session creation with the API error shape', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({ method: 'POST', url: '/api/session' });
      expect(response.statusCode).toBe(400);
    }

    const response = await app.inject({ method: 'POST', url: '/api/session' });

    expect(response.statusCode).toBe(429);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('RATE_LIMITED');
  });
});

describe('ActionWindow', () => {
  it('resets after the window expires', () => {
    const window = new ActionWindow(2, 1_000);

    expect(window.allow(0)).toBe(true);
    expect(window.allow(0)).toBe(true);
    expect(window.allow(0)).toBe(false);
    expect(window.allow(1_000)).toBe(true);
  });
});

describe('production docs', () => {
  it('does not expose Swagger UI in production', async () => {
    const context = await createTestContext({
      config: { nodeEnv: 'production', isProduction: true },
    });

    try {
      const response = await context.app.inject({ method: 'GET', url: '/api/docs/' });

      expect(response.statusCode).toBe(404);
    } finally {
      await context.app.close();
      await context.prisma.$disconnect();
    }
  });
});

describe('production CSP', () => {
  it('does not upgrade insecure requests by default', async () => {
    const context = await createTestContext({
      config: { nodeEnv: 'production', isProduction: true },
    });

    try {
      const response = await context.app.inject({ method: 'GET', url: '/api/health/live' });
      const policy = response.headers['content-security-policy'];

      expect(policy).toContain("default-src 'self'");
      expect(policy).not.toContain('upgrade-insecure-requests');
    } finally {
      await context.app.close();
      await context.prisma.$disconnect();
    }
  });

  it('upgrades insecure requests when explicitly enabled', async () => {
    const context = await createTestContext({
      config: { nodeEnv: 'production', isProduction: true, cspUpgradeInsecureRequests: true },
    });

    try {
      const response = await context.app.inject({ method: 'GET', url: '/api/health/live' });

      expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    } finally {
      await context.app.close();
      await context.prisma.$disconnect();
    }
  });
});
