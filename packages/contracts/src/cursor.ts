import { z } from 'zod';
import { gameIdSchema } from './game.js';
import { isoDateTimeSchema } from './primitives.js';

export const cursorCoordinateSchema = z.number().finite().min(0).max(1);

export const cursorSubscribeRequestSchema = z.object({
  gameId: gameIdSchema,
});

export const cursorMoveRequestSchema = z.object({
  gameId: gameIdSchema,
  streamId: z.uuid(),
  x: cursorCoordinateSchema,
  y: cursorCoordinateSchema,
  seq: z.number().int().nonnegative(),
  sentAt: isoDateTimeSchema,
});

export const cursorMoveEventSchema = cursorMoveRequestSchema.extend({
  playerId: z.uuid(),
});

export const cursorDotSchema = cursorMoveEventSchema.extend({
  emittedAt: isoDateTimeSchema,
});

export const cursorLeaveSchema = z.object({
  gameId: gameIdSchema,
  playerId: z.uuid(),
});

export const appConfigResponseSchema = z.object({
  cursor: z.object({
    enabled: z.boolean(),
    path: z.string().min(1),
  }),
});

export type CursorSubscribeRequest = z.infer<typeof cursorSubscribeRequestSchema>;
export type CursorMoveRequest = z.infer<typeof cursorMoveRequestSchema>;
export type CursorMoveEvent = z.infer<typeof cursorMoveEventSchema>;
export type CursorDot = z.infer<typeof cursorDotSchema>;
export type CursorLeave = z.infer<typeof cursorLeaveSchema>;
export type AppConfigResponse = z.infer<typeof appConfigResponseSchema>;
