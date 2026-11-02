import { randomUUID } from 'node:crypto';
import type { AnalyticsGameCompleted } from '@ttt/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ingestGameCompleted,
  InvalidAnalyticsEventError,
  parseGameCompletedMessage,
} from '../src/analytics/ingest.js';
import { noopAnalyticsPublisher, type AnalyticsPublisher } from '../src/analytics/publisher.js';
import {
  createRoom,
  createTestContext,
  createTestSession,
  describeWithDatabase,
  resetDatabase,
  type TestContext,
} from './support/database.js';

function completedEvent(gameId = randomUUID()): AnalyticsGameCompleted {
  return {
    gameId,
    mode: 'multi',
    winner: 'draw',
    finishedAt: '2026-10-24T10:05:00.000Z',
  };
}

describe('analytics publisher', () => {
  it('is a no-op when Kafka is disabled', async () => {
    expect(() => noopAnalyticsPublisher.publishGameCompleted(completedEvent())).not.toThrow();
    await expect(noopAnalyticsPublisher.close()).resolves.toBeUndefined();
  });
});

describe('analytics event parsing', () => {
  it('rejects invalid JSON and invalid payloads', () => {
    expect(() => parseGameCompletedMessage('not json')).toThrow(InvalidAnalyticsEventError);
    expect(() => parseGameCompletedMessage(JSON.stringify({ gameId: 'nope' }))).toThrow(
      InvalidAnalyticsEventError,
    );
  });
});

describeWithDatabase('analytics ingestion', () => {
  let context: TestContext;
  const published: AnalyticsGameCompleted[] = [];
  const publisher: AnalyticsPublisher = {
    publishGameCompleted: (event) => published.push(event),
    close: async () => undefined,
  };

  beforeAll(async () => {
    context = await createTestContext({ analyticsPublisher: publisher });
  });

  beforeEach(async () => {
    published.length = 0;
    await resetDatabase(context.prisma);
  });

  afterAll(async () => {
    await context.app.close();
    await context.prisma.$disconnect();
  });

  it('inserts a completed game once when the same event is delivered twice', async () => {
    const event = completedEvent();
    const message = JSON.stringify(event);

    await expect(ingestGameCompleted(context.prisma, message)).resolves.toBe(true);
    await expect(ingestGameCompleted(context.prisma, message)).resolves.toBe(false);

    const rows = await context.prisma.analyticsGameCompleted.findMany({
      where: { gameId: event.gameId },
    });

    expect(rows).toEqual([
      {
        gameId: event.gameId,
        mode: 'MULTI',
        winner: 'DRAW',
        finishedAt: new Date(event.finishedAt),
      },
    ]);
  });

  it('discards invalid messages without inserting anything', async () => {
    await expect(ingestGameCompleted(context.prisma, '{"gameId":"nope"}')).rejects.toThrow(
      InvalidAnalyticsEventError,
    );
    await expect(context.prisma.analyticsGameCompleted.count()).resolves.toBe(0);
  });

  it('publishes a completion event after the game transaction commits', async () => {
    const session = await createTestSession(context.app, 'Analytics Player');
    const room = await createRoom(context.app, session.cookie);

    const response = await context.app.inject({
      method: 'POST',
      url: `/api/games/${room.id}/leave`,
      headers: { cookie: session.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      gameId: room.id,
      mode: 'multi',
      winner: null,
    });
    expect(published[0]?.finishedAt).toEqual(expect.any(String));
  });
});
