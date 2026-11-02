import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import type { ServerConfig } from './config.js';
import { HttpError } from './errors.js';

export const RATE_LIMIT_GLOBAL_MAX = 120;
export const IDENTITY_RATE_LIMIT_MAX = 10;
export const SOCKET_ACTION_LIMIT_MAX = 30;
export const SOCKET_ACTION_LIMIT_WINDOW_MS = 10_000;

export class ActionWindow {
  private count = 0;
  private resetAt = 0;

  constructor(
    private readonly max: number = SOCKET_ACTION_LIMIT_MAX,
    private readonly windowMs: number = SOCKET_ACTION_LIMIT_WINDOW_MS,
  ) {}

  allow(now = Date.now()): boolean {
    if (now >= this.resetAt) {
      this.resetAt = now + this.windowMs;
      this.count = 0;
    }

    if (this.count >= this.max) {
      return false;
    }

    this.count += 1;

    return true;
  }
}

export async function registerRateLimit(app: FastifyInstance, config: ServerConfig): Promise<void> {
  if (!config.rateLimitEnabled) {
    return;
  }

  let redis: Redis | undefined;

  if (config.redisUrl) {
    redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    redis.on('error', (error) => {
      app.log.error({ err: error }, 'rate limit redis error');
    });

    app.addHook('onClose', async () => {
      if (redis?.status === 'ready') {
        await redis.quit();
        return;
      }

      redis?.disconnect();
    });
  }

  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT_GLOBAL_MAX,
    timeWindow: '1 minute',
    nameSpace: 'ttt:ratelimit:',
    skipOnError: true,
    ...(redis ? { redis } : {}),
    allowList: (request) =>
      request.url.startsWith('/api/health/') ||
      request.url === '/api/metrics' ||
      request.url.startsWith('/api/docs'),
    errorResponseBuilder: (_request, context) =>
      new HttpError(429, 'RATE_LIMITED', `Too many requests. Try again in ${context.after}.`),
  });
}
