import { describe, expect, it } from 'vitest';
import {
  CursorSequenceTracker,
  InvalidCursorEventError,
  parseCursorMessage,
} from '../src/cursor/ingest.js';

const streamA = '44444444-4444-4444-8444-444444444444';
const streamB = '55555555-5555-4555-8555-555555555555';
const streamC = '66666666-6666-4666-8666-666666666666';

describe('cursor ingest', () => {
  it('parses valid cursor events', () => {
    const parsed = parseCursorMessage(
      JSON.stringify({
        gameId: '33333333-3333-4333-8333-333333333333',
        playerId: '11111111-1111-4111-8111-111111111111',
        streamId: streamA,
        x: 0.25,
        y: 0.75,
        seq: 4,
        sentAt: '2026-10-24T10:00:00.000Z',
      }),
    );

    expect(parsed).toMatchObject({ streamId: streamA, x: 0.25, y: 0.75, seq: 4 });
  });

  it('rejects malformed JSON and invalid payloads', () => {
    expect(() => parseCursorMessage('not json')).toThrow(InvalidCursorEventError);
    expect(() => parseCursorMessage(JSON.stringify({ gameId: 'nope' }))).toThrow(
      InvalidCursorEventError,
    );
  });

  it('tracks sequence numbers per stream and rejects duplicates or stale events', () => {
    const tracker = new CursorSequenceTracker();

    expect(tracker.isNew({ streamId: streamA, seq: 1 })).toBe(true);
    expect(tracker.isNew({ streamId: streamA, seq: 2 })).toBe(true);
    expect(tracker.isNew({ streamId: streamA, seq: 2 })).toBe(false);
    expect(tracker.isNew({ streamId: streamA, seq: 1 })).toBe(false);
    expect(tracker.isNew({ streamId: streamB, seq: 1 })).toBe(true);
    expect(tracker.isNew({ streamId: streamA, seq: 3 })).toBe(true);
  });

  it('evicts the oldest stream when the tracker reaches its limit', () => {
    const tracker = new CursorSequenceTracker(2);

    expect(tracker.isNew({ streamId: streamA, seq: 1 })).toBe(true);
    expect(tracker.isNew({ streamId: streamB, seq: 1 })).toBe(true);
    expect(tracker.trackedStreams).toBe(2);

    expect(tracker.isNew({ streamId: streamC, seq: 1 })).toBe(true);
    expect(tracker.trackedStreams).toBe(2);

    expect(tracker.isNew({ streamId: streamA, seq: 1 })).toBe(true);
    expect(tracker.isNew({ streamId: streamC, seq: 1 })).toBe(false);
  });
});
