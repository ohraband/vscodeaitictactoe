import {
  WINNING_LINES,
  getLegalMoves,
  getNextSymbol,
  getOpponent,
  getOutcome,
  playMove,
  type Board,
  type Difficulty,
  type PlayerSymbol,
} from './board.js';

export interface AiMoveOptions {
  readonly random?: () => number;
}

type RandomFn = () => number;

function randomValue(random: RandomFn): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;

  return Math.min(Math.max(value, 0), 0.999999);
}

function pickRandom<T>(items: readonly T[], random: RandomFn): T {
  const index = Math.min(Math.floor(randomValue(random) * items.length), items.length - 1);
  const item = items[index];

  if (item === undefined) {
    throw new Error('Cannot pick from an empty list.');
  }

  return item;
}

function shuffle<T>(items: readonly T[], random: RandomFn): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(Math.floor(randomValue(random) * (index + 1)), index);
    const current = result[index];
    const swap = result[swapIndex];

    if (current === undefined || swap === undefined) continue;

    result[index] = swap;
    result[swapIndex] = current;
  }

  return result;
}

function findImmediateWin(
  board: Board,
  legalMoves: readonly number[],
  symbol: PlayerSymbol,
): number | null {
  for (const move of legalMoves) {
    const outcome = getOutcome(playMove(board, move, symbol));

    if (outcome.kind === 'win' && outcome.winner === symbol) return move;
  }

  return null;
}

function evaluateBoard(board: Board, aiSymbol: PlayerSymbol): number {
  const opponent = getOpponent(aiSymbol);
  let score = 0;

  for (const line of WINNING_LINES) {
    let aiCount = 0;
    let opponentCount = 0;

    for (const index of line) {
      const cell = board[index] ?? null;
      if (cell === aiSymbol) aiCount += 1;
      if (cell === opponent) opponentCount += 1;
    }

    if (opponentCount === 0 && aiCount > 0) {
      score += aiCount === 2 ? 4 : 1;
    } else if (aiCount === 0 && opponentCount > 0) {
      score -= opponentCount === 2 ? 4 : 1;
    }
  }

  if ((board[4] ?? null) === aiSymbol) score += 1;

  return score;
}

function search(
  board: Board,
  aiSymbol: PlayerSymbol,
  turn: PlayerSymbol,
  depth: number,
  maxDepth: number,
  alpha: number,
  beta: number,
): number {
  const outcome = getOutcome(board);

  if (outcome.kind === 'win') {
    return outcome.winner === aiSymbol ? 10 - depth : depth - 10;
  }

  if (outcome.kind === 'draw') return 0;
  if (depth >= maxDepth) return evaluateBoard(board, aiSymbol);

  const legalMoves = getLegalMoves(board);

  if (turn === aiSymbol) {
    let best = Number.NEGATIVE_INFINITY;

    for (const move of legalMoves) {
      const score = search(
        playMove(board, move, turn),
        aiSymbol,
        getOpponent(turn),
        depth + 1,
        maxDepth,
        alpha,
        beta,
      );

      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }

    return best;
  }

  let best = Number.POSITIVE_INFINITY;

  for (const move of legalMoves) {
    const score = search(
      playMove(board, move, turn),
      aiSymbol,
      getOpponent(turn),
      depth + 1,
      maxDepth,
      alpha,
      beta,
    );

    if (score < best) best = score;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }

  return best;
}

function chooseMinimaxMove(
  board: Board,
  aiSymbol: PlayerSymbol,
  legalMoves: readonly number[],
  maxDepth: number,
  random: RandomFn,
): number {
  const orderedMoves = shuffle(legalMoves, random);
  const bestMoves: number[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const move of orderedMoves) {
    const score = search(
      playMove(board, move, aiSymbol),
      aiSymbol,
      getOpponent(aiSymbol),
      1,
      maxDepth,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    if (score > bestScore) {
      bestScore = score;
      bestMoves.length = 0;
      bestMoves.push(move);
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return pickRandom(bestMoves, random);
}

function chooseEasyMove(
  board: Board,
  aiSymbol: PlayerSymbol,
  legalMoves: readonly number[],
  random: RandomFn,
): number {
  if (randomValue(random) < 0.5) {
    const winningMove = findImmediateWin(board, legalMoves, aiSymbol);
    if (winningMove !== null) return winningMove;

    const blockingMove = findImmediateWin(board, legalMoves, getOpponent(aiSymbol));
    if (blockingMove !== null) return blockingMove;
  }

  return pickRandom(legalMoves, random);
}

export function chooseAiMove(
  board: Board,
  difficulty: Difficulty,
  options: AiMoveOptions = {},
): number | null {
  if (getOutcome(board).kind !== 'in_progress') return null;

  const legalMoves = getLegalMoves(board);
  if (legalMoves.length === 0) return null;

  const aiSymbol = getNextSymbol(board);
  const random = options.random ?? Math.random;

  switch (difficulty) {
    case 'easy':
      return chooseEasyMove(board, aiSymbol, legalMoves, random);
    case 'medium': {
      if (randomValue(random) < 0.2) return pickRandom(legalMoves, random);
      return chooseMinimaxMove(board, aiSymbol, legalMoves, 2, random);
    }
    case 'hard':
      return chooseMinimaxMove(board, aiSymbol, legalMoves, 9, random);
  }
}
