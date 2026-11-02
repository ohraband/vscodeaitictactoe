import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  createGameRequestSchema,
  gameIdSchema,
  gameListQuerySchema,
  joinGameRequestSchema,
  moveBodySchema,
} from '@ttt/contracts';
import { z } from 'zod';
import type { ServerConfig } from '../config.js';
import type { GameService } from '../game/service.js';
import type { GamePublisher } from '../game/publisher.js';
import { requirePlayer } from '../session-cookie.js';
import { parseInput } from '../validation.js';

interface GameRoutesOptions {
  prisma: PrismaClient;
  config: ServerConfig;
  gameService: GameService;
  realtime: GamePublisher;
}

const gameParamsSchema = z.object({
  id: gameIdSchema,
});

export const gameRoutes: FastifyPluginAsync<GameRoutesOptions> = async (app, options) => {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store');
    return payload;
  });

  app.post('/api/games', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const input = parseInput(createGameRequestSchema, request.body);
    const game = await options.gameService.createGame(
      input.mode === 'single'
        ? { playerId: player.id, mode: 'single', difficulty: input.difficulty }
        : { playerId: player.id, mode: 'multi', visibility: input.visibility },
    );

    options.realtime.notifyGame(game);
    request.log.info(
      { gameId: game.id, mode: game.mode, visibility: game.visibility },
      'game created',
    );

    return reply.code(201).send({ game });
  });

  app.post('/api/games/join', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const input = parseInput(joinGameRequestSchema, request.body);
    const game = await options.gameService.joinGame(player.id, input.code);

    options.realtime.notifyGame(game);
    request.log.info({ gameId: game.id, playerId: player.id }, 'game joined');

    return reply.send({ game });
  });

  app.post('/api/games/quick-match', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const game = await options.gameService.quickMatch(player.id);

    options.realtime.notifyGame(game);
    request.log.info(
      { gameId: game.id, playerId: player.id, status: game.status },
      'quick match requested',
    );

    return reply.send({ game });
  });

  app.get('/api/games', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const query = parseInput(gameListQuerySchema, request.query);

    return options.gameService.listGames(player.id, query);
  });

  app.get('/api/games/:id', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const params = parseInput(gameParamsSchema, request.params);

    return options.gameService.getGameDetail(params.id, player.id);
  });

  app.post('/api/games/:id/moves', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const params = parseInput(gameParamsSchema, request.params);
    const input = parseInput(moveBodySchema, request.body);
    const game = await options.gameService.playMove({
      gameId: params.id,
      playerId: player.id,
      cell: input.cell,
      expectedVersion: input.expectedVersion,
    });

    options.realtime.notifyGame(game);
    request.log.info(
      {
        gameId: game.id,
        playerId: player.id,
        version: game.version,
        status: game.status,
      },
      'move accepted',
    );

    return reply.send({ game });
  });

  app.post('/api/games/:id/leave', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const params = parseInput(gameParamsSchema, request.params);
    const game = await options.gameService.leaveGame(params.id, player.id);

    options.realtime.notifyGame(game);
    request.log.info({ gameId: game.id, playerId: player.id, status: game.status }, 'game left');

    return reply.send({ game });
  });

  app.post('/api/games/:id/rematch', async (request, reply) => {
    const player = await requirePlayer(request, reply, options.prisma, options.config);
    const params = parseInput(gameParamsSchema, request.params);
    const game = await options.gameService.requestRematch(params.id, player.id);

    options.realtime.notifyMutation(game, params.id);
    request.log.info(
      { gameId: params.id, rematchGameId: game.id, playerId: player.id },
      'rematch vote recorded',
    );

    return reply.send({ game });
  });
};
