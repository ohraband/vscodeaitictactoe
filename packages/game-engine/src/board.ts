export const BOARD_SIZE = 9;

export const PLAYER_SYMBOLS = ['X', 'O'] as const;
export type PlayerSymbol = (typeof PLAYER_SYMBOLS)[number];
export type Cell = PlayerSymbol | null;
export type Board = readonly Cell[];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export type WinningLine = (typeof WINNING_LINES)[number];

export type GameOutcome =
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'win'; readonly winner: PlayerSymbol; readonly line: WinningLine }
  | { readonly kind: 'draw' };

export type GameRuleErrorCode =
  'INVALID_BOARD' | 'INVALID_SYMBOL' | 'OUT_OF_RANGE' | 'CELL_OCCUPIED' | 'GAME_OVER';

export class GameRuleError extends Error {
  readonly code: GameRuleErrorCode;

  constructor(code: GameRuleErrorCode, message: string) {
    super(message);
    this.name = 'GameRuleError';
    this.code = code;
  }
}

export function createBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => null);
}

export function assertBoard(board: Board): void {
  if (board.length !== BOARD_SIZE) {
    throw new GameRuleError('INVALID_BOARD', `A board must contain exactly ${BOARD_SIZE} cells.`);
  }

  for (const cell of board) {
    if (cell !== null && cell !== 'X' && cell !== 'O') {
      throw new GameRuleError('INVALID_BOARD', 'A board cell must be X, O, or empty.');
    }
  }
}

function cellAt(board: Board, index: number): Cell {
  return board[index] ?? null;
}

export function countSymbols(board: Board): Readonly<Record<PlayerSymbol, number>> {
  assertBoard(board);

  let x = 0;
  let o = 0;

  for (const cell of board) {
    if (cell === 'X') x += 1;
    if (cell === 'O') o += 1;
  }

  return { X: x, O: o };
}

export function getOutcome(board: Board): GameOutcome {
  assertBoard(board);

  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    const first = cellAt(board, a);

    if (first !== null && first === cellAt(board, b) && first === cellAt(board, c)) {
      return { kind: 'win', winner: first, line };
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { kind: 'draw' };
  }

  return { kind: 'in_progress' };
}

export function isGameOver(outcome: GameOutcome): boolean {
  return outcome.kind !== 'in_progress';
}

export function getLegalMoves(board: Board): number[] {
  assertBoard(board);

  const moves: number[] = [];

  for (let cell = 0; cell < BOARD_SIZE; cell += 1) {
    if (cellAt(board, cell) === null) moves.push(cell);
  }

  return moves;
}

export function playMove(board: Board, cell: number, symbol: PlayerSymbol): Board {
  assertBoard(board);

  if (symbol !== 'X' && symbol !== 'O') {
    throw new GameRuleError('INVALID_SYMBOL', 'The symbol must be X or O.');
  }

  if (!Number.isInteger(cell) || cell < 0 || cell >= BOARD_SIZE) {
    throw new GameRuleError('OUT_OF_RANGE', `Cell must be an integer from 0 to ${BOARD_SIZE - 1}.`);
  }

  if (isGameOver(getOutcome(board))) {
    throw new GameRuleError('GAME_OVER', 'The game is already over.');
  }

  if (cellAt(board, cell) !== null) {
    throw new GameRuleError('CELL_OCCUPIED', 'That cell is already occupied.');
  }

  const next = [...board];
  next[cell] = symbol;
  return next;
}

export function getNextSymbol(board: Board): PlayerSymbol {
  const counts = countSymbols(board);

  if (counts.X === counts.O) return 'X';
  if (counts.X === counts.O + 1) return 'O';

  throw new GameRuleError('INVALID_BOARD', 'The board has an impossible number of symbols.');
}

export function getOpponent(symbol: PlayerSymbol): PlayerSymbol {
  return symbol === 'X' ? 'O' : 'X';
}

export function boardToCode(board: Board): string {
  assertBoard(board);
  return board.map((cell) => cell ?? '.').join('');
}

function codeToCell(char: string): Cell {
  if (char === '.') return null;
  if (char === 'X' || char === 'O') return char;

  throw new GameRuleError('INVALID_BOARD', 'A board code may only contain X, O, and dots.');
}

export function boardFromCode(code: string): Board {
  if (!/^[XO.]{9}$/.test(code)) {
    throw new GameRuleError('INVALID_BOARD', 'A board code must be exactly 9 characters.');
  }

  return [...code].map(codeToCell);
}
