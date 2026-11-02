import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Metrics } from '../metrics.js';

interface HealthRoutesOptions {
  prisma: PrismaClient;
  metrics: Metrics;
  isShuttingDown: () => boolean;
  redisCheck?: () => Promise<boolean>;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, options) => {
  app.get('/api/health/live', async () => ({ status: 'ok' }));

  app.get('/api/health/ready', async (request, reply) => {
    const checks: Record<string, string> = {};
    let available = true;

    if (options.isShuttingDown()) {
      checks.shutdown = 'draining';
      available = false;
    }

    try {
      await options.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch (error) {
      checks.database = 'error';
      available = false;
      request.log.warn({ err: error }, 'database readiness check failed');
    }

    if (options.redisCheck) {
      try {
        const redisReady = await options.redisCheck();

        checks.redis = redisReady ? 'ok' : 'error';
        available = available && redisReady;
      } catch (error) {
        checks.redis = 'error';
        available = false;
        request.log.warn({ err: error }, 'redis readiness check failed');
      }
    }

    return reply.code(available ? 200 : 503).send({
      status: available ? 'ok' : 'unavailable',
      checks,
    });
  });

  app.get('/api/metrics', async (_request, reply) => {
    return reply
      .header('content-type', options.metrics.registry.contentType)
      .header('cache-control', 'no-store')
      .send(await options.metrics.registry.metrics());
  });
};
