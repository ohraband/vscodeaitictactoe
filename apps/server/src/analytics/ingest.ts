import type { PrismaClient } from '@prisma/client';
import { analyticsGameCompletedSchema, type AnalyticsGameCompleted } from '@ttt/contracts';

export class InvalidAnalyticsEventError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidAnalyticsEventError';
  }
}

export function parseGameCompletedMessage(
  value: string | Buffer | Uint8Array,
): AnalyticsGameCompleted {
  let payload: unknown;

  try {
    payload = JSON.parse(value.toString());
  } catch (error) {
    throw new InvalidAnalyticsEventError('Analytics event is not valid JSON.', { cause: error });
  }

  const parsed = analyticsGameCompletedSchema.safeParse(payload);

  if (!parsed.success) {
    throw new InvalidAnalyticsEventError('Analytics event failed schema validation.', {
      cause: parsed.error,
    });
  }

  return parsed.data;
}

export async function ingestGameCompleted(
  prisma: PrismaClient,
  value: string | Buffer | Uint8Array,
): Promise<boolean> {
  const event = parseGameCompletedMessage(value);
  const result = await prisma.analyticsGameCompleted.createMany({
    data: [
      {
        gameId: event.gameId,
        mode: event.mode === 'single' ? 'SINGLE' : 'MULTI',
        winner: event.winner === null ? null : event.winner === 'draw' ? 'DRAW' : event.winner,
        finishedAt: new Date(event.finishedAt),
      },
    ],
    skipDuplicates: true,
  });

  return result.count > 0;
}
