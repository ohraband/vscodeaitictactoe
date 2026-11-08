export const GAME_MODES = ['single', 'multi'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const GAME_STATUSES = ['waiting', 'active', 'finished', 'abandoned'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const VISIBILITIES = ['private', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const FINISH_REASONS = ['line', 'draw', 'timeout', 'forfeit', 'abandoned'] as const;
export type FinishReason = (typeof FINISH_REASONS)[number];

export const WINNER_VALUES = ['X', 'O', 'draw'] as const;
export type Winner = (typeof WINNER_VALUES)[number];

export const ERROR_CODES = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'NAME_TAKEN',
  'GAME_NOT_FOUND',
  'NOT_PARTICIPANT',
  'NOT_YOUR_TURN',
  'CELL_TAKEN',
  'STALE_STATE',
  'GAME_FINISHED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const SOCKET_EVENTS = {
  GAME_SUBSCRIBE: 'game:subscribe',
  GAME_MOVE: 'game:move',
  GAME_LEAVE: 'game:leave',
  GAME_REMATCH: 'game:rematch',
  GAME_SNAPSHOT: 'game:snapshot',
  GAME_UPDATE: 'game:update',
  GAME_PRESENCE: 'game:presence',
  GAME_REMATCH_STARTED: 'game:rematch-started',
  CURSOR_MOVE: 'cursor:move',
  CURSOR_SUBSCRIBE: 'cursor:subscribe',
  CURSOR_DOT: 'cursor:dot',
  CURSOR_LEAVE: 'cursor:leave',
} as const;

export const CURSOR_SOCKET_PATH = '/cursor.io';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 20;

export const GAMES_PAGE_SIZE_DEFAULT = 20;
export const GAMES_PAGE_SIZE_MAX = 50;
export const LEADERBOARD_LIMIT_DEFAULT = 50;
export const LEADERBOARD_LIMIT_MAX = 100;
export const LEADERBOARD_MIN_GAMES = 5;
