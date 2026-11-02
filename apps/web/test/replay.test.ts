import type { GameDetail } from '@ttt/contracts';
import { describe, expect, it } from 'vitest';
import { buildReplayFrames, frameAt } from '../src/lib/replay';
import { makeGameDetail } from './fixtures';

describe('replay', () => {
  it('builds a frame for the empty board and every recorded move', () => {
    const frames = buildReplayFrames(makeGameDetail());

    expect(frames).toHaveLength(6);
    expect(frames[0]).toMatchObject({ move: null, moveNumber: 0 });
    expect(frames[0]?.board.every((cell) => cell === null)).toBe(true);
    expect(frames.at(-1)?.board).toEqual(['X', 'X', 'X', 'O', 'O', null, null, null, null]);
    expect(frames.at(-1)?.outcome.kind).toBe('win');
  });

  it('clamps frame lookups to the available range', () => {
    const frames = buildReplayFrames(makeGameDetail());

    expect(frameAt(frames, -12).moveNumber).toBe(0);
    expect(frameAt(frames, 999).moveNumber).toBe(5);
    expect(frameAt([], 3).moveNumber).toBe(0);
  });

  it('stops at an invalid move and uses the stored final board when needed', () => {
    const detail = makeGameDetail();
    const invalid: GameDetail = {
      ...detail,
      moves: [detail.moves[0]!, { ...detail.moves[1]!, cell: 0 }],
      board: ['X', 'O', null, null, null, null, null, null, null],
    };
    const frames = buildReplayFrames(invalid);

    expect(frames).toHaveLength(3);
    expect(frames.at(-1)?.board).toEqual(['X', 'O', null, null, null, null, null, null, null]);
  });
});
