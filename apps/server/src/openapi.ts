import {
  apiErrorSchema,
  createGameRequestSchema,
  gameDetailResponseSchema,
  gameListResponseSchema,
  gameResponseSchema,
  joinGameRequestSchema,
  leaderboardResponseSchema,
  moveBodySchema,
  playerSchema,
  renameRequestSchema,
  sessionRequestSchema,
  sessionResponseSchema,
} from '@ttt/contracts';
import type { OpenAPIV3 } from 'openapi-types';
import { z, type ZodType } from 'zod';

type JsonSchema = Record<string, unknown>;

function schemaOf(schema: ZodType, io: 'input' | 'output' = 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io });

  return Object.fromEntries(Object.entries(json).filter(([key]) => key !== '$schema'));
}

function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonBody(schema: JsonSchema): JsonSchema {
  return {
    required: true,
    content: {
      'application/json': { schema },
    },
  };
}

function response(description: string, schema?: JsonSchema): JsonSchema {
  return {
    description,
    ...(schema
      ? {
          content: {
            'application/json': { schema },
          },
        }
      : {}),
  };
}

function errorResponses(...codes: Array<'400' | '401' | '403' | '404' | '409' | '429' | '500'>) {
  const descriptions = {
    '400': 'Invalid request.',
    '401': 'Authentication required.',
    '403': 'Request forbidden.',
    '404': 'Resource not found.',
    '409': 'Request conflicts with the current state.',
    '429': 'Rate limit exceeded.',
    '500': 'Internal server error.',
  } as const;

  return Object.fromEntries(
    codes.map((code) => [code, response(descriptions[code], ref('ApiError'))]),
  );
}

const gameIdParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'TTT API',
    version: '0.1.0',
    description:
      'REST API for guest sessions, multiplayer and solo games, history, and leaderboards. WebSocket gameplay uses socket.io at /socket.io.',
  },
  servers: [{ url: '/', description: 'Current origin' }],
  tags: [
    { name: 'Session', description: 'Guest identity' },
    { name: 'Games', description: 'Gameplay and history' },
    { name: 'Leaderboard', description: 'Public multiplayer rankings' },
    { name: 'Operations', description: 'Health, metrics, and diagnostics' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'ttt_session',
      },
    },
    schemas: {
      Player: schemaOf(playerSchema),
      SessionRequest: schemaOf(sessionRequestSchema, 'input'),
      SessionResponse: schemaOf(sessionResponseSchema),
      RenameRequest: schemaOf(renameRequestSchema, 'input'),
      ApiError: schemaOf(apiErrorSchema),
      CreateGameRequest: schemaOf(createGameRequestSchema, 'input'),
      JoinGameRequest: schemaOf(joinGameRequestSchema, 'input'),
      MoveBody: schemaOf(moveBodySchema, 'input'),
      GameResponse: schemaOf(gameResponseSchema),
      GameListResponse: schemaOf(gameListResponseSchema),
      GameDetailResponse: schemaOf(gameDetailResponseSchema),
      LeaderboardResponse: schemaOf(leaderboardResponseSchema),
      HealthLive: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['ok'] } },
      },
      HealthReady: {
        type: 'object',
        required: ['status', 'checks'],
        properties: {
          status: { type: 'string', enum: ['ok', 'unavailable'] },
          checks: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
  },
  paths: {
    '/api/session': {
      post: {
        tags: ['Session'],
        summary: 'Create a guest session',
        operationId: 'createSession',
        requestBody: jsonBody(ref('SessionRequest')),
        responses: {
          201: response('Session created.', ref('SessionResponse')),
          ...errorResponses('400', '429', '500'),
        },
      },
    },
    '/api/me': {
      get: {
        tags: ['Session'],
        summary: 'Get the current player',
        operationId: 'getCurrentPlayer',
        security: [{ cookieAuth: [] }],
        responses: {
          200: response('Current player.', ref('SessionResponse')),
          ...errorResponses('401', '500'),
        },
      },
      patch: {
        tags: ['Session'],
        summary: 'Rename the current player',
        operationId: 'renameCurrentPlayer',
        security: [{ cookieAuth: [] }],
        requestBody: jsonBody(ref('RenameRequest')),
        responses: {
          200: response('Player renamed.', ref('SessionResponse')),
          ...errorResponses('400', '401', '409', '429', '500'),
        },
      },
    },
    '/api/games': {
      post: {
        tags: ['Games'],
        summary: 'Create a solo or multiplayer game',
        operationId: 'createGame',
        security: [{ cookieAuth: [] }],
        requestBody: jsonBody(ref('CreateGameRequest')),
        responses: {
          201: response('Game created.', ref('GameResponse')),
          ...errorResponses('400', '401', '429', '500'),
        },
      },
      get: {
        tags: ['Games'],
        summary: 'List the current player’s games',
        operationId: 'listGames',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: 'mode',
            in: 'query',
            schema: { type: 'string', enum: ['single', 'multi'] },
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['waiting', 'active', 'finished', 'abandoned'] },
          },
        ],
        responses: {
          200: response('Game page.', ref('GameListResponse')),
          ...errorResponses('400', '401', '500'),
        },
      },
    },
    '/api/games/join': {
      post: {
        tags: ['Games'],
        summary: 'Join a multiplayer room by code',
        operationId: 'joinGame',
        security: [{ cookieAuth: [] }],
        requestBody: jsonBody(ref('JoinGameRequest')),
        responses: {
          200: response('Game joined.', ref('GameResponse')),
          ...errorResponses('400', '401', '404', '409', '429', '500'),
        },
      },
    },
    '/api/games/quick-match': {
      post: {
        tags: ['Games'],
        summary: 'Find or create a public multiplayer game',
        operationId: 'quickMatch',
        security: [{ cookieAuth: [] }],
        responses: {
          200: response('Matched or waiting game.', ref('GameResponse')),
          ...errorResponses('401', '429', '500'),
        },
      },
    },
    '/api/games/{id}': {
      get: {
        tags: ['Games'],
        summary: 'Get a game and its moves',
        operationId: 'getGame',
        security: [{ cookieAuth: [] }],
        parameters: [gameIdParameter],
        responses: {
          200: response('Game detail.', ref('GameDetailResponse')),
          ...errorResponses('401', '403', '404', '500'),
        },
      },
    },
    '/api/games/{id}/moves': {
      post: {
        tags: ['Games'],
        summary: 'Play a move',
        operationId: 'playMove',
        security: [{ cookieAuth: [] }],
        parameters: [gameIdParameter],
        requestBody: jsonBody(ref('MoveBody')),
        responses: {
          200: response('Move accepted.', ref('GameResponse')),
          ...errorResponses('400', '401', '403', '404', '409', '429', '500'),
        },
      },
    },
    '/api/games/{id}/leave': {
      post: {
        tags: ['Games'],
        summary: 'Leave or forfeit a game',
        operationId: 'leaveGame',
        security: [{ cookieAuth: [] }],
        parameters: [gameIdParameter],
        responses: {
          200: response('Game state after leaving.', ref('GameResponse')),
          ...errorResponses('401', '403', '404', '429', '500'),
        },
      },
    },
    '/api/games/{id}/rematch': {
      post: {
        tags: ['Games'],
        summary: 'Request or start a rematch',
        operationId: 'requestRematch',
        security: [{ cookieAuth: [] }],
        parameters: [gameIdParameter],
        responses: {
          200: response('Rematch state.', ref('GameResponse')),
          ...errorResponses('400', '401', '403', '404', '409', '429', '500'),
        },
      },
    },
    '/api/leaderboard': {
      get: {
        tags: ['Leaderboard'],
        summary: 'Get the multiplayer leaderboard',
        operationId: 'getLeaderboard',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        ],
        responses: {
          200: response('Leaderboard entries.', ref('LeaderboardResponse')),
          ...errorResponses('400', '500'),
        },
      },
    },
    '/api/health/live': {
      get: {
        tags: ['Operations'],
        summary: 'Liveness check',
        operationId: 'healthLive',
        responses: {
          200: response('Process is alive.', ref('HealthLive')),
        },
      },
    },
    '/api/health/ready': {
      get: {
        tags: ['Operations'],
        summary: 'Readiness check',
        operationId: 'healthReady',
        responses: {
          200: response('Dependencies are ready.', ref('HealthReady')),
          503: response('A dependency is unavailable or shutdown is draining.', ref('HealthReady')),
        },
      },
    },
    '/api/metrics': {
      get: {
        tags: ['Operations'],
        summary: 'Prometheus metrics',
        operationId: 'getMetrics',
        responses: {
          200: {
            description: 'Prometheus text exposition format.',
            content: {
              'text/plain': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as unknown as OpenAPIV3.Document;
