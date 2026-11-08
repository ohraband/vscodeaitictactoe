import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEADERBOARD_MINIMUM_GAMES,
  SOCKET_EVENTS,
  analyticsGameCompletedSchema,
  apiErrorSchema,
  appConfigResponseSchema,
  boardSchema,
  createGameRequestSchema,
  cursorDotSchema,
  cursorMoveEventSchema,
  cursorMoveRequestSchema,
  cursorSubscribeRequestSchema,
  difficultySchema,
  displayNameSchema,
  gameDetailSchema,
  gameListQuerySchema,
  gamePresenceSchema,
  gameResponseSchema,
  gameSnapshotSchema,
  rematchStartedSchema,
  isoDateTimeSchema,
  leaderboardQuerySchema,
  moveBodySchema,
  moveRequestSchema,
  roomCodeSchema,
  sessionRequestSchema,
  socketAckSchema,
  symbolSchema,
} from '../src/index.js';

const playerX = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Ada',
  createdAt: '2026-10-24T10:00:00.000Z',
};

const playerO = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Grace',
  createdAt: '2026-10-24T10:01:00.000Z',
};

const gameId = '33333333-3333-4333-8333-333333333333';

const snapshot = {
  id: gameId,
  code: 'ABC234',
  mode: 'multi' as const,
  visibility: 'public' as const,
  status: 'active' as const,
  difficulty: null,
  board: ['X', null, null, null, 'O', null, null, null, null],
  turn: 'X' as const,
  winner: null,
  finishReason: null,
  winningLine: null,
  playerX,
  playerO,
  version: 1,
  turnDeadline: '2026-10-24T10:02:00.000Z',
  rematchRequestedByX: false,
  rematchRequestedByO: false,
  createdAt: '2026-10-24T10:00:00.000Z',
  startedAt: '2026-10-24T10:00:30.000Z',
  finishedAt: null,
};

describe('display names', () => {
  it('normalizes whitespace and Unicode', () => {
    expect(displayNameSchema.parse('  Ada   Lovelace  ')).toBe('Ada Lovelace');
    expect(displayNameSchema.parse('Ｇrace Hopper')).toBe('Grace Hopper');
  });

  it('accepts letters, numbers, spaces, underscores, and hyphens', () => {
    expect(displayNameSchema.parse('Žofie_42')).toBe('Žofie_42');
    expect(displayNameSchema.parse('Ada-Lovelace')).toBe('Ada-Lovelace');
    expect(displayNameSchema.parse('abc')).toBe('abc');
    expect(displayNameSchema.parse('a'.repeat(20))).toBe('a'.repeat(20));
  });

  it('rejects invalid names', () => {
    expect(displayNameSchema.safeParse('ab').success).toBe(false);
    expect(displayNameSchema.safeParse('a'.repeat(21)).success).toBe(false);
    expect(displayNameSchema.safeParse('Ada!').success).toBe(false);
    expect(displayNameSchema.safeParse('<script>').success).toBe(false);
    expect(displayNameSchema.safeParse('   ').success).toBe(false);
  });
});

describe('room codes', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(roomCodeSchema.parse('  ab2cd9 ')).toBe('AB2CD9');
  });

  it('rejects ambiguous characters and wrong lengths', () => {
    for (const code of ['ABC123', 'AB0DEF', 'ABIDEF', 'ABCDE', 'ABCDEFG']) {
      expect(roomCodeSchema.safeParse(code).success, code).toBe(false);
    }
  });
});

describe('primitive schemas', () => {
  it('validates symbols and difficulties', () => {
    expect(symbolSchema.parse('X')).toBe('X');
    expect(symbolSchema.safeParse('x').success).toBe(false);
    expect(difficultySchema.parse('hard')).toBe('hard');
    expect(difficultySchema.safeParse('impossible').success).toBe(false);
  });

  it('validates 9-cell boards', () => {
    expect(boardSchema.safeParse(Array(9).fill(null)).success).toBe(true);
    expect(boardSchema.safeParse(Array(8).fill(null)).success).toBe(false);
    expect(boardSchema.safeParse(['X', 'O', 'Z', null, null, null, null, null, null]).success).toBe(
      false,
    );
  });

  it('accepts ISO timestamps with offsets', () => {
    expect(isoDateTimeSchema.safeParse('2026-10-24T10:00:00.000Z').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('2026-10-24T10:00:00+02:00').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('yesterday').success).toBe(false);
  });
});

describe('session and game requests', () => {
  it('validates session requests after normalizing the name', () => {
    const result = sessionRequestSchema.parse({ displayName: '  Ada   Lovelace ' });

    expect(result.displayName).toBe('Ada Lovelace');
    expect(sessionRequestSchema.safeParse({ displayName: 'A' }).success).toBe(false);
  });

  it('validates single-player game requests', () => {
    expect(createGameRequestSchema.parse({ mode: 'single', difficulty: 'hard' })).toEqual({
      mode: 'single',
      difficulty: 'hard',
    });
    expect(createGameRequestSchema.safeParse({ mode: 'single' }).success).toBe(false);
  });

  it('defaults multiplayer visibility to private', () => {
    expect(createGameRequestSchema.parse({ mode: 'multi' })).toEqual({
      mode: 'multi',
      visibility: 'private',
    });
    expect(createGameRequestSchema.parse({ mode: 'multi', visibility: 'public' })).toEqual({
      mode: 'multi',
      visibility: 'public',
    });
  });

  it('validates move requests', () => {
    const move = {
      gameId,
      cell: 4,
      expectedVersion: 2,
    };

    expect(moveRequestSchema.parse(move)).toEqual(move);
    expect(moveRequestSchema.safeParse({ ...move, cell: 9 }).success).toBe(false);
    expect(moveRequestSchema.safeParse({ ...move, expectedVersion: -1 }).success).toBe(false);
    expect(moveRequestSchema.safeParse({ ...move, gameId: 'not-a-uuid' }).success).toBe(false);

    expect(moveBodySchema.parse({ cell: 4, expectedVersion: 2 })).toEqual({
      cell: 4,
      expectedVersion: 2,
    });
    expect(moveBodySchema.safeParse({ cell: 4 }).success).toBe(false);
  });
});

describe('game snapshots and details', () => {
  it('validates a complete snapshot', () => {
    const result = gameSnapshotSchema.parse(snapshot);

    expect(result.code).toBe('ABC234');
    expect(result.board).toEqual(['X', null, null, null, 'O', null, null, null, null]);
  });

  it('rejects snapshots with malformed boards or lines', () => {
    expect(
      gameSnapshotSchema.safeParse({
        ...snapshot,
        board: ['X', null],
      }).success,
    ).toBe(false);

    expect(
      gameSnapshotSchema.safeParse({
        ...snapshot,
        winningLine: [0, 1],
      }).success,
    ).toBe(false);
  });

  it('validates game response envelopes', () => {
    expect(gameResponseSchema.parse({ game: snapshot }).game.id).toBe(gameId);
    expect(gameResponseSchema.safeParse({ game: { id: gameId } }).success).toBe(false);
  });

  it('validates game details with moves', () => {
    const detail = {
      ...snapshot,
      moves: [
        {
          moveNumber: 1,
          cell: 0,
          symbol: 'X',
          playerId: playerX.id,
          createdAt: '2026-10-24T10:00:30.000Z',
        },
        {
          moveNumber: 2,
          cell: 4,
          symbol: 'O',
          playerId: playerO.id,
          createdAt: '2026-10-24T10:00:35.000Z',
        },
      ],
    };

    expect(gameDetailSchema.parse(detail).moves).toHaveLength(2);
    expect(gameDetailSchema.safeParse({ ...detail, moves: [{ moveNumber: 0 }] }).success).toBe(
      false,
    );
  });
});

describe('queries and errors', () => {
  it('coerces pagination and applies defaults', () => {
    expect(gameListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(gameListQuerySchema.parse({ page: '3', pageSize: '10', mode: 'multi' })).toEqual({
      page: 3,
      pageSize: 10,
      mode: 'multi',
    });
    expect(gameListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(gameListQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
  });

  it('coerces leaderboard limits', () => {
    expect(leaderboardQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(leaderboardQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('validates error envelopes', () => {
    expect(
      apiErrorSchema.parse({
        error: { code: 'NOT_YOUR_TURN', message: 'Wait for your turn.' },
      }),
    ).toBeDefined();

    expect(
      apiErrorSchema.safeParse({
        error: { code: 'NOT_REAL', message: 'Nope.' },
      }).success,
    ).toBe(false);
  });

  it('validates socket acknowledgements and realtime payloads', () => {
    expect(socketAckSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(
      socketAckSchema.parse({
        ok: false,
        error: { code: 'STALE_STATE', message: 'Refresh and try again.' },
      }),
    ).toMatchObject({ ok: false });
    expect(socketAckSchema.safeParse({ ok: false, error: { code: 'NOPE' } }).success).toBe(false);

    expect(gamePresenceSchema.parse({ gameId, playerId: playerX.id, online: true })).toEqual({
      gameId,
      playerId: playerX.id,
      online: true,
    });
    expect(rematchStartedSchema.parse({ gameId, code: 'ABC234' })).toEqual({
      gameId,
      code: 'ABC234',
    });
  });

  it('validates completed-game analytics events', () => {
    expect(
      analyticsGameCompletedSchema.parse({
        gameId,
        mode: 'multi',
        winner: 'draw',
        finishedAt: '2026-10-24T10:05:00.000Z',
      }),
    ).toMatchObject({ gameId, winner: 'draw' });
    expect(
      analyticsGameCompletedSchema.safeParse({
        gameId,
        mode: 'multi',
        winner: 'draw',
        finishedAt: 'yesterday',
      }).success,
    ).toBe(false);
  });

  it('exposes stable socket event names and leaderboard defaults', () => {
    expect(SOCKET_EVENTS.GAME_SUBSCRIBE).toBe('game:subscribe');
    expect(SOCKET_EVENTS.GAME_MOVE).toBe('game:move');
    expect(SOCKET_EVENTS.GAME_UPDATE).toBe('game:update');
    expect(SOCKET_EVENTS.GAME_REMATCH_STARTED).toBe('game:rematch-started');
    expect(SOCKET_EVENTS.CURSOR_MOVE).toBe('cursor:move');
    expect(SOCKET_EVENTS.CURSOR_SUBSCRIBE).toBe('cursor:subscribe');
    expect(SOCKET_EVENTS.CURSOR_DOT).toBe('cursor:dot');
    expect(SOCKET_EVENTS.CURSOR_LEAVE).toBe('cursor:leave');
    expect(DEFAULT_LEADERBOARD_MINIMUM_GAMES).toBe(5);
  });
});

describe('cursor contracts', () => {
  const streamId = '44444444-4444-4444-8444-444444444444';
  const move = {
    gameId,
    streamId,
    x: 0.25,
    y: 0.75,
    seq: 1,
    sentAt: '2026-10-24T10:00:00.000Z',
  };

  it('accepts normalized coordinates inside the stage', () => {
    expect(cursorSubscribeRequestSchema.parse({ gameId })).toEqual({ gameId });
    expect(cursorMoveRequestSchema.parse(move)).toEqual(move);
    expect(cursorMoveEventSchema.parse({ ...move, playerId: playerX.id })).toMatchObject({
      playerId: playerX.id,
      x: 0.25,
      y: 0.75,
    });
  });

  it('rejects out-of-range coordinates, negative sequence numbers, and bad ids', () => {
    expect(cursorMoveRequestSchema.safeParse({ ...move, x: -0.01 }).success).toBe(false);
    expect(cursorMoveRequestSchema.safeParse({ ...move, y: 1.01 }).success).toBe(false);
    expect(cursorMoveRequestSchema.safeParse({ ...move, seq: -1 }).success).toBe(false);
    expect(cursorMoveRequestSchema.safeParse({ ...move, seq: 1.5 }).success).toBe(false);
    expect(cursorMoveRequestSchema.safeParse({ ...move, streamId: 'nope' }).success).toBe(false);
    expect(cursorMoveRequestSchema.safeParse({ ...move, sentAt: 'yesterday' }).success).toBe(false);
  });

  it('validates cursor dots and config responses', () => {
    expect(
      cursorDotSchema.parse({
        ...move,
        playerId: playerX.id,
        emittedAt: '2026-10-24T10:00:00.050Z',
      }),
    ).toMatchObject({ emittedAt: '2026-10-24T10:00:00.050Z' });
    expect(
      appConfigResponseSchema.parse({ cursor: { enabled: true, path: '/cursor.io' } }),
    ).toEqual({ cursor: { enabled: true, path: '/cursor.io' } });
    expect(appConfigResponseSchema.safeParse({ cursor: { enabled: true, path: '' } }).success).toBe(
      false,
    );
  });
});
