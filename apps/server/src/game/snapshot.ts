import type { Move, Prisma } from '@prisma/client';
import { boardFromCode, type PlayerSymbol } from '@ttt/game-engine';
import type {
  Difficulty,
  FinishReason,
  GameMode,
  GameMove,
  GameSnapshot,
  GameStatus,
  Visibility,
  Winner,
} from '@ttt/contracts';
import { toPublicPlayer } from '../players.js';

export type GameWithPlayers = Prisma.GameGetPayload<{
  include: { playerX: true; playerO: true };
}>;

export type GameWithPlayersAndMoves = Prisma.GameGetPayload<{
  include: { playerX: true; playerO: true; moves: true };
}>;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toBoard(code: string): (PlayerSymbol | null)[] {
  return [...boardFromCode(code)];
}

function winningLine(line: number[]): number[] | null {
  return line.length === 3 ? line : null;
}

export function toGameSnapshot(game: GameWithPlayers): GameSnapshot {
  const mode: GameMode = game.mode === 'SINGLE' ? 'single' : 'multi';
  const visibility: Visibility = game.visibility === 'PRIVATE' ? 'private' : 'public';
  const status: GameStatus = game.status.toLowerCase() as GameStatus;
  const difficulty: Difficulty | null =
    game.difficulty === null ? null : (game.difficulty.toLowerCase() as Difficulty);
  const winner: Winner | null =
    game.winner === null ? null : game.winner === 'DRAW' ? 'draw' : game.winner;
  const finishReason: FinishReason | null =
    game.finishReason === null ? null : (game.finishReason.toLowerCase() as FinishReason);

  return {
    id: game.id,
    code: game.code,
    mode,
    visibility,
    status,
    difficulty,
    board: toBoard(game.board),
    turn: game.turn,
    winner,
    finishReason,
    winningLine: winningLine(game.winningLine),
    playerX: toPublicPlayer(game.playerX),
    playerO: game.playerO === null ? null : toPublicPlayer(game.playerO),
    version: game.version,
    turnDeadline: iso(game.turnDeadline),
    rematchRequestedByX: game.rematchRequestedByX,
    rematchRequestedByO: game.rematchRequestedByO,
    createdAt: game.createdAt.toISOString(),
    startedAt: iso(game.startedAt),
    finishedAt: iso(game.finishedAt),
  };
}

export function toGameMove(move: Move): GameMove {
  return {
    moveNumber: move.moveNumber,
    cell: move.cell,
    symbol: move.symbol,
    playerId: move.playerId,
    createdAt: move.createdAt.toISOString(),
  };
}
