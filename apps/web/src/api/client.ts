import {
  apiErrorSchema,
  gameDetailResponseSchema,
  gameListResponseSchema,
  gameResponseSchema,
  leaderboardResponseSchema,
  sessionResponseSchema,
  type CreateGameRequest,
  type ErrorCode,
  type GameDetailResponse,
  type GameListResponse,
  type GameSnapshot,
  type GameStatus,
  type GameMode,
  type LeaderboardResponse,
  type PublicPlayer,
  type SessionResponse,
} from '@ttt/contracts';
import type { ZodType } from 'zod';

export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(code: ApiErrorCode, status: number, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function request<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;

    throw new ApiError('NETWORK_ERROR', 0, 'Could not reach the server. Check your connection.');
  }

  const body = await parseJson(response);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    const apiError = parsed.success ? parsed.data.error : null;

    throw new ApiError(
      apiError?.code ?? 'INTERNAL_ERROR',
      response.status,
      apiError?.message ?? 'Something went wrong. Please try again.',
      apiError?.requestId,
    );
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError(
      'INTERNAL_ERROR',
      response.status,
      'The server returned an unexpected response.',
    );
  }

  return parsed.data;
}

export interface GameListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly mode?: GameMode;
  readonly status?: GameStatus;
}

function gameListQuery(filters: GameListFilters): string {
  const params = new URLSearchParams();

  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize));
  if (filters.mode !== undefined) params.set('mode', filters.mode);
  if (filters.status !== undefined) params.set('status', filters.status);

  const query = params.toString();

  return query ? `?${query}` : '';
}

export const api = {
  async me(): Promise<PublicPlayer | null> {
    try {
      const response = await request<SessionResponse>('/api/me', sessionResponseSchema);
      return response.player;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async createSession(displayName: string): Promise<PublicPlayer> {
    const response = await request<SessionResponse>('/api/session', sessionResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    });

    return response.player;
  },

  async rename(displayName: string): Promise<PublicPlayer> {
    const response = await request<SessionResponse>('/api/me', sessionResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });

    return response.player;
  },

  async createGame(input: CreateGameRequest): Promise<GameSnapshot> {
    const response = await request<{ game: GameSnapshot }>('/api/games', gameResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return response.game;
  },

  async joinGame(code: string): Promise<GameSnapshot> {
    const response = await request<{ game: GameSnapshot }>('/api/games/join', gameResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    return response.game;
  },

  async quickMatch(): Promise<GameSnapshot> {
    const response = await request<{ game: GameSnapshot }>(
      '/api/games/quick-match',
      gameResponseSchema,
      { method: 'POST' },
    );

    return response.game;
  },

  listGames(filters: GameListFilters = {}): Promise<GameListResponse> {
    return request(`/api/games${gameListQuery(filters)}`, gameListResponseSchema);
  },

  getGame(gameId: string): Promise<GameDetailResponse> {
    return request(`/api/games/${encodeURIComponent(gameId)}`, gameDetailResponseSchema);
  },

  leaderboard(limit = 50): Promise<LeaderboardResponse> {
    return request(`/api/leaderboard?limit=${limit}`, leaderboardResponseSchema);
  },
};
