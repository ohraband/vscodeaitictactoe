import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { PrismaClient } from '@prisma/client';
import type { ApiError } from '@ttt/contracts';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import {
  createAnalyticsPublisher,
  type AnalyticsPublisher,
} from './analytics/publisher.js';
import type { ServerConfig } from './config.js';
import { HttpError } from './errors.js';
import { noopGamePublisher, type GamePublisher } from './game/publisher.js';
import { createGameService } from './game/service.js';
import { createMetrics, type Metrics } from './metrics.js';
import { openApiDocument } from './openapi.js';
import { registerRateLimit } from './rate-limit.js';
import type { RealtimeServerFactory } from './realtime.js';
import { gameRoutes } from './routes/games.js';
import { healthRoutes } from './routes/health.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { sessionRoutes } from './routes/session.js';
import { registerSecurityHeaders } from './security.js';

export interface AppDependencies {
  config: ServerConfig;
  prisma: PrismaClient;
  realtimeFactory?: RealtimeServerFactory;
  analyticsPublisher?: AnalyticsPublisher;
}

export interface AppLifecycle {
  shuttingDown: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    readonly realtime: GamePublisher;
    readonly lifecycle: AppLifecycle;
    readonly metrics: Metrics;
    readonly analytics: AnalyticsPublisher;
  }
}

function loggerOptions(config: ServerConfig): NonNullable<FastifyServerOptions['logger']> {
  if (config.nodeEnv === 'test') {
    return false;
  }

  const base = {
    level: config.logLevel,
    base: {
      service: 'ttt-server',
    },
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      remove: true,
    },
  };

  if (config.nodeEnv === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return base;
}

export async function buildApp({
  config,
  prisma,
  realtimeFactory,
  analyticsPublisher,
}: AppDependencies): Promise<FastifyInstance> {
  const webDistDir = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  const serveWeb = existsSync(webDistDir);
  const app = Fastify({
    logger: loggerOptions(config),
    bodyLimit: 16 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    trustProxy: config.isProduction,
  });

  const metrics = createMetrics(config.metricsReplicaId);
  const lifecycle: AppLifecycle = { shuttingDown: false };
  const analytics =
    analyticsPublisher ?? createAnalyticsPublisher({ kafka: config.kafka, logger: app.log });

  app.decorate('metrics', metrics);
  app.decorate('lifecycle', lifecycle);
  app.decorate('analytics', analytics);
  app.addHook('onClose', async () => {
    await analytics.close();
  });

  await app.register(cookie);
  await registerSecurityHeaders(app, config);

  if (!config.isProduction) {
    await app.register(swagger, { openapi: openApiDocument });
  }

  await registerRateLimit(app, config);

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';

    metrics.httpRequestDuration.observe(
      {
        method: request.method,
        route,
        status_code: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '';
    const isApi =
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      pathname === '/socket.io' ||
      pathname.startsWith('/socket.io/');

    if (serveWeb && request.method === 'GET' && !isApi && !pathname.includes('.')) {
      return reply.sendFile('index.html');
    }

    const body: ApiError = {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        requestId: request.id,
      },
    };

    return reply.code(404).send(body);
  });

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      request.log.warn({ code: error.code, statusCode: error.statusCode }, 'request rejected');

      const body: ApiError = {
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      };

      return reply.code(error.statusCode).send(body);
    }

    const statusCode = error.statusCode ?? 500;

    if (statusCode < 500) {
      const body: ApiError = {
        error: {
          code: 'INVALID_REQUEST',
          message:
            statusCode === 413 ? 'Request body is too large.' : 'The request could not be parsed.',
          requestId: request.id,
        },
      };

      request.log.warn({ statusCode }, 'request could not be parsed');

      return reply.code(statusCode).send(body);
    }

    request.log.error({ err: error }, 'request failed');

    const body: ApiError = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred.',
        requestId: request.id,
      },
    };

    return reply.code(500).send(body);
  });

  const gameService = createGameService({ prisma, config, metrics, analytics });
  let realtime: GamePublisher = noopGamePublisher;
  let redisCheck: (() => Promise<boolean>) | undefined;

  if (realtimeFactory) {
    const server = await realtimeFactory({
      httpServer: app.server,
      prisma,
      config,
      gameService,
      logger: app.log,
      metrics,
    });

    realtime = server;
    redisCheck = () => server.ping();
    app.addHook('onClose', async () => {
      await server.close();
    });
  }

  app.decorate('realtime', realtime);

  await app.register(healthRoutes, {
    prisma,
    metrics,
    isShuttingDown: () => lifecycle.shuttingDown,
    ...(redisCheck ? { redisCheck } : {}),
  });
  await app.register(sessionRoutes, { prisma, config });
  await app.register(gameRoutes, { prisma, config, gameService, realtime });
  await app.register(leaderboardRoutes, { prisma, config, gameService });

  if (!config.isProduction) {
    app.addHook('onRoute', (route) => {
      if (!route.url.startsWith('/api/docs')) {
        return;
      }

      route.config = {
        ...(route.config ?? {}),
        helmet: { contentSecurityPolicy: false },
        rateLimit: false,
      } as NonNullable<typeof route.config>;
    });

    await app.register(swaggerUi, {
      routePrefix: '/api/docs',
      staticCSP: true,
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  if (serveWeb) {
    await app.register(fastifyStatic, { root: webDistDir });
  }

  return app;
}
