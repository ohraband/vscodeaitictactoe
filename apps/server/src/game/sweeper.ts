import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AnalyticsPublisher } from '../analytics/publisher.js';
import type { Metrics } from '../metrics.js';
import { SWEEP_BATCH_SIZE, SWEEP_INTERVAL_MS, WAITING_ROOM_TTL_SECONDS } from './constants.js';

interface FinishedGameRow {
  readonly id: string;
  readonly mode: 'SINGLE' | 'MULTI';
  readonly winner: 'X' | 'O' | 'DRAW' | null;
  readonly finishedAt: Date;
}

export interface SweepResult {
  readonly timedOut: number;
  readonly abandoned: number;
}

export interface GameSweeperOptions {
  readonly prisma: PrismaClient;
  readonly now?: () => Date;
  readonly intervalMs?: number;
  readonly waitingRoomTtlSeconds?: number;
  readonly onGameUpdated?: (
    gameId: string,
    reason: 'timeout' | 'abandoned',
  ) => void | Promise<void>;
  readonly metrics?: Metrics;
  readonly analytics?: AnalyticsPublisher;
}

export class GameSweeper {
  private readonly prisma: PrismaClient;
  private readonly now: () => Date;
  private readonly intervalMs: number;
  private readonly waitingRoomTtlSeconds: number;
  private readonly onGameUpdated:
    ((gameId: string, reason: 'timeout' | 'abandoned') => void | Promise<void>) | undefined;
  private timer: NodeJS.Timeout | undefined;
  private logger: FastifyBaseLogger | undefined;
  private readonly metrics: Metrics | undefined;
  private readonly analytics: AnalyticsPublisher | undefined;

  constructor(options: GameSweeperOptions) {
    this.prisma = options.prisma;
    this.now = options.now ?? (() => new Date());
    this.intervalMs = options.intervalMs ?? SWEEP_INTERVAL_MS;
    this.waitingRoomTtlSeconds = options.waitingRoomTtlSeconds ?? WAITING_ROOM_TTL_SECONDS;
    this.onGameUpdated = options.onGameUpdated;
    this.metrics = options.metrics;
    this.analytics = options.analytics;
  }

  start(logger?: FastifyBaseLogger): void {
    if (this.timer) return;

    this.logger = logger;
    this.timer = setInterval(() => {
      void this.run();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = undefined;
  }

  async sweep(reference: Date = this.now()): Promise<SweepResult> {
    const waitingCutoff = new Date(reference.getTime() - this.waitingRoomTtlSeconds * 1000);

    const timedOut = await this.prisma.$queryRaw<FinishedGameRow[]>`
      WITH expired AS (
        SELECT id, turn
        FROM "Game"
        WHERE status = 'ACTIVE'
          AND mode = 'MULTI'
          AND "turnDeadline" IS NOT NULL
          AND "turnDeadline" <= ${reference}
        ORDER BY "turnDeadline" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${SWEEP_BATCH_SIZE}
      )
      UPDATE "Game" AS game
      SET status = 'FINISHED',
          winner = (CASE WHEN expired.turn = 'X' THEN 'O' ELSE 'X' END)::"Winner",
          "finishReason" = 'TIMEOUT',
          "finishedAt" = ${reference},
          "turnDeadline" = NULL,
          "updatedAt" = ${reference},
          version = game.version + 1
      FROM expired
      WHERE game.id = expired.id
      RETURNING game.id, game.mode, game.winner, game."finishedAt"
    `;

    const abandoned = await this.prisma.$queryRaw<FinishedGameRow[]>`
      WITH expired AS (
        SELECT id
        FROM "Game"
        WHERE status = 'WAITING'
          AND "createdAt" <= ${waitingCutoff}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${SWEEP_BATCH_SIZE}
      )
      UPDATE "Game" AS game
      SET status = 'ABANDONED',
          "finishReason" = 'ABANDONED',
          "finishedAt" = ${reference},
          "turnDeadline" = NULL,
          "updatedAt" = ${reference},
          version = game.version + 1
      FROM expired
      WHERE game.id = expired.id
      RETURNING game.id, game.mode, game.winner, game."finishedAt"
    `;

    await this.notifyUpdates(timedOut, 'timeout');
    await this.notifyUpdates(abandoned, 'abandoned');

    this.metrics?.gamesFinished.inc({ mode: 'multi', reason: 'timeout' }, timedOut.length);
    this.metrics?.gamesFinished.inc({ mode: 'multi', reason: 'abandoned' }, abandoned.length);

    for (const game of [...timedOut, ...abandoned]) {
      this.analytics?.publishGameCompleted({
        gameId: game.id,
        mode: game.mode === 'SINGLE' ? 'single' : 'multi',
        winner: game.winner === null ? null : game.winner === 'DRAW' ? 'draw' : game.winner,
        finishedAt: game.finishedAt.toISOString(),
      });
    }

    return { timedOut: timedOut.length, abandoned: abandoned.length };
  }

  private async notifyUpdates(
    games: readonly { readonly id: string }[],
    reason: 'timeout' | 'abandoned',
  ): Promise<void> {
    if (!this.onGameUpdated) return;

    for (const game of games) {
      try {
        await this.onGameUpdated(game.id, reason);
      } catch (error) {
        this.logger?.error(
          { err: error, gameId: game.id, reason },
          'game update notification failed',
        );
      }
    }
  }

  private async run(): Promise<void> {
    try {
      const result = await this.sweep();

      if (result.timedOut > 0 || result.abandoned > 0) {
        this.logger?.info(result, 'expired games swept');
      }
    } catch (error) {
      this.logger?.error({ err: error }, 'game sweeper failed');
    }
  }
}
