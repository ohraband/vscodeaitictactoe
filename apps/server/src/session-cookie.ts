import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Player, PrismaClient } from '@prisma/client';
import type { ServerConfig } from './config.js';
import { HttpError } from './errors.js';
import { createSessionToken, SESSION_COOKIE_NAME, verifySessionToken } from './session-token.js';

const sessionCookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
} as const;

export function setSessionCookie(
  reply: FastifyReply,
  playerId: string,
  config: ServerConfig,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, createSessionToken(playerId, config.sessionSecret), {
    ...sessionCookieOptions,
    secure: config.sessionCookieSecure,
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: ServerConfig): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    ...sessionCookieOptions,
    secure: config.sessionCookieSecure,
  });
}

export async function requirePlayer(
  request: FastifyRequest,
  reply: FastifyReply,
  prisma: PrismaClient,
  config: ServerConfig,
): Promise<Player> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const playerId = token ? verifySessionToken(token, config.sessionSecret) : null;

  if (!playerId) {
    clearSessionCookie(reply, config);
    throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });

  if (!player) {
    clearSessionCookie(reply, config);
    throw new HttpError(401, 'UNAUTHORIZED', 'Your guest session is no longer valid.');
  }

  return player;
}
