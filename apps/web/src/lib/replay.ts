import type { GameDetail, GameMove } from '@ttt/contracts';
import {
  createBoard,
  getOutcome,
  playMove,
  type Board,
  type Cell,
  type GameOutcome,
} from '@ttt/game-engine';

export interface ReplayFrame {
  readonly board: Board;
  readonly outcome: GameOutcome;
  readonly move: GameMove | null;
  readonly moveNumber: number;
}

function emptyOutcome(board: Board): GameOutcome {
  try {
    return getOutcome(board);
  } catch {
    return { kind: 'in_progress' };
  }
}

export function buildReplayFrames(game: GameDetail): ReplayFrame[] {
  const frames: ReplayFrame[] = [
    {
      board: createBoard(),
      outcome: { kind: 'in_progress' },
      move: null,
      moveNumber: 0,
    },
  ];
  let board: Board = createBoard();

  for (const move of game.moves) {
    try {
      board = playMove(board, move.cell, move.symbol);
    } catch {
      break;
    }

    frames.push({
      board,
      outcome: emptyOutcome(board),
      move,
      moveNumber: move.moveNumber,
    });
  }

  const finalBoard: Board = game.board as Cell[];
  const lastFrame = frames.at(-1);

  if (lastFrame && lastFrame.board.join('|') !== finalBoard.join('|') && finalBoard.some(Boolean)) {
    frames.push({
      board: finalBoard,
      outcome: emptyOutcome(finalBoard),
      move: game.moves.at(-1) ?? null,
      moveNumber: game.moves.length,
    });
  }

  return frames;
}

export function frameAt(frames: readonly ReplayFrame[], index: number): ReplayFrame {
  const bounded = Math.min(Math.max(Math.trunc(index), 0), Math.max(0, frames.length - 1));

  return (
    frames[bounded] ?? {
      board: createBoard(),
      outcome: { kind: 'in_progress' },
      move: null,
      moveNumber: 0,
    }
  );
}
