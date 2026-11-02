import type { Player, PrismaClient } from '@prisma/client';
import { normalizeDisplayName, type PublicPlayer } from '@ttt/contracts';
import { HttpError } from './errors.js';

function normalizedKey(displayName: string): string {
  return normalizeDisplayName(displayName).toLocaleLowerCase('en-US');
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  );
}

export async function createPlayer(prisma: PrismaClient, displayName: string): Promise<Player> {
  try {
    return await prisma.player.create({
      data: {
        displayName,
        displayNameNormalized: normalizedKey(displayName),
      },
    });
  } catch (error) {
    if (hasPrismaCode(error, 'P2002')) {
      throw new HttpError(409, 'NAME_TAKEN', 'That display name is already taken.');
    }

    throw error;
  }
}

export async function renamePlayer(
  prisma: PrismaClient,
  playerId: string,
  displayName: string,
): Promise<Player> {
  try {
    return await prisma.player.update({
      where: { id: playerId },
      data: {
        displayName,
        displayNameNormalized: normalizedKey(displayName),
        lastSeenAt: new Date(),
      },
    });
  } catch (error) {
    if (hasPrismaCode(error, 'P2002')) {
      throw new HttpError(409, 'NAME_TAKEN', 'That display name is already taken.');
    }

    if (hasPrismaCode(error, 'P2025')) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Your guest session is no longer valid.');
    }

    throw error;
  }
}

export function toPublicPlayer(player: Player): PublicPlayer {
  return {
    id: player.id,
    displayName: player.displayName,
    createdAt: player.createdAt.toISOString(),
  };
}
