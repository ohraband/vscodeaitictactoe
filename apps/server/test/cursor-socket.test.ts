import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import {
  SOCKET_EVENTS,
  type CursorClientToServerEvents,
  type CursorDot,
  type CursorLeave,
  type CursorServerToClientEvents,
  type SocketAck,
} from '@ttt/contracts';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createCursorServer, type CursorServer } from '../src/cursor/server.js';
import {
  createRoom,
  createTestContext,
  createTestSession,
  describeWithDatabase,
  joinRoom,
  resetDatabase,
  type TestContext,
  type TestSession,
} from './support/database.js';

type TestSocket = ClientSocket<CursorServerToClientEvents, CursorClientToServerEvents>;

const WAIT_MS = 3_000;
const streamId = '44444444-4444-4444-8444-444444444444';

function waitForEvent<T>(
  socket: TestSocket,
  event: 'cursor:dot' | 'cursor:leave',
  predicate: (payload: T) => boolean,
  timeoutMs = WAIT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;

      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(payload);
    };

    socket.on(event, handler as never);
  });
}

async function openCursorSocket(baseUrl: string, cookie: string): Promise<TestSocket> {
  const socket: TestSocket = connect(baseUrl, {
    path: '/cursor.io',
    transports: ['websocket'],
    extraHeaders: { cookie },
    reconnection: false,
    forceNew: true,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out connecting the cursor socket.'));
    }, WAIT_MS);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

async function subscribe(socket: TestSocket, gameId: string): Promise<SocketAck> {
  return socket.timeout(WAIT_MS).emitWithAck(SOCKET_EVENTS.CURSOR_SUBSCRIBE, { gameId });
}

function serverUrl(httpServer: HttpServer): string {
  const address = httpServer.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected the cursor server to listen on a TCP port.');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function startMultiplayerGame(
  context: TestContext,
  ada: TestSession,
  grace: TestSession,
): Promise<string> {
  const room = await createRoom(context.app, ada.cookie);
  const response = await joinRoom(context.app, grace.cookie, room.code);

  expect(response.statusCode).toBe(200);

  return room.id;
}

describeWithDatabase('cursor socket server', () => {
  let context: TestContext;
  let httpServer: HttpServer;
  let cursorServer: CursorServer;
  let baseUrl: string;
  const clients: TestSocket[] = [];

  beforeAll(async () => {
    context = await createTestContext();
    httpServer = createServer();
    cursorServer = await createCursorServer({
      httpServer,
      prisma: context.prisma,
      config: {
        path: '/cursor.io',
        sessionSecret: context.config.sessionSecret,
        redisUrl: null,
        socketPingIntervalMs: 30_000,
        socketPingTimeoutMs: 30_000,
      },
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', () => {
        httpServer.off('error', reject);
        resolve();
      });
    });

    baseUrl = serverUrl(httpServer);
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();

    clients.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  afterAll(async () => {
    await cursorServer.close();
    await context.app.close();
    await context.prisma.$disconnect();
  });

  async function client(cookie: string): Promise<TestSocket> {
    const socket = await openCursorSocket(baseUrl, cookie);

    clients.push(socket);

    return socket;
  }

  it('authenticates the handshake', async () => {
    await expect(openCursorSocket(baseUrl, 'ttt_session=invalid')).rejects.toMatchObject({
      message: 'UNAUTHORIZED',
    });
  });

  it('allows only game participants to subscribe', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const stranger = await createTestSession(context.app, 'Katherine Johnson');
    const gameId = await startMultiplayerGame(context, ada, grace);
    const strangerSocket = await client(stranger.cookie);
    const adaSocket = await client(ada.cookie);

    await expect(subscribe(strangerSocket, gameId)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_PARTICIPANT' },
    });
    await expect(subscribe(adaSocket, gameId)).resolves.toEqual({ ok: true });
    await expect(subscribe(adaSocket, randomUUID())).resolves.toMatchObject({
      ok: false,
      error: { code: 'GAME_NOT_FOUND' },
    });
  });

  it('emits dots to subscribed players in the game room', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const gameId = await startMultiplayerGame(context, ada, grace);
    const adaSocket = await client(ada.cookie);
    const graceSocket = await client(grace.cookie);

    await subscribe(adaSocket, gameId);
    await subscribe(graceSocket, gameId);

    const dot: CursorDot = {
      gameId,
      playerId: ada.player.id,
      streamId,
      x: 0.25,
      y: 0.75,
      seq: 3,
      sentAt: '2026-10-24T10:00:00.000Z',
      emittedAt: '2026-10-24T10:00:00.050Z',
    };
    const received = waitForEvent<CursorDot>(
      graceSocket,
      'cursor:dot',
      (payload) => payload.playerId === ada.player.id,
    );

    cursorServer.emitDot(dot);

    await expect(received).resolves.toEqual(dot);
  });

  it('emits leave only when the last socket for a player disconnects', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const gameId = await startMultiplayerGame(context, ada, grace);
    const adaFirst = await client(ada.cookie);
    const adaSecond = await client(ada.cookie);
    const graceSocket = await client(grace.cookie);

    await subscribe(adaFirst, gameId);
    await subscribe(adaSecond, gameId);
    await subscribe(graceSocket, gameId);

    const leave = waitForEvent<CursorLeave>(
      graceSocket,
      'cursor:leave',
      (payload) => payload.playerId === ada.player.id,
    );

    adaFirst.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));

    let left = false;

    leave.then(
      () => {
        left = true;
      },
      () => undefined,
    );

    expect(left).toBe(false);

    adaSecond.disconnect();

    await expect(leave).resolves.toMatchObject({ gameId, playerId: ada.player.id });
  });
});
