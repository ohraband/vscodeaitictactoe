import { z } from 'zod';
import { roomCodeSchema } from './identity.js';
import { playerSchema } from './player.js';
import {
  boardSchema,
  cellIndexSchema,
  difficultySchema,
  finishReasonSchema,
  gameModeSchema,
  gameStatusSchema,
  isoDateTimeSchema,
  symbolSchema,
  visibilitySchema,
  winnerSchema,
} from './primitives.js';

export const createSinglePlayerGameSchema = z.object({
  mode: z.literal('single'),
  difficulty: difficultySchema,
});

export const createMultiplayerGameSchema = z.object({
  mode: z.literal('multi'),
  visibility: visibilitySchema.default('private'),
});

export const createGameRequestSchema = z.discriminatedUnion('mode', [
  createSinglePlayerGameSchema,
  createMultiplayerGameSchema,
]);

export const joinGameRequestSchema = z.object({
  code: roomCodeSchema,
});

export const gameIdSchema = z.uuid();

export const subscribeGameRequestSchema = z.object({
  gameId: gameIdSchema,
});

export const leaveGameRequestSchema = z.object({
  gameId: gameIdSchema,
});

export const rematchRequestSchema = z.object({
  gameId: gameIdSchema,
});

export const moveBodySchema = z.object({
  cell: cellIndexSchema,
  expectedVersion: z.number().int().nonnegative(),
});

export const moveRequestSchema = moveBodySchema.extend({
  gameId: gameIdSchema,
});

export const winningLineSchema = z.array(cellIndexSchema).length(3);

export const gameSnapshotSchema = z.object({
  id: gameIdSchema,
  code: roomCodeSchema,
  mode: gameModeSchema,
  visibility: visibilitySchema,
  status: gameStatusSchema,
  difficulty: difficultySchema.nullable(),
  board: boardSchema,
  turn: symbolSchema,
  winner: winnerSchema.nullable(),
  finishReason: finishReasonSchema.nullable(),
  winningLine: winningLineSchema.nullable(),
  playerX: playerSchema,
  playerO: playerSchema.nullable(),
  version: z.number().int().nonnegative(),
  turnDeadline: isoDateTimeSchema.nullable(),
  rematchRequestedByX: z.boolean(),
  rematchRequestedByO: z.boolean(),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
});

export const moveSchema = z.object({
  moveNumber: z.number().int().positive(),
  cell: cellIndexSchema,
  symbol: symbolSchema,
  playerId: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
});

export const gameDetailSchema = gameSnapshotSchema.extend({
  moves: z.array(moveSchema),
});

export const gameResponseSchema = z.object({
  game: gameSnapshotSchema,
});

export const gameUpdateSchema = z.object({
  game: gameSnapshotSchema,
});

export const gamePresenceSchema = z.object({
  gameId: gameIdSchema,
  playerId: z.uuid(),
  online: z.boolean(),
});

export const rematchStartedSchema = z.object({
  gameId: gameIdSchema,
  code: roomCodeSchema,
});

export type CreateSinglePlayerGameRequest = z.infer<typeof createSinglePlayerGameSchema>;
export type CreateMultiplayerGameRequest = z.infer<typeof createMultiplayerGameSchema>;
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;
export type JoinGameRequest = z.infer<typeof joinGameRequestSchema>;
export type SubscribeGameRequest = z.infer<typeof subscribeGameRequestSchema>;
export type LeaveGameRequest = z.infer<typeof leaveGameRequestSchema>;
export type RematchRequest = z.infer<typeof rematchRequestSchema>;
export type MoveBody = z.infer<typeof moveBodySchema>;
export type MoveRequest = z.infer<typeof moveRequestSchema>;
export type GameResponse = z.infer<typeof gameResponseSchema>;
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;
export type GameDetail = z.infer<typeof gameDetailSchema>;
export type GameMove = z.infer<typeof moveSchema>;
export type GameUpdate = z.infer<typeof gameUpdateSchema>;
export type GamePresence = z.infer<typeof gamePresenceSchema>;
export type RematchStarted = z.infer<typeof rematchStartedSchema>;
