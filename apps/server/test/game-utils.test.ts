import { describe, expect, it } from 'vitest';
import { rematchGameId } from '../src/game/rematch-id.js';
import { generateRoomCode } from '../src/game/room-code.js';

describe('room codes', () => {
  it('uses the shared unambiguous alphabet', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAAA');
    expect(generateRoomCode(() => 31)).toBe('999999');

    for (let index = 0; index < 100; index += 1) {
      expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('rejects out-of-range random indexes', () => {
    expect(() => generateRoomCode(() => 32)).toThrow(/out-of-range/);
    expect(() => generateRoomCode(() => -1)).toThrow(/out-of-range/);
  });
});

describe('rematch ids', () => {
  const gameId = '33333333-3333-4333-8333-333333333333';

  it('derives a stable UUID from the previous game id', () => {
    const first = rematchGameId(gameId);

    expect(first).toBe(rematchGameId(gameId));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('derives different ids for different games', () => {
    expect(rematchGameId(gameId)).not.toBe(rematchGameId('44444444-4444-4444-8444-444444444444'));
  });
});
