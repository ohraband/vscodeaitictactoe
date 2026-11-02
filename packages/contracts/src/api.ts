import { z } from 'zod';
import {
  ERROR_CODES,
  GAMES_PAGE_SIZE_DEFAULT,
  GAMES_PAGE_SIZE_MAX,
  LEADERBOARD_LIMIT_DEFAULT,
  LEADERBOARD_LIMIT_MAX,
  LEADERBOARD_MIN_GAMES,
} from './constants.js';
import { playerSchema } from './player.js';
import { gameModeSchema, gameStatusSchema } from './primitives.js';
import { gameSnapshotSchema, moveSchema } from './game.js';

export const apiErrorCodeSchema = z.enum(ERROR_CODES);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

export const ackErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
});

export const gameListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(GAMES_PAGE_SIZE_MAX)
    .default(GAMES_PAGE_SIZE_DEFAULT),
  mode: gameModeSchema.optional(),
  status: gameStatusSchema.optional(),
});

export const gameListResponseSchema = z.object({
  games: z.array(gameSnapshotSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const gameDetailResponseSchema = z.object({
  game: gameSnapshotSchema,
  moves: z.array(moveSchema),
});

export const leaderboardQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LEADERBOARD_LIMIT_MAX)
    .default(LEADERBOARD_LIMIT_DEFAULT),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  player: playerSchema,
  games: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
});

export const leaderboardResponseSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
  minimumGames: z.number().int().positive(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type AckError = z.infer<typeof ackErrorSchema>;
export type GameListQuery = z.infer<typeof gameListQuerySchema>;
export type GameListResponse = z.infer<typeof gameListResponseSchema>;
export type GameDetailResponse = z.infer<typeof gameDetailResponseSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

export const DEFAULT_LEADERBOARD_MINIMUM_GAMES = LEADERBOARD_MIN_GAMES;
