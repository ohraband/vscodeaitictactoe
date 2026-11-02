import type { GameSnapshot } from '@ttt/contracts';

export interface GamePublisher {
  notifyGame(game: GameSnapshot): void;
  notifyMutation(game: GameSnapshot, previousGameId: string): void;
  notifyGameById(gameId: string): Promise<void>;
}

export const noopGamePublisher: GamePublisher = {
  notifyGame: () => undefined,
  notifyMutation: () => undefined,
  notifyGameById: async () => undefined,
};
