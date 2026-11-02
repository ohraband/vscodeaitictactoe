import type { Prisma, PrismaClient } from '@prisma/client';
import {
  boardFromCode,
  boardToCode,
  chooseAiMove,
  countSymbols,
  getNextSymbol,
  getOutcome,
  playMove,
  GameRuleError,
  type Board,
  type Difficulty as EngineDifficulty,
  type PlayerSymbol,
} from '@ttt/game-engine';
import {
  LEADERBOARD_MIN_GAMES,
  type Difficulty,
  type GameDetailResponse,
  type GameListQuery,
  type GameListResponse,
  type GameSnapshot,
  type LeaderboardQuery,
  type LeaderboardResponse,
  type Visibility,
} from '@ttt/contracts';
import type { AnalyticsPublisher } from '../analytics/publisher.js';
import type { ServerConfig } from '../config.js';
import { HttpError } from '../errors.js';
import type { Metrics } from '../metrics.js';
import { EMPTY_BOARD_CODE, ROOM_CODE_ATTEMPTS, WAITING_ROOM_TTL_SECONDS } from './constants.js';
import { rematchGameId } from './rematch-id.js';
import { generateRoomCode } from './room-code.js';
import {
  toGameMove,
  toGameSnapshot,
  type GameWithPlayers,
  type GameWithPlayersAndMoves,
} from './snapshot.js';

export type CreateGameInput =
  | { readonly playerId: string; readonly mode: 'single'; readonly difficulty: Difficulty }
  | { readonly playerId: string; readonly mode: 'multi'; readonly visibility: Visibility };

export interface GameServiceOptions {
  readonly prisma: PrismaClient;
  readonly config: Pick<ServerConfig, 'turnSeconds'>;
  readonly now?: () => Date;
  readonly aiRandom?: () => number;
  readonly metrics?: Metrics;
  readonly analytics?: AnalyticsPublisher;
}

interface PendingMove {
  readonly cell: number;
  readonly symbol: PlayerSymbol;
  readonly playerId: string | null;
}

interface LeaderboardRow {
  readonly id: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
}

type GameCreateData = Omit<Prisma.GameUncheckedCreateInput, 'code'>;

const modeByQuery = {
  single: 'SINGLE',
  multi: 'MULTI',
} as const;

const statusByQuery = {
  waiting: 'WAITING',
  active: 'ACTIVE',
  finished: 'FINISHED',
  abandoned: 'ABANDONED',
} as const;

function isParticipant(
  game: { readonly playerXId: string; readonly playerOId: string | null },
  playerId: string,
): boolean {
  return game.playerXId === playerId || game.playerOId === playerId;
}

function playerSymbol(
  game: { readonly playerXId: string; readonly playerOId: string | null },
  playerId: string,
): PlayerSymbol | null {
  if (game.playerXId === playerId) return 'X';
  if (game.playerOId === playerId) return 'O';
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

export class GameService {
  private readonly prisma: PrismaClient;
  private readonly turnSeconds: number;
  private readonly clock: () => Date;
  private readonly aiRandom: (() => number) | undefined;
  private readonly metrics: Metrics | undefined;
  private readonly analytics: AnalyticsPublisher | undefined;

  constructor(options: GameServiceOptions) {
    this.prisma = options.prisma;
    this.turnSeconds = options.config.turnSeconds;
    this.clock = options.now ?? (() => new Date());
    this.aiRandom = options.aiRandom;
    this.metrics = options.metrics;
    this.analytics = options.analytics;
  }

  async createGame(input: CreateGameInput): Promise<GameSnapshot> {
    const now = this.clock();

    if (input.mode === 'single') {
      const game = await this.createGameWithCode(() => ({
        mode: 'SINGLE',
        visibility: 'PRIVATE',
        status: 'ACTIVE',
        difficulty: input.difficulty.toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD',
        board: EMPTY_BOARD_CODE,
        turn: 'X',
        playerXId: input.playerId,
        startedAt: now,
      }));

      this.metrics?.gamesStarted.inc({ mode: 'single' });

      return toGameSnapshot(game);
    }

    const game = await this.createGameWithCode(() => ({
      mode: 'MULTI',
      visibility: input.visibility === 'public' ? 'PUBLIC' : 'PRIVATE',
      status: 'WAITING',
      board: EMPTY_BOARD_CODE,
      turn: 'X',
      playerXId: input.playerId,
    }));

    return toGameSnapshot(game);
  }

  async joinGame(playerId: string, code: string): Promise<GameSnapshot> {
    const now = this.clock();
    const game = await this.prisma.game.findUnique({
      where: { code },
      include: { playerX: true, playerO: true },
    });

    if (!game || game.mode !== 'MULTI') {
      throw new HttpError(404, 'GAME_NOT_FOUND', 'That room code does not match a game.');
    }

    if (game.playerXId === playerId) {
      throw new HttpError(409, 'CONFLICT', 'You cannot join your own game.');
    }

    if (game.status !== 'WAITING' || game.playerOId !== null) {
      throw new HttpError(409, 'CONFLICT', 'This game is no longer open to join.');
    }

    const joined = await this.prisma.game.updateMany({
      where: {
        id: game.id,
        mode: 'MULTI',
        status: 'WAITING',
        playerOId: null,
      },
      data: {
        playerOId: playerId,
        status: 'ACTIVE',
        startedAt: now,
        turnDeadline: this.deadline(now),
        version: { increment: 1 },
      },
    });

    if (joined.count === 0) {
      throw new HttpError(409, 'CONFLICT', 'This game is no longer open to join.');
    }

    const updated = await this.prisma.game.findUniqueOrThrow({
      where: { id: game.id },
      include: { playerX: true, playerO: true },
    });

    this.metrics?.gamesStarted.inc({ mode: 'multi' });

    return toGameSnapshot(updated);
  }

  async quickMatch(playerId: string): Promise<GameSnapshot> {
    const now = this.clock();
    const cutoff = new Date(now.getTime() - WAITING_ROOM_TTL_SECONDS * 1000);

    const ownWaitingGame = await this.prisma.game.findFirst({
      where: {
        playerXId: playerId,
        mode: 'MULTI',
        visibility: 'PUBLIC',
        status: 'WAITING',
        playerOId: null,
        createdAt: { gte: cutoff },
      },
      include: { playerX: true, playerO: true },
      orderBy: { createdAt: 'asc' },
    });

    if (ownWaitingGame) {
      return toGameSnapshot(ownWaitingGame);
    }

    const deadline = this.deadline(now);
    const candidates = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH candidate AS (
        SELECT id
        FROM "Game"
        WHERE mode = 'MULTI'
          AND visibility = 'PUBLIC'
          AND status = 'WAITING'
          AND "playerOId" IS NULL
          AND "playerXId" <> ${playerId}::uuid
          AND "createdAt" >= ${cutoff}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "Game" AS game
      SET "playerOId" = ${playerId}::uuid,
          status = 'ACTIVE',
          "startedAt" = ${now},
          "turnDeadline" = ${deadline},
          version = game.version + 1,
          "updatedAt" = ${now}
      FROM candidate
      WHERE game.id = candidate.id
      RETURNING game.id
    `;

    const candidate = candidates[0];

    if (candidate) {
      const game = await this.prisma.game.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { playerX: true, playerO: true },
      });

      this.metrics?.gamesStarted.inc({ mode: 'multi' });

      return toGameSnapshot(game);
    }

    const created = await this.createGameWithCode(() => ({
      mode: 'MULTI',
      visibility: 'PUBLIC',
      status: 'WAITING',
      board: EMPTY_BOARD_CODE,
      turn: 'X',
      playerXId: playerId,
    }));

    return toGameSnapshot(created);
  }

  async playMove(input: {
    readonly gameId: string;
    readonly playerId: string;
    readonly cell: number;
    readonly expectedVersion: number;
  }): Promise<GameSnapshot> {
    const now = this.clock();

    const result = await this.prisma.$transaction(async (tx) => {
      const game = await this.lockGame(tx, input.gameId);

      if (!isParticipant(game, input.playerId)) {
        throw new HttpError(403, 'NOT_PARTICIPANT', 'You are not part of this game.');
      }

      if (game.status === 'WAITING') {
        throw new HttpError(409, 'CONFLICT', 'This game is still waiting for an opponent.');
      }

      if (game.status !== 'ACTIVE') {
        throw new HttpError(409, 'GAME_FINISHED', 'This game has already finished.');
      }

      if (
        game.mode === 'MULTI' &&
        game.turnDeadline !== null &&
        game.turnDeadline.getTime() <= now.getTime()
      ) {
        const expiredGame = await this.finishExpiredTurn(tx, game, now);
        return { expired: true as const, game: expiredGame };
      }

      if (input.expectedVersion !== game.version) {
        this.metrics?.staleConflicts.inc();
        throw new HttpError(409, 'STALE_STATE', 'The game state moved on. Refresh and try again.');
      }

      const symbol = playerSymbol(game, input.playerId);

      if (symbol === null) {
        throw new HttpError(403, 'NOT_PARTICIPANT', 'You are not part of this game.');
      }

      if (game.mode === 'MULTI' && game.turn !== symbol) {
        throw new HttpError(409, 'NOT_YOUR_TURN', 'Wait for your turn.');
      }

      const board = boardFromCode(game.board);

      if ((board[input.cell] ?? null) !== null) {
        throw new HttpError(409, 'CELL_TAKEN', 'That cell is already taken.');
      }

      const pendingMoves: PendingMove[] = [
        { cell: input.cell, symbol: game.turn, playerId: input.playerId },
      ];
      let nextBoard: Board;
      let version = game.version + 1;

      try {
        nextBoard = playMove(board, input.cell, game.turn);
      } catch (error) {
        if (error instanceof GameRuleError && error.code === 'CELL_OCCUPIED') {
          throw new HttpError(409, 'CELL_TAKEN', 'That cell is already taken.');
        }

        throw error;
      }

      let outcome = getOutcome(nextBoard);

      if (game.mode === 'SINGLE' && outcome.kind === 'in_progress') {
        if (game.difficulty === null) {
          throw new Error('A single-player game is missing its difficulty.');
        }

        const difficulty = game.difficulty.toLowerCase() as EngineDifficulty;
        const aiStartedAt = process.hrtime.bigint();
        const aiMove = this.aiRandom
          ? chooseAiMove(nextBoard, difficulty, { random: this.aiRandom })
          : chooseAiMove(nextBoard, difficulty);

        this.metrics?.aiDuration.observe(
          { difficulty },
          Number(process.hrtime.bigint() - aiStartedAt) / 1e9,
        );

        if (aiMove === null) {
          throw new Error('The AI did not produce a move for an active game.');
        }

        const aiSymbol = getNextSymbol(nextBoard);

        nextBoard = playMove(nextBoard, aiMove, aiSymbol);
        outcome = getOutcome(nextBoard);
        version += 1;
        pendingMoves.push({ cell: aiMove, symbol: aiSymbol, playerId: null });
      }

      const finished = outcome.kind !== 'in_progress';
      const winner =
        outcome.kind === 'win' ? outcome.winner : outcome.kind === 'draw' ? 'DRAW' : null;
      const finishReason =
        outcome.kind === 'win' ? 'LINE' : outcome.kind === 'draw' ? 'DRAW' : null;
      const winningLine = outcome.kind === 'win' ? [...outcome.line] : [];

      const updated = await tx.game.update({
        where: { id: game.id },
        data: {
          board: boardToCode(nextBoard),
          turn: getNextSymbol(nextBoard),
          status: finished ? 'FINISHED' : 'ACTIVE',
          winner,
          finishReason,
          winningLine,
          version,
          turnDeadline: !finished && game.mode === 'MULTI' ? this.deadline(now) : null,
          finishedAt: finished ? now : null,
        },
        include: { playerX: true, playerO: true },
      });

      const firstMoveNumber = countSymbols(board).X + countSymbols(board).O + 1;

      await tx.move.createMany({
        data: pendingMoves.map((move, index) => ({
          gameId: game.id,
          playerId: move.playerId,
          moveNumber: firstMoveNumber + index,
          cell: move.cell,
          symbol: move.symbol,
          createdAt: now,
        })),
      });

      return { expired: false as const, game: updated, moves: pendingMoves.length };
    });

    if (result.expired) {
      this.recordFinished(toGameSnapshot(result.game));
      throw new HttpError(409, 'GAME_FINISHED', 'The game ended on the turn timer.');
    }

    const snapshot = toGameSnapshot(result.game);

    this.metrics?.moves.inc({ mode: snapshot.mode }, result.moves);
    this.recordFinished(snapshot);

    return snapshot;
  }

  async leaveGame(gameId: string, playerId: string): Promise<GameSnapshot> {
    const now = this.clock();

    const result = await this.prisma.$transaction(async (tx) => {
      const game = await this.lockGame(tx, gameId);

      if (!isParticipant(game, playerId)) {
        throw new HttpError(403, 'NOT_PARTICIPANT', 'You are not part of this game.');
      }

      if (game.status === 'WAITING') {
        const abandoned = await tx.game.update({
          where: { id: game.id },
          data: {
            status: 'ABANDONED',
            finishReason: 'ABANDONED',
            finishedAt: now,
            turnDeadline: null,
            version: { increment: 1 },
          },
          include: { playerX: true, playerO: true },
        });

        return { snapshot: toGameSnapshot(abandoned), finished: true };
      }

      if (game.status !== 'ACTIVE') {
        return { snapshot: toGameSnapshot(game), finished: false };
      }

      if (game.mode === 'MULTI') {
        const symbol = playerSymbol(game, playerId);

        if (symbol === null) {
          throw new HttpError(403, 'NOT_PARTICIPANT', 'You are not part of this game.');
        }

        const forfeited = await tx.game.update({
          where: { id: game.id },
          data: {
            status: 'FINISHED',
            winner: symbol === 'X' ? 'O' : 'X',
            finishReason: 'FORFEIT',
            finishedAt: now,
            turnDeadline: null,
            version: { increment: 1 },
          },
          include: { playerX: true, playerO: true },
        });

        return { snapshot: toGameSnapshot(forfeited), finished: true };
      }

      const abandoned = await tx.game.update({
        where: { id: game.id },
        data: {
          status: 'ABANDONED',
          finishReason: 'ABANDONED',
          finishedAt: now,
          turnDeadline: null,
          version: { increment: 1 },
        },
        include: { playerX: true, playerO: true },
      });

      return { snapshot: toGameSnapshot(abandoned), finished: true };
    });

    if (result.finished) {
      this.recordFinished(result.snapshot);
    }

    return result.snapshot;
  }

  async requestRematch(gameId: string, playerId: string): Promise<GameSnapshot> {
    const newGameId = rematchGameId(gameId);
    const now = this.clock();

    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const game = await this.lockGame(tx, gameId);

          if (!isParticipant(game, playerId)) {
            throw new HttpError(403, 'NOT_PARTICIPANT', 'You are not part of this game.');
          }

          if (game.mode !== 'MULTI') {
            throw new HttpError(
              400,
              'INVALID_REQUEST',
              'Rematches are only available for multiplayer games.',
            );
          }

          if (game.status !== 'FINISHED') {
            throw new HttpError(
              409,
              'CONFLICT',
              'A rematch can only be requested after the game finishes.',
            );
          }

          const existingRematch = await tx.game.findUnique({
            where: { id: newGameId },
            include: { playerX: true, playerO: true },
          });

          if (existingRematch) {
            return toGameSnapshot(existingRematch);
          }

          const requestedByX = game.rematchRequestedByX || game.playerXId === playerId;
          const requestedByO = game.rematchRequestedByO || game.playerOId === playerId;

          if (requestedByX && requestedByO) {
            if (game.playerOId === null) {
              throw new HttpError(409, 'CONFLICT', 'This game does not have two players.');
            }

            const created = await tx.game.create({
              data: {
                id: newGameId,
                code: generateRoomCode(),
                mode: 'MULTI',
                visibility: game.visibility,
                status: 'ACTIVE',
                board: EMPTY_BOARD_CODE,
                turn: 'X',
                playerXId: game.playerOId,
                playerOId: game.playerXId,
                startedAt: now,
                turnDeadline: this.deadline(now),
                version: 0,
              },
              include: { playerX: true, playerO: true },
            });

            await tx.game.update({
              where: { id: game.id },
              data: {
                rematchRequestedByX: true,
                rematchRequestedByO: true,
                version: { increment: 1 },
              },
            });

            this.metrics?.gamesStarted.inc({ mode: 'multi' });

            return toGameSnapshot(created);
          }

          const alreadyRequested =
            game.playerXId === playerId ? game.rematchRequestedByX : game.rematchRequestedByO;

          if (alreadyRequested) {
            return toGameSnapshot(game);
          }

          const requestData =
            game.playerXId === playerId
              ? { rematchRequestedByX: true, version: { increment: 1 } }
              : { rematchRequestedByO: true, version: { increment: 1 } };
          const updated = await tx.game.update({
            where: { id: game.id },
            data: requestData,
            include: { playerX: true, playerO: true },
          });

          return toGameSnapshot(updated);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new HttpError(500, 'INTERNAL_ERROR', 'Could not create a rematch room.');
  }

  async getGame(gameId: string, playerId: string): Promise<GameSnapshot> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { playerX: true, playerO: true },
    });

    if (!game) {
      throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
    }

    if (!isParticipant(game, playerId)) {
      throw new HttpError(403, 'NOT_PARTICIPANT', 'You are not part of this game.');
    }

    return toGameSnapshot(game);
  }

  async getGameSnapshot(gameId: string): Promise<GameSnapshot> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { playerX: true, playerO: true },
    });

    if (!game) {
      throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
    }

    return toGameSnapshot(game);
  }

  async getGameDetail(gameId: string, playerId: string): Promise<GameDetailResponse> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        playerX: true,
        playerO: true,
        moves: { orderBy: { moveNumber: 'asc' } },
      },
    });

    if (!game) {
      throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
    }

    if (!isParticipant(game, playerId)) {
      throw new HttpError(403, 'NOT_PARTICIPANT', 'You are not part of this game.');
    }

    return this.toDetail(game);
  }

  async listGames(playerId: string, query: GameListQuery): Promise<GameListResponse> {
    const where: Prisma.GameWhereInput = {
      OR: [{ playerXId: playerId }, { playerOId: playerId }],
    };

    if (query.mode) {
      where.mode = modeByQuery[query.mode];
    }

    if (query.status) {
      where.status = statusByQuery[query.status];
    }

    const [total, games] = await this.prisma.$transaction([
      this.prisma.game.count({ where }),
      this.prisma.game.findMany({
        where,
        include: { playerX: true, playerO: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      games: games.map(toGameSnapshot),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async leaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    const rows = await this.prisma.$queryRaw<LeaderboardRow[]>`
      SELECT id, "displayName", "createdAt", games, wins, draws
      FROM (
        SELECT
          player.id,
          player."displayName",
          player."createdAt",
          COUNT(*)::int AS games,
          SUM(
            CASE
              WHEN game.winner = 'X' AND game."playerXId" = player.id THEN 1
              WHEN game.winner = 'O' AND game."playerOId" = player.id THEN 1
              ELSE 0
            END
          )::int AS wins,
          SUM(CASE WHEN game.winner = 'DRAW' THEN 1 ELSE 0 END)::int AS draws
        FROM "Game" AS game
        JOIN "Player" AS player
          ON player.id = game."playerXId" OR player.id = game."playerOId"
        WHERE game.mode = 'MULTI' AND game.status = 'FINISHED'
        GROUP BY player.id, player."displayName", player."createdAt"
        HAVING COUNT(*) >= ${LEADERBOARD_MIN_GAMES}
      ) AS ranked
      ORDER BY
        wins DESC,
        (wins::double precision / games) DESC,
        "createdAt" ASC,
        id ASC
      LIMIT ${query.limit}
    `;

    return {
      entries: rows.map((row, index) => {
        const games = Number(row.games);
        const wins = Number(row.wins);
        const draws = Number(row.draws);

        return {
          rank: index + 1,
          player: {
            id: row.id,
            displayName: row.displayName,
            createdAt: row.createdAt.toISOString(),
          },
          games,
          wins,
          losses: games - wins - draws,
          draws,
          winRate: games === 0 ? 0 : wins / games,
        };
      }),
      minimumGames: LEADERBOARD_MIN_GAMES,
    };
  }

  private async createGameWithCode(build: () => GameCreateData): Promise<GameWithPlayers> {
    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.game.create({
          data: {
            ...build(),
            code: generateRoomCode(),
          },
          include: { playerX: true, playerO: true },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new HttpError(500, 'INTERNAL_ERROR', 'Could not allocate a room code.');
  }

  private async lockGame(tx: Prisma.TransactionClient, gameId: string): Promise<GameWithPlayers> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Game" WHERE id = ${gameId}::uuid FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
    }

    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: { playerX: true, playerO: true },
    });

    if (!game) {
      throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
    }

    return game;
  }

  private async finishExpiredTurn(
    tx: Prisma.TransactionClient,
    game: GameWithPlayers,
    now: Date,
  ): Promise<GameWithPlayers> {
    return tx.game.update({
      where: { id: game.id },
      data: {
        status: 'FINISHED',
        winner: game.turn === 'X' ? 'O' : 'X',
        finishReason: 'TIMEOUT',
        finishedAt: now,
        turnDeadline: null,
        version: { increment: 1 },
      },
      include: { playerX: true, playerO: true },
    });
  }

  private recordFinished(snapshot: GameSnapshot): void {
    if (snapshot.finishReason) {
      this.metrics?.gamesFinished.inc({
        mode: snapshot.mode,
        reason: snapshot.finishReason,
      });
    }

    if (
      snapshot.finishedAt !== null &&
      (snapshot.status === 'finished' || snapshot.status === 'abandoned')
    ) {
      this.analytics?.publishGameCompleted({
        gameId: snapshot.id,
        mode: snapshot.mode,
        winner: snapshot.winner,
        finishedAt: snapshot.finishedAt,
      });
    }
  }

  private deadline(now: Date): Date | null {
    return this.turnSeconds > 0 ? new Date(now.getTime() + this.turnSeconds * 1000) : null;
  }

  private toDetail(game: GameWithPlayersAndMoves): GameDetailResponse {
    return {
      game: toGameSnapshot(game),
      moves: game.moves.map(toGameMove),
    };
  }
}

export function createGameService(options: GameServiceOptions): GameService {
  return new GameService(options);
}
