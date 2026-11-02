import type { Player } from '@prisma/client';
import { apiErrorSchema, leaderboardResponseSchema } from '@ttt/contracts';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  createTestContext,
  createTestSession,
  describeWithDatabase,
  resetDatabase,
  seedGame,
  seedPlayer,
  type TestContext,
} from './support/database.js';

describeWithDatabase('leaderboard', () => {
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

  it('ranks eligible multiplayer players by wins then win rate', async () => {
    const { app, prisma } = context;
    const linus = await createTestSession(app, 'Linus Torvalds');
    const ada = await seedPlayer(prisma, 'Ada Lovelace');
    const grace = await seedPlayer(prisma, 'Grace Hopper');
    const alan = await seedPlayer(prisma, 'Alan Turing');
    const barbara = await seedPlayer(prisma, 'Barbara Liskov');
    const fillers: Player[] = [];

    for (let index = 0; index < 22; index += 1) {
      fillers.push(await seedPlayer(prisma, `Filler ${index + 1}`));
    }

    let fillerIndex = 0;

    function nextFiller() {
      const filler = fillers[fillerIndex];
      fillerIndex += 1;

      if (!filler) throw new Error('Ran out of filler players.');

      return filler;
    }

    async function record(
      playerId: string,
      opponentId: string,
      winner: 'X' | 'O' | 'DRAW',
    ): Promise<void> {
      await seedGame(prisma, {
        playerXId: playerId,
        playerOId: opponentId,
        winner,
      });
    }

    for (let index = 0; index < 5; index += 1) {
      await record(linus.player.id, nextFiller().id, 'X');
    }

    for (let index = 0; index < 4; index += 1) {
      await record(ada.id, nextFiller().id, 'X');
    }

    for (let index = 0; index < 2; index += 1) {
      await record(ada.id, nextFiller().id, 'DRAW');
    }

    for (let index = 0; index < 3; index += 1) {
      await record(grace.id, nextFiller().id, 'X');
    }

    for (let index = 0; index < 2; index += 1) {
      const opponent = nextFiller();

      await seedGame(prisma, {
        playerXId: opponent.id,
        playerOId: grace.id,
        winner: 'X',
      });
    }

    for (let index = 0; index < 4; index += 1) {
      await record(alan.id, nextFiller().id, 'X');
    }

    for (let index = 0; index < 5; index += 1) {
      await seedGame(prisma, {
        playerXId: barbara.id,
        mode: 'SINGLE',
        winner: 'X',
      });
    }

    await seedGame(prisma, {
      playerXId: ada.id,
      playerOId: nextFiller().id,
      status: 'ACTIVE',
    });
    await seedGame(prisma, {
      playerXId: ada.id,
      playerOId: nextFiller().id,
      status: 'ABANDONED',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      headers: { cookie: linus.cookie },
    });

    expect(response.statusCode).toBe(200);

    const body = leaderboardResponseSchema.parse(response.json());

    expect(body.minimumGames).toBe(5);
    expect(body.entries).toHaveLength(3);
    expect(
      body.entries.map((entry) => ({
        rank: entry.rank,
        name: entry.player.displayName,
        games: entry.games,
        wins: entry.wins,
        losses: entry.losses,
        draws: entry.draws,
        winRate: entry.winRate,
      })),
    ).toEqual([
      {
        rank: 1,
        name: 'Linus Torvalds',
        games: 5,
        wins: 5,
        losses: 0,
        draws: 0,
        winRate: 1,
      },
      {
        rank: 2,
        name: 'Ada Lovelace',
        games: 6,
        wins: 4,
        losses: 0,
        draws: 2,
        winRate: 4 / 6,
      },
      {
        rank: 3,
        name: 'Grace Hopper',
        games: 5,
        wins: 3,
        losses: 2,
        draws: 0,
        winRate: 0.6,
      },
    ]);
    expect(body.entries[0]?.player.id).toBe(linus.player.id);

    const limited = await app.inject({
      method: 'GET',
      url: '/api/leaderboard?limit=2',
      headers: { cookie: linus.cookie },
    });
    const limitedBody = leaderboardResponseSchema.parse(limited.json());

    expect(limitedBody.entries.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(limitedBody.entries).toHaveLength(2);

    const invalidLimit = await app.inject({
      method: 'GET',
      url: '/api/leaderboard?limit=101',
      headers: { cookie: linus.cookie },
    });

    expect(invalidLimit.statusCode).toBe(400);
    expect(apiErrorSchema.parse(invalidLimit.json()).error.code).toBe('INVALID_REQUEST');

    const unauthorized = await app.inject({ method: 'GET', url: '/api/leaderboard' });

    expect(unauthorized.statusCode).toBe(401);
  });
});
