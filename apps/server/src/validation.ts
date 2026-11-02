import type { ZodType } from 'zod';
import { HttpError } from './errors.js';

export function parseInput<Output>(schema: ZodType<Output>, value: unknown): Output {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new HttpError(
      400,
      'INVALID_REQUEST',
      result.error.issues[0]?.message ?? 'Invalid request.',
    );
  }

  return result.data;
}
