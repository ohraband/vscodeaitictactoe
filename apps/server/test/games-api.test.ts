import {
  apiErrorSchema,
  gameListResponseSchema,
  gameResponseSchema,
  type GameSnapshot,
} from '@ttt/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  createRoom,
  createSoloGame,
  createTestContext,
  createTestSession,
  describeWithDatabase,
  getGame,
  getGameDetail,
  joinRoom,
  playCell,
  resetDatabase,
  type TestContext,
} from './support/database.js';

function errorCode(response: { json: () => unknown }): string {
  return apiErrorSchema.parse(response.json()).error.code;
}

async function quickMatch(app: FastifyInstance, cookie: string): Promise<GameSnapshot> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/games/quick-match',
    headers: { cookie },
  });

  expect(response.statusCode).toBe(200);

  return gameResponseSchema.parse(response.json()).game;
}

describeWithDatabase('game REST API', () => {
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

  it('plays a solo game against the AI and rejects stale or occupied moves', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const game = await createSoloGame(app, ada.cookie, 'hard');

    expect(game).toMatchObject({
      mode: 'single',
      visibility: 'private',
      status: 'active',
      difficulty: 'hard',
      turn: 'X',
      version: 0,
      playerO: null,
      winningLine: null,
      turnDeadline: null,
    });
    expect(game.playerX.id).toBe(ada.player.id);
    expect(game.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const moved = await playCell(app, ada.cookie, game.id, 4, 0);

    expect(moved.statusCode).toBe(200);

    const afterMove = gameResponseSchema.parse(moved.json()).game;

    expect(afterMove.board[4]).toBe('X');
    expect(afterMove.board.filter((cell) => cell !== null)).toHaveLength(2);
    expect(afterMove.version).toBe(2);
    expect(afterMove.turn).toBe('X');
    expect(afterMove.status).toBe('active');

    const detail = await getGameDetail(app, ada.cookie, game.id);

    expect(detail.moves).toHaveLength(2);
    expect(detail.moves[0]).toMatchObject({
      moveNumber: 1,
      cell: 4,
      symbol: 'X',
      playerId: ada.player.id,
    });
    expect(detail.moves[1]).toMatchObject({
      moveNumber: 2,
      playerId: null,
    });
    expect(detail.game.board).toEqual(afterMove.board);

    const occupied = await playCell(app, ada.cookie, game.id, 4, afterMove.version);

    expect(occupied.statusCode).toBe(409);
    expect(errorCode(occupied)).toBe('CELL_TAKEN');

    const stale = await playCell(app, ada.cookie, game.id, 0, 0);

    expect(stale.statusCode).toBe(409);
    expect(errorCode(stale)).toBe('STALE_STATE');

    const outsiderMove = await playCell(app, grace.cookie, game.id, 0, afterMove.version);

    expect(outsiderMove.statusCode).toBe(403);
    expect(errorCode(outsiderMove)).toBe('NOT_PARTICIPANT');

    const outsiderRead = await getGame(app, grace.cookie, game.id);

    expect(outsiderRead.statusCode).toBe(403);
    expect(errorCode(outsiderRead)).toBe('NOT_PARTICIPANT');

    const invalidCell = await app.inject({
      method: 'POST',
      url: `/api/games/${game.id}/moves`,
      headers: { cookie: ada.cookie },
      payload: { cell: 9, expectedVersion: afterMove.version },
    });

    expect(invalidCell.statusCode).toBe(400);
    expect(errorCode(invalidCell)).toBe('INVALID_REQUEST');

    const invalidId = await app.inject({
      method: 'GET',
      url: '/api/games/not-a-uuid',
      headers: { cookie: ada.cookie },
    });

    expect(invalidId.statusCode).toBe(400);
    expect(errorCode(invalidId)).toBe('INVALID_REQUEST');
  });

  it('creates and joins a private room, enforces turns, and finishes a line', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const linus = await createTestSession(app, 'Linus Torvalds');
    const room = await createRoom(app, ada.cookie);

    expect(room).toMatchObject({
      mode: 'multi',
      visibility: 'private',
      status: 'waiting',
      version: 0,
      playerO: null,
      startedAt: null,
      turnDeadline: null,
    });

    const ownJoin = await joinRoom(app, ada.cookie, room.code);

    expect(ownJoin.statusCode).toBe(409);
    expect(errorCode(ownJoin)).toBe('CONFLICT');

    const unknownJoin = await joinRoom(app, grace.cookie, 'ZZZZZZ');

    expect(unknownJoin.statusCode).toBe(404);
    expect(errorCode(unknownJoin)).toBe('GAME_NOT_FOUND');

    const invalidJoin = await app.inject({
      method: 'POST',
      url: '/api/games/join',
      headers: { cookie: grace.cookie },
      payload: { code: 'ABC' },
    });

    expect(invalidJoin.statusCode).toBe(400);
    expect(errorCode(invalidJoin)).toBe('INVALID_REQUEST');

    const joinedResponse = await joinRoom(app, grace.cookie, room.code);

    expect(joinedResponse.statusCode).toBe(200);

    const joined = gameResponseSchema.parse(joinedResponse.json()).game;

    expect(joined).toMatchObject({
      status: 'active',
      version: 1,
      playerX: { id: ada.player.id },
      playerO: { id: grace.player.id },
    });
    expect(joined.turnDeadline).not.toBeNull();

    const lateJoin = await joinRoom(app, linus.cookie, room.code);

    expect(lateJoin.statusCode).toBe(409);
    expect(errorCode(lateJoin)).toBe('CONFLICT');

    const outsiderMove = await playCell(app, linus.cookie, room.id, 0, joined.version);

    expect(outsiderMove.statusCode).toBe(403);
    expect(errorCode(outsiderMove)).toBe('NOT_PARTICIPANT');

    let version = joined.version;
    let response = await playCell(app, ada.cookie, room.id, 0, version);

    expect(response.statusCode).toBe(200);

    let game = gameResponseSchema.parse(response.json()).game;
    version = game.version;

    expect(game).toMatchObject({ version: 2, turn: 'O', status: 'active' });

    const outOfTurn = await playCell(app, ada.cookie, room.id, 1, version);

    expect(outOfTurn.statusCode).toBe(409);
    expect(errorCode(outOfTurn)).toBe('NOT_YOUR_TURN');

    response = await playCell(app, grace.cookie, room.id, 3, version);
    expect(response.statusCode).toBe(200);
    game = gameResponseSchema.parse(response.json()).game;
    version = game.version;

    const stale = await playCell(app, ada.cookie, room.id, 1, version - 1);

    expect(stale.statusCode).toBe(409);
    expect(errorCode(stale)).toBe('STALE_STATE');

    const taken = await playCell(app, ada.cookie, room.id, 0, version);

    expect(taken.statusCode).toBe(409);
    expect(errorCode(taken)).toBe('CELL_TAKEN');

    for (const [cookie, cell] of [
      [ada.cookie, 1],
      [grace.cookie, 4],
      [ada.cookie, 2],
    ] as const) {
      response = await playCell(app, cookie, room.id, cell, version);
      expect(response.statusCode).toBe(200);
      game = gameResponseSchema.parse(response.json()).game;
      version = game.version;
    }

    expect(game).toMatchObject({
      status: 'finished',
      winner: 'X',
      finishReason: 'line',
      winningLine: [0, 1, 2],
      turnDeadline: null,
    });
    expect(game.finishedAt).not.toBeNull();
    expect(game.version).toBe(6);

    const afterFinish = await playCell(app, grace.cookie, room.id, 5, game.version);

    expect(afterFinish.statusCode).toBe(409);
    expect(errorCode(afterFinish)).toBe('GAME_FINISHED');

    const detail = await getGameDetail(app, grace.cookie, room.id);

    expect(detail.moves.map((move) => move.cell)).toEqual([0, 3, 1, 4, 2]);
    expect(detail.moves.map((move) => move.symbol)).toEqual(['X', 'O', 'X', 'O', 'X']);
    expect(detail.moves.map((move) => move.moveNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(detail.game.status).toBe('finished');

    const outsiderRead = await getGame(app, linus.cookie, room.id);

    expect(outsiderRead.statusCode).toBe(403);
    expect(errorCode(outsiderRead)).toBe('NOT_PARTICIPANT');
  });

  it('lists participant history with filters and pagination', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const room = await createRoom(app, ada.cookie);
    const joined = gameResponseSchema.parse(
      (await joinRoom(app, grace.cookie, room.code)).json(),
    ).game;

    let version = joined.version;

    for (const [cookie, cell] of [
      [ada.cookie, 0],
      [grace.cookie, 3],
      [ada.cookie, 1],
      [grace.cookie, 4],
      [ada.cookie, 2],
    ] as const) {
      const response = await playCell(app, cookie, room.id, cell, version);

      version = gameResponseSchema.parse(response.json()).game.version;
    }

    const finished = await app.inject({
      method: 'GET',
      url: '/api/games?page=1&pageSize=10&mode=multi&status=finished',
      headers: { cookie: ada.cookie },
    });

    expect(finished.statusCode).toBe(200);

    const list = gameListResponseSchema.parse(finished.json());

    expect(list).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    expect(list.games[0]?.id).toBe(room.id);

    const active = await app.inject({
      method: 'GET',
      url: '/api/games?status=active',
      headers: { cookie: ada.cookie },
    });

    expect(gameListResponseSchema.parse(active.json()).total).toBe(0);

    const secondPage = await app.inject({
      method: 'GET',
      url: '/api/games?page=2&pageSize=1',
      headers: { cookie: ada.cookie },
    });
    const secondPageBody = gameListResponseSchema.parse(secondPage.json());

    expect(secondPageBody).toMatchObject({ page: 2, pageSize: 1, total: 1 });
    expect(secondPageBody.games).toHaveLength(0);

    const graceHistory = await app.inject({
      method: 'GET',
      url: '/api/games',
      headers: { cookie: grace.cookie },
    });

    expect(gameListResponseSchema.parse(graceHistory.json()).total).toBe(1);

    const outsiderHistory = await app.inject({
      method: 'GET',
      url: '/api/games',
      headers: { cookie: (await createTestSession(app, 'Linus Torvalds')).cookie },
    });

    expect(gameListResponseSchema.parse(outsiderHistory.json()).total).toBe(0);

    const unauthorized = await app.inject({ method: 'GET', url: '/api/games' });

    expect(unauthorized.statusCode).toBe(401);
    expect(errorCode(unauthorized)).toBe('UNAUTHORIZED');
  });

  it('only lets one of two racing players join a room', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const linus = await createTestSession(app, 'Linus Torvalds');
    const room = await createRoom(app, ada.cookie);

    const responses = await Promise.all([
      joinRoom(app, grace.cookie, room.code),
      joinRoom(app, linus.cookie, room.code),
    ]);
    const statuses = responses.map((response) => response.statusCode).sort();

    expect(statuses).toEqual([200, 409]);

    const winner = responses.find((response) => response.statusCode === 200);
    const loser = responses.find((response) => response.statusCode === 409);

    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    expect(errorCode(loser!)).toBe('CONFLICT');

    const winningGame = gameResponseSchema.parse(winner!.json()).game;
    const detail = await getGameDetail(app, ada.cookie, room.id);

    expect(winningGame.status).toBe('active');
    expect(detail.game.status).toBe('active');
    expect(detail.game.playerO?.id).toBe(winningGame.playerO?.id);
    expect([grace.player.id, linus.player.id]).toContain(detail.game.playerO?.id);

    const players = await context.prisma.game.findMany({
      where: { id: room.id },
      select: { playerOId: true },
    });

    expect(players).toHaveLength(1);
  });

  it('quick-matches the oldest public room without matching players with themselves', async () => {
    const { app } = context;
    const ada = await createTestSession(app, 'Ada Lovelace');
    const grace = await createTestSession(app, 'Grace Hopper');
    const linus = await createTestSession(app, 'Linus Torvalds');

    const first = await quickMatch(app, ada.cookie);
    const repeated = await quickMatch(app, ada.cookie);

    expect(first).toMatchObject({
      mode: 'multi',
      visibility: 'public',
      status: 'waiting',
      playerO: null,
    });
    expect(repeated.id).toBe(first.id);
    expect(repeated.version).toBe(first.version);

    const [graceGame, linusGame] = await Promise.all([
      quickMatch(app, grace.cookie),
      quickMatch(app, linus.cookie),
    ]);

    const joinedFirst = [graceGame, linusGame].find((game) => game.id === first.id);
    const createdSecond = [graceGame, linusGame].find((game) => game.id !== first.id);

    expect(joinedFirst).toBeDefined();
    expect(createdSecond).toBeDefined();
    expect(joinedFirst).toMatchObject({
      status: 'active',
      playerX: { id: ada.player.id },
    });
    expect([grace.player.id, linus.player.id]).toContain(joinedFirst?.playerO?.id);
    expect(createdSecond).toMatchObject({
      visibility: 'public',
      status: 'waiting',
      playerO: null,
    });
    expect(createdSecond?.version).toBe(0);
    expect([grace.player.id, linus.player.id]).toContain(createdSecond?.playerX.id);

    const waitingSession = createdSecond?.playerX.id === grace.player.id ? grace : linus;
    const opponent = waitingSession.player.id === grace.player.id ? linus : grace;
    const matched = await quickMatch(app, opponent.cookie);

    expect(matched.id).toBe(createdSecond?.id);
    expect(matched.status).toBe('active');
    expect(matched.playerO?.id).toBe(opponent.player.id);
    expect(matched.playerX.id).toBe(waitingSession.player.id);
  });
});
