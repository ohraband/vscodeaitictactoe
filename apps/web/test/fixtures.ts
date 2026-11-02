import type { GameDetail, GameSnapshot, PublicPlayer } from '@ttt/contracts';
import { createBoard } from '@ttt/game-engine';

export const playerX: PublicPlayer = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Ada Lovelace',
  createdAt: '2026-10-01T10:00:00.000Z',
};

export const playerO: PublicPlayer = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Grace Hopper',
  createdAt: '2026-10-01T10:01:00.000Z',
};

const gameId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const createdAt = '2026-10-24T10:00:00.000Z';

export function makeGame(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    id: gameId,
    code: 'ABC234',
    mode: 'single',
    visibility: 'private',
    status: 'active',
    difficulty: 'easy',
    board: [...createBoard()],
    turn: 'X',
    winner: null,
    finishReason: null,
    winningLine: null,
    playerX,
    playerO: null,
    version: 1,
    turnDeadline: null,
    rematchRequestedByX: false,
    rematchRequestedByO: false,
    createdAt,
    startedAt: createdAt,
    finishedAt: null,
    ...overrides,
  };
}

export function makeMultiplayerGame(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return makeGame({
    mode: 'multi',
    difficulty: null,
    playerO,
    ...overrides,
  });
}

export function makeFinishedGame(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return makeMultiplayerGame({
    status: 'finished',
    board: ['X', 'X', 'X', 'O', 'O', null, null, null, null],
    turn: 'O',
    winner: 'X',
    finishReason: 'line',
    winningLine: [0, 1, 2],
    version: 5,
    finishedAt: '2026-10-24T10:02:00.000Z',
    ...overrides,
  });
}

export function makeGameDetail(overrides: Partial<GameDetail> = {}): GameDetail {
  return {
    ...makeFinishedGame(),
    moves: [
      {
        moveNumber: 1,
        cell: 0,
        symbol: 'X',
        playerId: playerX.id,
        createdAt: '2026-10-24T10:00:10.000Z',
      },
      {
        moveNumber: 2,
        cell: 3,
        symbol: 'O',
        playerId: playerO.id,
        createdAt: '2026-10-24T10:00:20.000Z',
      },
      {
        moveNumber: 3,
        cell: 1,
        symbol: 'X',
        playerId: playerX.id,
        createdAt: '2026-10-24T10:00:30.000Z',
      },
      {
        moveNumber: 4,
        cell: 4,
        symbol: 'O',
        playerId: playerO.id,
        createdAt: '2026-10-24T10:00:40.000Z',
      },
      {
        moveNumber: 5,
        cell: 2,
        symbol: 'X',
        playerId: playerX.id,
        createdAt: '2026-10-24T10:00:50.000Z',
      },
    ],
    ...overrides,
  };
}
