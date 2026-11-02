import { describe, expect, it } from 'vitest';
import {
  difficultyLabel,
  finishReasonLabel,
  formatDuration,
  isMyTurn,
  opponentFor,
  playerForSymbol,
  playerSymbolFor,
  resultForPlayer,
  statusLabel,
} from '../src/lib/format';
import { makeFinishedGame, makeGame, makeMultiplayerGame, playerO, playerX } from './fixtures';

describe('formatDuration', () => {
  it('formats whole and partial seconds without going negative', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9.2)).toBe('0:10');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(-4)).toBe('0:00');
  });
});

describe('player helpers', () => {
  it('finds symbols and players', () => {
    const game = makeMultiplayerGame();

    expect(playerSymbolFor(game, playerX.id)).toBe('X');
    expect(playerSymbolFor(game, playerO.id)).toBe('O');
    expect(playerSymbolFor(game, '33333333-3333-4333-8333-333333333333')).toBeNull();
    expect(playerForSymbol(game, 'O')).toBe(playerO);
  });

  it('describes opponents for solo and multiplayer games', () => {
    expect(opponentFor(makeGame(), playerX.id)).toBe('Computer · Easy');
    expect(opponentFor(makeGame({ difficulty: null }), playerX.id)).toBe('Computer');
    expect(opponentFor(makeMultiplayerGame(), playerX.id)).toBe('Grace Hopper');
    expect(
      opponentFor(
        makeMultiplayerGame({ status: 'waiting', playerO: null, startedAt: null }),
        playerX.id,
      ),
    ).toBe('Waiting for an opponent');
  });
});

describe('resultForPlayer', () => {
  it('summarizes unstarted, live, and abandoned games', () => {
    expect(resultForPlayer(makeGame({ status: 'waiting' }), playerX.id)).toEqual({
      label: 'Waiting',
      detail: 'Waiting for an opponent to join.',
      tone: 'neutral',
    });
    expect(resultForPlayer(makeGame(), playerX.id)).toEqual({
      label: 'In progress',
      detail: 'The game is still live.',
      tone: 'neutral',
    });
    expect(resultForPlayer(makeGame({ status: 'abandoned' }), playerX.id)).toEqual({
      label: 'Unfinished',
      detail: 'The room was closed before play began.',
      tone: 'neutral',
    });
  });

  it('maps wins, losses, draws, and finish reasons', () => {
    expect(resultForPlayer(makeFinishedGame(), playerX.id)).toEqual({
      label: 'Win',
      detail: 'Three in a row.',
      tone: 'win',
    });
    expect(resultForPlayer(makeFinishedGame(), playerO.id)).toEqual({
      label: 'Loss',
      detail: 'Three in a row.',
      tone: 'loss',
    });

    const timeout = makeFinishedGame({ finishReason: 'timeout' });
    expect(resultForPlayer(timeout, playerX.id).detail).toBe('The turn clock ran out.');

    const forfeit = makeFinishedGame({ finishReason: 'forfeit' });
    expect(resultForPlayer(forfeit, playerX.id).detail).toBe('The other player left the game.');

    const draw = makeFinishedGame({ winner: 'draw', finishReason: 'draw', winningLine: null });
    expect(resultForPlayer(draw, playerX.id)).toEqual({
      label: 'Draw',
      detail: 'Neither side found a line.',
      tone: 'draw',
    });
  });
});

describe('labels and turn state', () => {
  it('returns readable status and difficulty labels', () => {
    expect(statusLabel('waiting')).toBe('Waiting');
    expect(statusLabel('finished')).toBe('Finished');
    expect(difficultyLabel('hard')).toBe('Hard');
    expect(difficultyLabel(null)).toBe('Multiplayer');
    expect(finishReasonLabel(makeFinishedGame())).toBe('Three in a row');
    expect(finishReasonLabel(makeGame({ finishReason: 'forfeit' }))).toBe('Forfeit');
  });

  it('only reports a turn for active participants', () => {
    expect(isMyTurn(makeGame(), playerX.id)).toBe(true);
    expect(isMyTurn(makeGame({ turn: 'O', playerO }), playerX.id)).toBe(false);
    expect(isMyTurn(makeMultiplayerGame({ turn: 'O' }), playerO.id)).toBe(true);
    expect(isMyTurn(makeGame({ status: 'finished' }), playerX.id)).toBe(false);
    expect(isMyTurn(makeGame(), '33333333-3333-4333-8333-333333333333')).toBe(false);
  });
});
