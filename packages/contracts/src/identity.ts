import { z } from 'zod';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  ROOM_CODE_PATTERN,
} from './constants.js';

export function normalizeDisplayName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

const normalizedDisplayNamePattern = /^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u;

export const displayNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN_LENGTH)
      .max(DISPLAY_NAME_MAX_LENGTH)
      .regex(
        normalizedDisplayNamePattern,
        'Use letters, numbers, spaces, underscores, or hyphens.',
      ),
  );

export const roomCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().regex(ROOM_CODE_PATTERN, 'Room codes are 6 characters without I, O, 0, or 1.'));
