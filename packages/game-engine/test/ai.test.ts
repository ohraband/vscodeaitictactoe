import { describe, expect, it } from 'vitest';
import {
  boardFromCode,
  chooseAiMove,
  createBoard,
  getLegalMoves,
  getOpponent,
  getOutcome,
  playMove,
  type Board,
  type Difficulty,
  type GameOutcome,
  type PlayerSymbol,
} from '../src/index.js';
import { createSeededRandom } from './support/rng.js';

function playAgainstAi(difficulty: Difficulty, aiStarts: boolean, seed: number): GameOutcome {
  const humanRandom = createSeededRandom(seed);
  const aiRandom = createSeededRandom(seed + 10_000);
  const aiSymbol: PlayerSymbol = aiStarts ? 'X' : 'O';
  let board: Board = createBoard();
  let turn: PlayerSymbol = 'X';

  for (let moveNumber = 0; moveNumber < 9; moveNumber += 1) {
    const outcome = getOutcome(board);
    if (outcome.kind !== 'in_progress') return outcome;

    let cell: number | null;

    if (turn === aiSymbol) {
      cell = chooseAiMove(board, difficulty, { random: aiRandom });
    } else {
      const legalMoves = getLegalMoves(board);
      const index = Math.floor(humanRandom() * legalMoves.length);
      cell = legalMoves[index] ?? null;
    }

    if (cell === null) throw new Error('Expected a legal AI move.');

    board = playMove(board, cell, turn);
    turn = getOpponent(turn);
  }

  return getOutcome(board);
}

describe('hard AI', () => {
  it('never loses when playing first or second', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const aiStarts of [true, false]) {
        const outcome = playAgainstAi('hard', aiStarts, seed);

        if (outcome.kind === 'win') {
          const humanSymbol = aiStarts ? 'O' : 'X';
          expect(outcome.winner, `seed ${seed}, aiStarts ${aiStarts}`).not.toBe(humanSymbol);
        }
      }
    }
  });

  it('takes an immediate win', () => {
    const board = boardFromCode('OO.XX...X');

    expect(getOutcome(board)).toEqual({ kind: 'in_progress' });
    expect(chooseAiMove(board, 'hard', { random: () => 0 })).toBe(2);
  });

  it('blocks an immediate loss', () => {
    const board = boardFromCode('XX..O....');

    expect(chooseAiMove(board, 'hard', { random: () => 0 })).toBe(2);
  });
});

describe('medium AI', () => {
  it('blocks an immediate loss', () => {
    const board = boardFromCode('XX..O....');

    expect(chooseAiMove(board, 'medium', { random: () => 0 })).toBe(2);
  });

  it('only plays legal moves in full games', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const outcome = playAgainstAi('medium', seed % 2 === 0, seed);
      expect(['win', 'draw']).toContain(outcome.kind);
    }
  });
});

describe('easy AI', () => {
  it('takes an immediate win when it chooses the tactical branch', () => {
    const board = boardFromCode('OO.XX...X');

    expect(chooseAiMove(board, 'easy', { random: () => 0 })).toBe(2);
  });

  it('only plays legal moves in full games', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const outcome = playAgainstAi('easy', seed % 2 === 0, seed);
      expect(['win', 'draw']).toContain(outcome.kind);
    }
  });
});

describe('AI boundaries', () => {
  it('returns null for finished games', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      expect(chooseAiMove(boardFromCode('XXX......'), difficulty)).toBeNull();
      expect(chooseAiMove(boardFromCode('XOXOOXXXO'), difficulty)).toBeNull();
    }
  });

  it('returns a legal move for every reachable non-terminal board', () => {
    const random = createSeededRandom(99);

    for (let game = 0; game < 25; game += 1) {
      let board: Board = createBoard();
      let turn: PlayerSymbol = 'X';

      while (getOutcome(board).kind === 'in_progress') {
        const legalMoves = getLegalMoves(board);
        const choice = chooseAiMove(board, 'hard', { random });

        expect(choice).not.toBeNull();
        expect(legalMoves).toContain(choice);

        if (choice === null) break;
        board = playMove(board, choice, turn);
        turn = getOpponent(turn);
      }
    }
  });
});
