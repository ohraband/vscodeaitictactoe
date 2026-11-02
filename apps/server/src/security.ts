import helmet from '@fastify/helmet';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ServerConfig } from './config.js';
import { HttpError } from './errors.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function originHost(origin: string): string | null {
  try {
    const url = new URL(origin);

    return url.protocol === 'http:' || url.protocol === 'https:' ? url.host.toLowerCase() : null;
  } catch {
    return null;
  }
}

function hasValidOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;

  if (!origin) return true;

  const host = request.headers.host?.toLowerCase();

  return Boolean(host && originHost(origin) === host);
}

export async function registerSecurityHeaders(
  app: FastifyInstance,
  config: ServerConfig,
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: config.cspUpgradeInsecureRequests ? [] : null,
      },
    },
    ...(config.isProduction ? {} : { hsts: false }),
  });

  app.addHook('onRequest', async (request) => {
    if (!mutationMethods.has(request.method) || !request.url.startsWith('/api/')) {
      return;
    }

    if (!hasValidOrigin(request)) {
      request.log.warn(
        {
          method: request.method,
          url: request.url,
          origin: request.headers.origin,
          host: request.headers.host,
        },
        'rejected cross-origin mutation',
      );
      throw new HttpError(403, 'FORBIDDEN', 'Cross-origin requests are not allowed.');
    }
  });
}
