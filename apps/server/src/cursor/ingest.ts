import { cursorMoveEventSchema, type CursorMoveEvent } from '@ttt/contracts';

export const MAX_TRACKED_STREAMS = 5_000;

export class InvalidCursorEventError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidCursorEventError';
  }
}

export function parseCursorMessage(value: string | Buffer | Uint8Array): CursorMoveEvent {
  let payload: unknown;

  try {
    payload = JSON.parse(value.toString());
  } catch (error) {
    throw new InvalidCursorEventError('Cursor event is not valid JSON.', { cause: error });
  }

  const parsed = cursorMoveEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new InvalidCursorEventError('Cursor event failed schema validation.', {
      cause: parsed.error,
    });
  }

  return parsed.data;
}

export class CursorSequenceTracker {
  private readonly lastSeqByStream = new Map<string, number>();

  constructor(private readonly maxStreams: number = MAX_TRACKED_STREAMS) {}

  get trackedStreams(): number {
    return this.lastSeqByStream.size;
  }

  isNew(event: Pick<CursorMoveEvent, 'seq' | 'streamId'>): boolean {
    const previous = this.lastSeqByStream.get(event.streamId);

    if (previous !== undefined && event.seq <= previous) {
      return false;
    }

    this.lastSeqByStream.delete(event.streamId);
    this.lastSeqByStream.set(event.streamId, event.seq);

    while (this.lastSeqByStream.size > this.maxStreams) {
      const oldest = this.lastSeqByStream.keys().next().value;

      if (oldest === undefined) break;

      this.lastSeqByStream.delete(oldest);
    }

    return true;
  }
}
