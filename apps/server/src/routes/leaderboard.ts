import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { leaderboardQuerySchema } from '@ttt/contracts';
import type { ServerConfig } from '../config.js';
import type { GameService } from '../game/service.js';
import { requirePlayer } from '../session-cookie.js';
import { parseInput } from '../validation.js';

interface LeaderboardRoutesOptions {
  prisma: PrismaClient;
  config: ServerConfig;
  gameService: GameService;
}

export const leaderboardRoutes: FastifyPluginAsync<LeaderboardRoutesOptions> = async (
  app,
  options,
) => {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store');
    return payload;
  });

  app.get('/api/leaderboard', async (request, reply) => {
    await requirePlayer(request, reply, options.prisma, options.config);
    const query = parseInput(leaderboardQuerySchema, request.query);

    return options.gameService.leaderboard(query);
  });
};
