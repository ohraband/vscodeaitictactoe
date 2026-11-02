import { apiErrorSchema, gameResponseSchema, type GameSnapshot } from '@ttt/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { GameSweeper } from '../src/game/sweeper.js';
import {
  createRoom,
  createSoloGame,
  createTestContext,
  createTestSession,
  describeWithDatabase,
  getGameDetail,
  joinRoom,
  playCell,
  resetDatabase,
  type TestContext,
  type TestSession,
} from './support/database.js';

function errorCode(response: { json: () => unknown }): string {
  return apiErrorSchema.parse(response.json()).error.code;
}

async function startMultiplayerGame(
  app: FastifyInstance,
  ada: TestSession,
  grace: TestSession,
): Promise<GameSnapshot> {
  const room = await createRoom(app, ada.cookie);
  const response = await joinRoom(app, grace.cookie, room.code);

  expect(response.statusCode).toBe(200);

  return gameResponseSchema.parse(response.json()).game;
}

async function finishGameWithLine(
  app: FastifyInstance,
  ada: TestSession,
  grace: TestSession,
  game: GameSnapshot,
): Promise<GameSnapshot> {
  let current = game;

  for (const [cookie, cell] of [
    [ada.cookie, 0],
    [grace.cookie, 3],
    [ada.cookie, 1],
    [grace.cookie, 4],
    [ada.cookie, 2],
  ] as const) {
    const response = await playCell(app, cookie, current.id, cell, current.version);

    expect(response.statusCode).toBe(200);
    current = gameResponseSchema.parse(response.json()).game;
  }

  expect(current.status).toBe('finished');

  return current;
}

describeWithDatabase('game lifecycle', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
  });

  afterAll(async () => {
    await context.app.close();
    await context.prisma.$disconnect();
  });

  it('sweeps timed-out turns into timeout forfeits', async () => {
    const { app, prisma } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const game = await startMultiplayerGame(app, ada, grace);

    await prisma.game.update({
      where: { id: game.id },
      data: { turnDeadline: new Date(Date.now() - 60_000) },
    });

    const sweeper = new GameSweeper({ prisma });
    const firstSweep = await sweeper.sweep(new Date());

    expect(firstSweep).toEqual({ timedOut: 1, abandoned: 0 });

    const detail = await getGameDetail(app, ada.cookie, game.id);

    expect(detail.game).toMatchObject({
      status: 'finished',
      winner: 'O',
      finishReason: 'timeout',
      turnDeadline: null,
    });
    expect(detail.game.finishedAt).not.toBeNull();
    expect(detail.game.version).toBe(game.version + 1);

    const secondSweep = await sweeper.sweep(new Date());

    expect(secondSweep).toEqual({ timedOut: 0, abandoned: 0 });
  });

  it('finishes an overdue game when a move arrives before the sweeper', async () => {
    const { app, prisma } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const game = await startMultiplayerGame(app, ada, grace);

    await prisma.game.update({
      where: { id: game.id },
      data: { turnDeadline: new Date(Date.now() - 1_000) },
    });

    const response = await playCell(app, ada.cookie, game.id, 0, game.version);

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('GAME_FINISHED');

    const detail = await getGameDetail(app, grace.cookie, game.id);

    expect(detail.game).toMatchObject({
      status: 'finished',
      winner: 'O',
      finishReason: 'timeout',
    });
    expect(detail.moves).toHaveLength(0);
  });

  it('abandons stale waiting rooms without touching fresh ones', async () => {
    const { app, prisma } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const stale = await createRoom(app, ada.cookie);
    const fresh = await createRoom(app, grace.cookie);

    await prisma.game.update({
      where: { id: stale.id },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });

    const sweeper = new GameSweeper({ prisma });
    const result = await sweeper.sweep(new Date());

    expect(result).toEqual({ timedOut: 0, abandoned: 1 });

    const staleDetail = await getGameDetail(app, ada.cookie, stale.id);

    expect(staleDetail.game).toMatchObject({
      status: 'abandoned',
      winner: null,
      finishReason: 'abandoned',
    });

    const freshDetail = await getGameDetail(app, grace.cookie, fresh.id);

    expect(freshDetail.game.status).toBe('waiting');
  });

  it('forfeits when a player leaves an active multiplayer game', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const game = await startMultiplayerGame(app, ada, grace);

    const left = await app.inject({
      method: 'POST',
      url: `/api/games/${game.id}/leave`,
      headers: { cookie: ada.cookie },
    });

    expect(left.statusCode).toBe(200);

    const forfeited = gameResponseSchema.parse(left.json()).game;

    expect(forfeited).toMatchObject({
      status: 'finished',
      winner: 'O',
      finishReason: 'forfeit',
      turnDeadline: null,
    });

    const repeated = await app.inject({
      method: 'POST',
      url: `/api/games/${game.id}/leave`,
      headers: { cookie: grace.cookie },
    });
    const unchanged = gameResponseSchema.parse(repeated.json()).game;

    expect(unchanged.status).toBe('finished');
    expect(unchanged.winner).toBe('O');
    expect(unchanged.version).toBe(forfeited.version);
  });

  it('abandons a waiting room when its creator leaves', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const room = await createRoom(app, ada.cookie);
    const left = await app.inject({
      method: 'POST',
      url: `/api/games/${room.id}/leave`,
      headers: { cookie: ada.cookie },
    });

    expect(left.statusCode).toBe(200);

    const abandoned = gameResponseSchema.parse(left.json()).game;

    expect(abandoned).toMatchObject({
      status: 'abandoned',
      winner: null,
      finishReason: 'abandoned',
    });
  });

  it('starts a rematch after both players vote and swaps symbols idempotently', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const game = await startMultiplayerGame(app, ada, grace);
    const finished = await finishGameWithLine(app, ada, grace, game);

    const rematchUrl = `/api/games/${finished.id}/rematch`;
    const firstVote = await app.inject({
      method: 'POST',
      url: rematchUrl,
      headers: { cookie: ada.cookie },
    });

    expect(firstVote.statusCode).toBe(200);

    const waiting = gameResponseSchema.parse(firstVote.json()).game;

    expect(waiting.status).toBe('finished');
    expect(waiting.rematchRequestedByX).toBe(true);
    expect(waiting.rematchRequestedByO).toBe(false);

    const repeatedVote = await app.inject({
      method: 'POST',
      url: rematchUrl,
      headers: { cookie: ada.cookie },
    });
    const stillWaiting = gameResponseSchema.parse(repeatedVote.json()).game;

    expect(stillWaiting.status).toBe('finished');
    expect(stillWaiting.version).toBe(waiting.version);
    expect(stillWaiting.rematchRequestedByX).toBe(true);
    expect(stillWaiting.rematchRequestedByO).toBe(false);

    const secondVote = await app.inject({
      method: 'POST',
      url: rematchUrl,
      headers: { cookie: grace.cookie },
    });

    expect(secondVote.statusCode).toBe(200);

    const rematch = gameResponseSchema.parse(secondVote.json()).game;

    expect(rematch).toMatchObject({
      mode: 'multi',
      visibility: 'private',
      status: 'active',
      board: Array(9).fill(null),
      turn: 'X',
      winner: null,
      finishReason: null,
      winningLine: null,
      version: 0,
      rematchRequestedByX: false,
      rematchRequestedByO: false,
      playerX: { id: grace.player.id },
      playerO: { id: ada.player.id },
    });
    expect(rematch.id).not.toBe(finished.id);
    expect(rematch.code).not.toBe(finished.code);
    expect(rematch.turnDeadline).not.toBeNull();

    const retry = await app.inject({
      method: 'POST',
      url: rematchUrl,
      headers: { cookie: ada.cookie },
    });
    const retried = gameResponseSchema.parse(retry.json()).game;

    expect(retried.id).toBe(rematch.id);

    const firstMove = await playCell(app, grace.cookie, rematch.id, 4, 0);

    expect(firstMove.statusCode).toBe(200);

    const moved = gameResponseSchema.parse(firstMove.json()).game;

    expect(moved).toMatchObject({ version: 1, turn: 'O' });
    expect(moved.board[4]).toBe('X');
  });

  it('leaves turn deadlines unset when timers are disabled', async () => {
    await resetDatabase(context.prisma);
    const untimed = await createTestContext({ turnSeconds: 0 });

    try {
      const ada = await createTestSession(untimed.app, 'Ada Lovelace');
      const grace = await createTestSession(untimed.app, 'Grace Hopper');
      const game = await startMultiplayerGame(untimed.app, ada, grace);

      expect(game.turnDeadline).toBeNull();

      const response = await playCell(untimed.app, ada.cookie, game.id, 0, game.version);

      expect(response.statusCode).toBe(200);

      const moved = gameResponseSchema.parse(response.json()).game;

      expect(moved.status).toBe('active');
      expect(moved.turnDeadline).toBeNull();
    } finally {
      await untimed.app.close();
      await untimed.prisma.$disconnect();
    }
  });

  it('rejects rematches for unfinished or single-player games', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const activeGame = await startMultiplayerGame(app, ada, grace);
    const early = await app.inject({
      method: 'POST',
      url: `/api/games/${activeGame.id}/rematch`,
      headers: { cookie: ada.cookie },
    });

    expect(early.statusCode).toBe(409);
    expect(errorCode(early)).toBe('CONFLICT');

    const solo = await createSoloGame(app, ada.cookie);
    const soloRematch = await app.inject({
      method: 'POST',
      url: `/api/games/${solo.id}/rematch`,
      headers: { cookie: ada.cookie },
    });

    expect(soloRematch.statusCode).toBe(400);
    expect(errorCode(soloRematch)).toBe('INVALID_REQUEST');
  });
});
