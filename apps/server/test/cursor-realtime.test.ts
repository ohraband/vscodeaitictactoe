import { randomUUID } from 'node:crypto';
import {
  SOCKET_EVENTS,
  gameResponseSchema,
  type ClientToServerEvents,
  type CursorMoveEvent,
  type ServerToClientEvents,
  type SocketAck,
} from '@ttt/contracts';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { CursorPublisher } from '../src/cursor/publisher.js';
import { createRealtimeServer, SOCKET_CURSOR_LIMIT_MAX } from '../src/realtime.js';
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

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const WAIT_MS = 3_000;
const streamId = '44444444-4444-4444-8444-444444444444';

function cursorEvent(
  gameId: string,
  overrides: Partial<Omit<CursorMoveEvent, 'playerId'>> = {},
): Omit<CursorMoveEvent, 'playerId'> {
  return {
    gameId,
    streamId,
    x: 0.4,
    y: 0.6,
    seq: 1,
    sentAt: new Date().toISOString(),
    ...overrides,
  };
}

function waitFor(condition: () => boolean, timeoutMs = WAIT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (condition()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for cursor events.'));
      }
    }, 10);
  });
}

async function openSocket(baseUrl: string, cookie: string): Promise<TestSocket> {
  const socket: TestSocket = connect(baseUrl, {
    transports: ['websocket'],
    extraHeaders: { cookie },
    reconnection: false,
    forceNew: true,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out connecting the socket.'));
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

async function subscribe(socket: TestSocket, gameId: string): Promise<void> {
  const ack: SocketAck = await socket
    .timeout(WAIT_MS)
    .emitWithAck(SOCKET_EVENTS.GAME_SUBSCRIBE, { gameId });

  expect(ack).toEqual({ ok: true });
}

async function startMultiplayerGame(
  context: TestContext,
  ada: TestSession,
  grace: TestSession,
): Promise<string> {
  const room = await createRoom(context.app, ada.cookie);
  const response = await joinRoom(context.app, grace.cookie, room.code);

  expect(response.statusCode).toBe(200);

  return gameResponseSchema.parse(response.json()).game.id;
}

function serverUrl(context: TestContext): string {
  const address = context.app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected the test server to listen on a TCP port.');
  }

  return `http://127.0.0.1:${address.port}`;
}

describeWithDatabase('cursor realtime ingest', () => {
  let context: TestContext;
  let baseUrl: string;
  const clients: TestSocket[] = [];
  const published: CursorMoveEvent[] = [];
  const cursorPublisher: CursorPublisher = {
    publishMove: (event) => published.push(event),
    close: async () => undefined,
  };

  beforeAll(async () => {
    context = await createTestContext({
      realtimeFactory: createRealtimeServer,
      cursorPublisher,
    });
    await context.app.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = serverUrl(context);
  });

  beforeEach(async () => {
    published.length = 0;
    await resetDatabase(context.prisma);
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();

    clients.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  afterAll(async () => {
    await context.app.close();
    await context.prisma.$disconnect();
  });

  async function client(cookie: string): Promise<TestSocket> {
    const socket = await openSocket(baseUrl, cookie);

    clients.push(socket);

    return socket;
  }

  it('publishes moves only after the player subscribes to the game', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const gameId = await startMultiplayerGame(context, ada, grace);
    const socket = await client(ada.cookie);

    socket.emit(SOCKET_EVENTS.CURSOR_MOVE, cursorEvent(gameId));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(published).toHaveLength(0);

    await subscribe(socket, gameId);
    socket.emit(SOCKET_EVENTS.CURSOR_MOVE, cursorEvent(gameId, { seq: 2 }));

    await waitFor(() => published.length === 1);

    expect(published[0]).toMatchObject({
      gameId,
      playerId: ada.player.id,
      x: 0.4,
      y: 0.6,
      seq: 2,
    });
  });

  it('drops invalid coordinates, unknown games, and non-participants', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const stranger = await createTestSession(context.app, 'Katherine Johnson');
    const gameId = await startMultiplayerGame(context, ada, grace);
    const socket = await client(ada.cookie);
    const strangerSocket = await client(stranger.cookie);

    await subscribe(socket, gameId);

    socket.emit(SOCKET_EVENTS.CURSOR_MOVE, cursorEvent(gameId, { x: 1.5 }));
    socket.emit(SOCKET_EVENTS.CURSOR_MOVE, cursorEvent(gameId, { gameId: randomUUID() }));
    strangerSocket.emit(SOCKET_EVENTS.CURSOR_MOVE, cursorEvent(gameId));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(published).toHaveLength(0);
  });

  it('rate limits cursor movement events', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const gameId = await startMultiplayerGame(context, ada, grace);
    const socket = await client(ada.cookie);

    await subscribe(socket, gameId);

    for (let index = 0; index < SOCKET_CURSOR_LIMIT_MAX + 1; index += 1) {
      socket.emit(SOCKET_EVENTS.CURSOR_MOVE, cursorEvent(gameId, { seq: index + 1 }));
    }

    await waitFor(() => published.length >= SOCKET_CURSOR_LIMIT_MAX);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(published).toHaveLength(SOCKET_CURSOR_LIMIT_MAX);
  });
});
