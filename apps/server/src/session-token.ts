import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const SESSION_COOKIE_NAME = 'ttt_session';

const playerIdSchema = z.uuid();

function signPlayerId(playerId: string, secret: string): string {
  return createHmac('sha256', secret).update(`session:${playerId}`).digest('base64url');
}

export function createSessionToken(playerId: string, secret: string): string {
  return `${playerId}.${signPlayerId(playerId, secret)}`;
}

export function verifySessionToken(token: string, secret: string): string | null {
  const separator = token.indexOf('.');

  if (separator <= 0 || separator === token.length - 1) {
    return null;
  }

  const playerId = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!playerIdSchema.safeParse(playerId).success || token.indexOf('.', separator + 1) !== -1) {
    return null;
  }

  const expected = Buffer.from(signPlayerId(playerId, secret), 'base64url');
  const received = Buffer.from(signature, 'base64url');

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  return playerId;
}
