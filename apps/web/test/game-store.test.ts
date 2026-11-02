import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/stores/game-store';
import { makeGame, makeMultiplayerGame, playerO } from './fixtures';

const gameId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  useGameStore.setState({
    activeGameId: null,
    game: null,
    connection: 'idle',
    presence: {},
    rematch: null,
  });
});

describe('game store', () => {
  it('begins a fresh channel and ends only the active game', () => {
    const store = useGameStore.getState();

    store.begin(gameId);
    expect(useGameStore.getState()).toMatchObject({
      activeGameId: gameId,
      game: null,
      connection: 'connecting',
      presence: {},
      rematch: null,
    });

    useGameStore.getState().end('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(useGameStore.getState().activeGameId).toBe(gameId);

    useGameStore.getState().end(gameId);
    expect(useGameStore.getState()).toMatchObject({
      activeGameId: null,
      game: null,
      connection: 'idle',
    });
  });

  it('accepts newer snapshots for the active game only', () => {
    const store = useGameStore.getState();
    const game = makeGame({ version: 3 });

    store.begin(gameId);
    store.setGame(game);
    expect(useGameStore.getState().game).toBe(game);

    store.setGame(makeGame({ version: 2 }));
    expect(useGameStore.getState().game).toBe(game);

    store.setGame(makeGame({ version: 4, turn: 'O' }));
    expect(useGameStore.getState().game?.version).toBe(4);

    store.setGame(makeMultiplayerGame({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }));
    expect(useGameStore.getState().game?.id).toBe(gameId);
  });

  it('merges presence and ignores stale game channels', () => {
    const store = useGameStore.getState();

    store.begin(gameId);
    store.setPresence({ gameId, playerId: playerO.id, online: true });
    store.setPresence({ gameId, playerId: playerO.id, online: false });
    expect(useGameStore.getState().presence).toEqual({ [playerO.id]: false });

    store.setPresence({
      gameId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      playerId: playerO.id,
      online: true,
    });
    expect(useGameStore.getState().presence).toEqual({ [playerO.id]: false });
  });

  it('tracks rematch notifications once a channel is active', () => {
    const store = useGameStore.getState();
    const rematch = { gameId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'XYZ789' };

    store.setRematch(rematch);
    expect(useGameStore.getState().rematch).toBeNull();

    store.begin(gameId);
    store.setRematch(rematch);
    expect(useGameStore.getState().rematch).toEqual(rematch);
  });
});
