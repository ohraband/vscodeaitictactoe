import type { GameDetail, GameSnapshot } from '@ttt/contracts';
import type { Difficulty, PlayerSymbol } from '@ttt/game-engine';
import type { PublicPlayer } from '@ttt/contracts';

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatRelativeDate(iso: string): string {
  const timestamp = new Date(iso).getTime();

  if (!Number.isFinite(timestamp)) return 'Unknown time';

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 45) return 'Just now';
  if (absoluteSeconds < 60 * 60)
    return relativeFormatter.format(Math.round(deltaSeconds / 60), 'minute');
  if (absoluteSeconds < 60 * 60 * 24) {
    return relativeFormatter.format(Math.round(deltaSeconds / 3600), 'hour');
  }
  if (absoluteSeconds < 60 * 60 * 24 * 7) {
    return relativeFormatter.format(Math.round(deltaSeconds / 86_400), 'day');
  }

  return dateFormatter.format(timestamp);
}

export function formatDateTime(iso: string): string {
  const timestamp = new Date(iso).getTime();

  return Number.isFinite(timestamp) ? dateTimeFormatter.format(timestamp) : 'Unknown time';
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function playerSymbolFor(
  game: Pick<GameSnapshot, 'playerX' | 'playerO'>,
  playerId: string,
): PlayerSymbol | null {
  if (game.playerX.id === playerId) return 'X';
  if (game.playerO?.id === playerId) return 'O';
  return null;
}

export function playerForSymbol(
  game: Pick<GameSnapshot, 'playerX' | 'playerO'>,
  symbol: PlayerSymbol,
): PublicPlayer {
  return symbol === 'X' ? game.playerX : (game.playerO ?? game.playerX);
}

export function opponentFor(game: GameSnapshot, playerId: string): string {
  if (game.mode === 'single') {
    return game.difficulty
      ? `Computer · ${game.difficulty[0]?.toUpperCase()}${game.difficulty.slice(1)}`
      : 'Computer';
  }

  const opponent = game.playerX.id === playerId ? game.playerO : game.playerX;

  return opponent?.displayName ?? 'Waiting for an opponent';
}

export interface ResultSummary {
  readonly label: string;
  readonly detail: string;
  readonly tone: 'win' | 'loss' | 'draw' | 'neutral';
}

export function resultForPlayer(game: GameSnapshot, playerId: string): ResultSummary {
  if (game.status === 'waiting') {
    return { label: 'Waiting', detail: 'Waiting for an opponent to join.', tone: 'neutral' };
  }

  if (game.status === 'active') {
    return { label: 'In progress', detail: 'The game is still live.', tone: 'neutral' };
  }

  if (game.status === 'abandoned') {
    return {
      label: 'Unfinished',
      detail: 'The room was closed before play began.',
      tone: 'neutral',
    };
  }

  if (game.winner === 'draw' || game.finishReason === 'draw') {
    return { label: 'Draw', detail: 'Neither side found a line.', tone: 'draw' };
  }

  const symbol = playerSymbolFor(game, playerId);
  const won = symbol !== null && game.winner === symbol;
  const reason =
    game.finishReason === 'timeout'
      ? 'The turn clock ran out.'
      : game.finishReason === 'forfeit'
        ? 'The other player left the game.'
        : game.finishReason === 'line'
          ? 'Three in a row.'
          : 'The game is complete.';

  return {
    label: won ? 'Win' : 'Loss',
    detail: reason,
    tone: won ? 'win' : 'loss',
  };
}

export function finishReasonLabel(game: GameDetail | GameSnapshot): string {
  switch (game.finishReason) {
    case 'line':
      return 'Three in a row';
    case 'draw':
      return 'Draw';
    case 'timeout':
      return 'Turn timer expired';
    case 'forfeit':
      return 'Forfeit';
    case 'abandoned':
      return 'Room closed';
    default:
      return game.status === 'active' ? 'Live game' : 'No result';
  }
}

export function difficultyLabel(difficulty: Difficulty | null): string {
  if (!difficulty) return 'Multiplayer';
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export function statusLabel(status: GameSnapshot['status']): string {
  switch (status) {
    case 'waiting':
      return 'Waiting';
    case 'active':
      return 'Live';
    case 'finished':
      return 'Finished';
    case 'abandoned':
      return 'Abandoned';
  }
}

export function isMyTurn(game: GameSnapshot, playerId: string): boolean {
  if (game.status !== 'active') return false;

  const symbol = playerSymbolFor(game, playerId);

  return symbol !== null && game.turn === symbol;
}
