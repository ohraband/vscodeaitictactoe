import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { renameRequestSchema, sessionRequestSchema } from '@ttt/contracts';
import type { ServerConfig } from '../config.js';
import { createPlayer, renamePlayer, toPublicPlayer } from '../players.js';
import { IDENTITY_RATE_LIMIT_MAX } from '../rate-limit.js';
import { requirePlayer, setSessionCookie } from '../session-cookie.js';
import { parseInput } from '../validation.js';

interface SessionRoutesOptions {
  prisma: PrismaClient;
  config: ServerConfig;
}

export const sessionRoutes: FastifyPluginAsync<SessionRoutesOptions> = async (app, options) => {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store');
    return payload;
  });

  app.post(
    '/api/session',
    { config: { rateLimit: { max: IDENTITY_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = parseInput(sessionRequestSchema, request.body);
      const player = await createPlayer(options.prisma, input.displayName);

      setSessionCookie(reply, player.id, options.config);

      return reply.code(201).send({ player: toPublicPlayer(player) });
    },
  );

  app.get('/api/me', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);

    return { player: toPublicPlayer(player) };
  });

  app.patch(
    '/api/me',
    { config: { rateLimit: { max: IDENTITY_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const player = await requirePlayer(request, reply, options.prisma, options.config);
      const input = parseInput(renameRequestSchema, request.body);
      const updated = await renamePlayer(options.prisma, player.id, input.displayName);

      return { player: toPublicPlayer(updated) };
    },
  );
};
