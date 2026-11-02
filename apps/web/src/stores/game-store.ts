import type { GamePresence, GameSnapshot, RematchStarted } from '@ttt/contracts';
import { create } from 'zustand';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface GameState {
  readonly activeGameId: string | null;
  readonly game: GameSnapshot | null;
  readonly connection: ConnectionState;
  readonly presence: Readonly<Record<string, boolean>>;
  readonly rematch: RematchStarted | null;
  begin: (gameId: string) => void;
  end: (gameId: string) => void;
  setGame: (game: GameSnapshot) => void;
  setConnection: (connection: ConnectionState) => void;
  setPresence: (presence: GamePresence) => void;
  setRematch: (rematch: RematchStarted) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  activeGameId: null,
  game: null,
  connection: 'idle',
  presence: {},
  rematch: null,
  begin: (gameId) => {
    set({
      activeGameId: gameId,
      game: null,
      connection: 'connecting',
      presence: {},
      rematch: null,
    });
  },
  end: (gameId) => {
    if (get().activeGameId !== gameId) return;

    set({
      activeGameId: null,
      game: null,
      connection: 'idle',
      presence: {},
      rematch: null,
    });
  },
  setGame: (game) => {
    const current = get();

    if (current.activeGameId !== game.id) return;
    if (current.game && current.game.version > game.version) return;

    set({ game });
  },
  setConnection: (connection) => {
    set({ connection });
  },
  setPresence: (presence) => {
    if (get().activeGameId !== presence.gameId) return;

    set((current) => ({
      presence: { ...current.presence, [presence.playerId]: presence.online },
    }));
  },
  setRematch: (rematch) => {
    if (get().activeGameId === null) return;

    set({ rematch });
  },
}));
