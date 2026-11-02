import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  gameDetailResponseSchema,
  gameResponseSchema,
  sessionResponseSchema,
  type GameDetailResponse,
  type GameSnapshot,
  type PublicPlayer,
} from '@ttt/contracts';
import type { FastifyInstance } from 'fastify';
import { describe } from 'vitest';
import type { AnalyticsPublisher } from '../../src/analytics/publisher.js';
import { buildApp } from '../../src/app.js';
import type { ServerConfig } from '../../src/config.js';
import type { RealtimeServerFactory } from '../../src/realtime.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

export function describeWithDatabase(name: string, define: () => void): void {
  if (databaseUrl) {
    describe(name, define);
    return;
  }

  describe.skip(name, define);
}

export interface TestResponse {
  readonly statusCode: number;
  readonly body: string;
  json(): unknown;
}

export interface TestContext {
  readonly app: FastifyInstance;
  readonly prisma: PrismaClient;
  readonly config: ServerConfig;
}

export interface TestSession {
  readonly player: PublicPlayer;
  readonly cookie: string;
}

export function createTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    nodeEnv: 'test',
    isProduction: false,
    host: '127.0.0.1',
    port: 0,
    databaseUrl: databaseUrl ?? 'postgresql://invalid',
    sessionSecret: 'integration-test-secret-with-enough-length',
    sessionTtlDays: 30,
    turnSeconds: 60,
    redisUrl: null,
    logLevel: 'silent',
    rateLimitEnabled: false,
    cspUpgradeInsecureRequests: false,
    sessionCookieSecure: false,
    metricsReplicaId: 'test-replica',
    kafka: null,
    ...overrides,
  };
}

export async function createTestContext(
  options: {
    readonly turnSeconds?: number;
    readonly realtimeFactory?: RealtimeServerFactory;
    readonly analyticsPublisher?: AnalyticsPublisher;
    readonly config?: Partial<ServerConfig>;
  } = {},
): Promise<TestContext> {
  const overrides: Partial<ServerConfig> = { ...options.config };

  if (options.turnSeconds !== undefined) {
    overrides.turnSeconds = options.turnSeconds;
  }
  const config = createTestConfig(overrides);
  const poolMax = process.env.TEST_DATABASE_POOL_MAX;
  const adapter = new PrismaPg({
    connectionString: config.databaseUrl,
    ...(poolMax ? { max: Number(poolMax) } : {}),
  });
  const prisma = new PrismaClient({ adapter });
  const app = await buildApp({
    config,
    prisma,
    ...(options.realtimeFactory ? { realtimeFactory: options.realtimeFactory } : {}),
    ...(options.analyticsPublisher ? { analyticsPublisher: options.analyticsPublisher } : {}),
  });

  await app.ready();

  return { app, prisma, config };
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.move.deleteMany();
  await prisma.game.deleteMany();
  await prisma.analyticsGameCompleted.deleteMany();
  await prisma.player.deleteMany();
}

export async function createTestSession(
  app: FastifyInstance,
  displayName: string,
): Promise<TestSession> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { displayName },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Could not create a test session: ${response.statusCode} ${response.body}`);
  }

  const body = sessionResponseSchema.parse(response.json());
  const raw = response.headers['set-cookie'];
  const setCookie = Array.isArray(raw) ? raw[0] : raw;

  if (typeof setCookie !== 'string') {
    throw new Error('Expected a session cookie.');
  }

  const cookie = setCookie.split(';')[0];

  if (!cookie) {
    throw new Error('Expected a session cookie value.');
  }

  return { player: body.player, cookie };
}

export async function createRoom(
  app: FastifyInstance,
  cookie: string,
  visibility: 'private' | 'public' = 'private',
): Promise<GameSnapshot> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/games',
    headers: { cookie },
    payload: { mode: 'multi', visibility },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Could not create a room: ${response.statusCode} ${response.body}`);
  }

  return gameResponseSchema.parse(response.json()).game;
}

export async function createSoloGame(
  app: FastifyInstance,
  cookie: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'hard',
): Promise<GameSnapshot> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/games',
    headers: { cookie },
    payload: { mode: 'single', difficulty },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Could not create a solo game: ${response.statusCode} ${response.body}`);
  }

  return gameResponseSchema.parse(response.json()).game;
}

export function joinRoom(
  app: FastifyInstance,
  cookie: string,
  code: string,
): Promise<TestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/games/join',
    headers: { cookie },
    payload: { code },
  });
}

export function playCell(
  app: FastifyInstance,
  cookie: string,
  gameId: string,
  cell: number,
  expectedVersion: number,
): Promise<TestResponse> {
  return app.inject({
    method: 'POST',
    url: `/api/games/${gameId}/moves`,
    headers: { cookie },
    payload: { cell, expectedVersion },
  });
}

export function getGame(
  app: FastifyInstance,
  cookie: string,
  gameId: string,
): Promise<TestResponse> {
  return app.inject({
    method: 'GET',
    url: `/api/games/${gameId}`,
    headers: { cookie },
  });
}

export async function getGameDetail(
  app: FastifyInstance,
  cookie: string,
  gameId: string,
): Promise<GameDetailResponse> {
  const response = await getGame(app, cookie, gameId);

  if (response.statusCode !== 200) {
    throw new Error(`Could not load game detail: ${response.statusCode} ${response.body}`);
  }

  return gameDetailResponseSchema.parse(response.json());
}

export async function seedPlayer(prisma: PrismaClient, displayName: string) {
  return prisma.player.create({
    data: {
      displayName,
      displayNameNormalized: displayName.toLocaleLowerCase('en-US'),
    },
  });
}

export interface SeedGameInput {
  readonly playerXId: string;
  readonly playerOId?: string | null;
  readonly mode?: 'SINGLE' | 'MULTI';
  readonly status?: 'WAITING' | 'ACTIVE' | 'FINISHED' | 'ABANDONED';
  readonly winner?: 'X' | 'O' | 'DRAW' | null;
  readonly createdAt?: Date;
}

export async function seedGame(prisma: PrismaClient, input: SeedGameInput): Promise<string> {
  const id = randomUUID();
  const status = input.status ?? 'FINISHED';
  const mode = input.mode ?? 'MULTI';
  const winner = input.winner ?? null;
  const finished = status === 'FINISHED' || status === 'ABANDONED';
  const now = new Date();

  await prisma.game.create({
    data: {
      id,
      code: id.replaceAll('-', '').slice(0, 6).toUpperCase(),
      mode,
      visibility: 'PRIVATE',
      status,
      winner,
      finishReason: finished
        ? winner === 'DRAW'
          ? 'DRAW'
          : winner === null
            ? 'ABANDONED'
            : 'LINE'
        : null,
      board: '.........',
      turn: 'X',
      playerXId: input.playerXId,
      playerOId: input.playerOId ?? null,
      version: 4,
      startedAt: now,
      finishedAt: finished ? now : null,
      createdAt: input.createdAt ?? now,
    },
  });

  return id;
}
