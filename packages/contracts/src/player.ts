import { z } from 'zod';
import { displayNameSchema } from './identity.js';
import { isoDateTimeSchema } from './primitives.js';

export const playerSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1),
  createdAt: isoDateTimeSchema,
});

export const sessionRequestSchema = z.object({
  displayName: displayNameSchema,
});

export const sessionResponseSchema = z.object({
  player: playerSchema,
});

export const renameRequestSchema = z.object({
  displayName: displayNameSchema,
});

export type PublicPlayer = z.infer<typeof playerSchema>;
export type SessionRequest = z.infer<typeof sessionRequestSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type RenameRequest = z.infer<typeof renameRequestSchema>;
