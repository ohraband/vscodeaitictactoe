import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  GameRuleError,
  WINNING_LINES,
  assertBoard,
  boardFromCode,
  boardToCode,
  countSymbols,
  createBoard,
  getLegalMoves,
  getNextSymbol,
  getOpponent,
  getOutcome,
  isGameOver,
  playMove,
  type Board,
  type GameRuleErrorCode,
} from '../src/index.js';

function expectRuleError(fn: () => unknown, code: GameRuleErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GameRuleError);
    expect((error as GameRuleError).code).toBe(code);
    return;
  }

  throw new Error(`Expected GameRuleError with code ${code}.`);
}

describe('board serialization', () => {
  it('creates an empty board', () => {
    const board = createBoard();

    expect(board).toHaveLength(BOARD_SIZE);
    expect(board.every((cell) => cell === null)).toBe(true);
  });

  it('round-trips board codes', () => {
    const code = 'XOXOOXXXO';
    const board = boardFromCode(code);

    expect(boardToCode(board)).toBe(code);
    expect(board).toEqual(['X', 'O', 'X', 'O', 'O', 'X', 'X', 'X', 'O']);
  });

  it('rejects malformed board codes', () => {
    expectRuleError(() => boardFromCode('XOX'), 'INVALID_BOARD');
    expectRuleError(() => boardFromCode('XOXOOXXX?'), 'INVALID_BOARD');
  });

  it('rejects malformed boards at runtime', () => {
    expectRuleError(() => assertBoard(['X'] as unknown as Board), 'INVALID_BOARD');
    expectRuleError(
      () => assertBoard(['X', 'O', '.', null, null, null, null, null, null] as unknown as Board),
      'INVALID_BOARD',
    );
  });
});

describe('win and draw detection', () => {
  const winningBoards: ReadonlyArray<{
    readonly code: string;
    readonly winner: 'X' | 'O';
    readonly line: readonly [number, number, number];
  }> = [
    { code: 'XXX......', winner: 'X', line: [0, 1, 2] },
    { code: '...XXX...', winner: 'X', line: [3, 4, 5] },
    { code: '......XXX', winner: 'X', line: [6, 7, 8] },
    { code: 'X..X..X..', winner: 'X', line: [0, 3, 6] },
    { code: '.X..X..X.', winner: 'X', line: [1, 4, 7] },
    { code: '..X..X..X', winner: 'X', line: [2, 5, 8] },
    { code: 'X...X...X', winner: 'X', line: [0, 4, 8] },
    { code: '..X.X.X..', winner: 'X', line: [2, 4, 6] },
    { code: 'OOO......', winner: 'O', line: [0, 1, 2] },
    { code: '...OOO...', winner: 'O', line: [3, 4, 5] },
    { code: '......OOO', winner: 'O', line: [6, 7, 8] },
    { code: 'O..O..O..', winner: 'O', line: [0, 3, 6] },
    { code: '.O..O..O.', winner: 'O', line: [1, 4, 7] },
    { code: '..O..O..O', winner: 'O', line: [2, 5, 8] },
    { code: 'O...O...O', winner: 'O', line: [0, 4, 8] },
    { code: '..O.O.O..', winner: 'O', line: [2, 4, 6] },
  ];

  it('covers every winning line', () => {
    expect(winningBoards).toHaveLength(WINNING_LINES.length * 2);

    for (const testCase of winningBoards) {
      const outcome = getOutcome(boardFromCode(testCase.code));

      expect(outcome).toEqual({
        kind: 'win',
        winner: testCase.winner,
        line: testCase.line,
      });
    }
  });

  it('detects a draw', () => {
    const outcome = getOutcome(boardFromCode('XOXOOXXXO'));

    expect(outcome).toEqual({ kind: 'draw' });
    expect(isGameOver(outcome)).toBe(true);
  });

  it('reports a game in progress', () => {
    const outcome = getOutcome(boardFromCode('XO.......'));

    expect(outcome).toEqual({ kind: 'in_progress' });
    expect(isGameOver(outcome)).toBe(false);
  });
});

describe('moves and turns', () => {
  it('applies moves immutably', () => {
    const initial = createBoard();
    const next = playMove(initial, 4, 'X');

    expect(initial[4]).toBeNull();
    expect(next[4]).toBe('X');
  });

  it('lists legal moves', () => {
    expect(getLegalMoves(boardFromCode('XO.......'))).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('derives the next symbol from the board', () => {
    expect(getNextSymbol(createBoard())).toBe('X');
    expect(getNextSymbol(boardFromCode('X........'))).toBe('O');
    expect(getNextSymbol(boardFromCode('XO.......'))).toBe('X');
  });

  it('rejects an impossible symbol count', () => {
    expectRuleError(() => getNextSymbol(boardFromCode('XX.......')), 'INVALID_BOARD');
  });

  it('flips symbols', () => {
    expect(getOpponent('X')).toBe('O');
    expect(getOpponent('O')).toBe('X');
  });

  it('counts symbols', () => {
    expect(countSymbols(boardFromCode('XOXXO....'))).toEqual({ X: 3, O: 2 });
  });

  it('rejects occupied cells', () => {
    expectRuleError(() => playMove(boardFromCode('X........'), 0, 'O'), 'CELL_OCCUPIED');
  });

  it('rejects out-of-range cells', () => {
    expectRuleError(() => playMove(createBoard(), -1, 'X'), 'OUT_OF_RANGE');
    expectRuleError(() => playMove(createBoard(), 9, 'X'), 'OUT_OF_RANGE');
    expectRuleError(() => playMove(createBoard(), 1.5, 'X'), 'OUT_OF_RANGE');
  });

  it('rejects moves after the game is over', () => {
    expectRuleError(() => playMove(boardFromCode('XXX......'), 3, 'O'), 'GAME_OVER');
    expectRuleError(() => playMove(boardFromCode('XOXOOXXXO'), 0, 'X'), 'GAME_OVER');
  });
});
