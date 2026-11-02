import { z } from 'zod';
import { gameModeSchema, isoDateTimeSchema, winnerSchema } from './primitives.js';

export const analyticsGameCompletedSchema = z.object({
  gameId: z.uuid(),
  mode: gameModeSchema,
  winner: winnerSchema.nullable(),
  finishedAt: isoDateTimeSchema,
});

export type AnalyticsGameCompleted = z.infer<typeof analyticsGameCompletedSchema>;
