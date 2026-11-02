import {
  SOCKET_EVENTS,
  gameResponseSchema,
  type ClientToServerEvents,
  type GamePresence,
  type GameSnapshot,
  type GameUpdate,
  type RematchStarted,
  type ServerToClientEvents,
  type SocketAck,
} from '@ttt/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { GameSweeper } from '../src/game/sweeper.js';
import { createRealtimeServer } from '../src/realtime.js';
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

function waitForUpdate(
  socket: TestSocket,
  predicate: (game: GameSnapshot) => boolean,
  timeoutMs = WAIT_MS,
): Promise<GameSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(SOCKET_EVENTS.GAME_UPDATE, handler);
      reject(new Error('Timed out waiting for a game update.'));
    }, timeoutMs);
    const handler = (update: GameUpdate) => {
      if (!predicate(update.game)) return;

      clearTimeout(timer);
      socket.off(SOCKET_EVENTS.GAME_UPDATE, handler);
      resolve(update.game);
    };

    socket.on(SOCKET_EVENTS.GAME_UPDATE, handler);
  });
}

function waitForSnapshot(
  socket: TestSocket,
  predicate: (game: GameSnapshot) => boolean,
  timeoutMs = WAIT_MS,
): Promise<GameSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(SOCKET_EVENTS.GAME_SNAPSHOT, handler);
      reject(new Error('Timed out waiting for a game snapshot.'));
    }, timeoutMs);
    const handler = (update: GameUpdate) => {
      if (!predicate(update.game)) return;

      clearTimeout(timer);
      socket.off(SOCKET_EVENTS.GAME_SNAPSHOT, handler);
      resolve(update.game);
    };

    socket.on(SOCKET_EVENTS.GAME_SNAPSHOT, handler);
  });
}

function waitForPresence(
  socket: TestSocket,
  predicate: (presence: GamePresence) => boolean,
  timeoutMs = WAIT_MS,
): Promise<GamePresence> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(SOCKET_EVENTS.GAME_PRESENCE, handler);
      reject(new Error('Timed out waiting for a presence update.'));
    }, timeoutMs);
    const handler = (presence: GamePresence) => {
      if (!predicate(presence)) return;

      clearTimeout(timer);
      socket.off(SOCKET_EVENTS.GAME_PRESENCE, handler);
      resolve(presence);
    };

    socket.on(SOCKET_EVENTS.GAME_PRESENCE, handler);
  });
}

function waitForRematch(socket: TestSocket, timeoutMs = WAIT_MS): Promise<RematchStarted> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(SOCKET_EVENTS.GAME_REMATCH_STARTED, handler);
      reject(new Error('Timed out waiting for a rematch.'));
    }, timeoutMs);
    const handler = (rematch: RematchStarted) => {
      clearTimeout(timer);
      socket.off(SOCKET_EVENTS.GAME_REMATCH_STARTED, handler);
      resolve(rematch);
    };

    socket.on(SOCKET_EVENTS.GAME_REMATCH_STARTED, handler);
  });
}

async function openSocket(baseUrl: string, cookie: string, origin = baseUrl): Promise<TestSocket> {
  const socket: TestSocket = connect(baseUrl, {
    transports: ['websocket'],
    extraHeaders: { cookie, origin },
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

function failedSocket(
  baseUrl: string,
  headers: { cookie?: string; origin?: string },
): Promise<string> {
  const socket: TestSocket = connect(baseUrl, {
    transports: ['websocket'],
    extraHeaders: headers,
    reconnection: false,
    forceNew: true,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for the socket rejection.'));
    }, WAIT_MS);

    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      resolve(error.message);
    });
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error('Expected the socket connection to fail.'));
    });
  });
}

async function subscribe(socket: TestSocket, gameId: string): Promise<void> {
  const ack: SocketAck = await socket
    .timeout(WAIT_MS)
    .emitWithAck(SOCKET_EVENTS.GAME_SUBSCRIBE, { gameId });

  expect(ack).toEqual({ ok: true });
}

function move(
  socket: TestSocket,
  gameId: string,
  cell: number,
  expectedVersion: number,
): Promise<SocketAck> {
  return socket.timeout(WAIT_MS).emitWithAck(SOCKET_EVENTS.GAME_MOVE, {
    gameId,
    cell,
    expectedVersion,
  });
}

async function startMultiplayerGame(
  context: TestContext,
  ada: TestSession,
  grace: TestSession,
): Promise<GameSnapshot> {
  const room = await createRoom(context.app, ada.cookie);
  const response = await joinRoom(context.app, grace.cookie, room.code);

  expect(response.statusCode).toBe(200);

  return gameResponseSchema.parse(response.json()).game;
}

function serverUrl(context: TestContext): string {
  const address = context.app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected the test server to listen on a TCP port.');
  }

  return `http://127.0.0.1:${address.port}`;
}

describeWithDatabase('realtime', () => {
  let context: TestContext;
  let baseUrl: string;
  const clients: TestSocket[] = [];

  beforeAll(async () => {
    context = await createTestContext({ realtimeFactory: createRealtimeServer });
    await context.app.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = serverUrl(context);
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
  });

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect();
    }

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

  it('authenticates the handshake and validates origins', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');

    await expect(failedSocket(baseUrl, {})).resolves.toBe('UNAUTHORIZED');
    await expect(failedSocket(baseUrl, { cookie: 'ttt_session=invalid' })).resolves.toBe(
      'UNAUTHORIZED',
    );
    await expect(
      failedSocket(baseUrl, { cookie: ada.cookie, origin: 'https://evil.example' }),
    ).resolves.toBe('FORBIDDEN');

    const socket = await client(ada.cookie);

    expect(socket.connected).toBe(true);
  });

  it('broadcasts joins, moves, presence, and typed move rejections', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const room = await createRoom(context.app, ada.cookie);
    const adaSocket = await client(ada.cookie);

    await subscribe(adaSocket, room.id);

    const activeUpdate = waitForUpdate(
      adaSocket,
      (game) => game.id === room.id && game.status === 'active',
    );
    const joinedResponse = await joinRoom(context.app, grace.cookie, room.code);

    expect(joinedResponse.statusCode).toBe(200);

    const active = gameResponseSchema.parse(joinedResponse.json()).game;
    const broadcast = await activeUpdate;

    expect(broadcast.version).toBe(active.version);
    expect(broadcast.playerO?.id).toBe(grace.player.id);

    const graceSocket = await client(grace.cookie);
    const graceSeesAda = waitForPresence(
      graceSocket,
      (presence) => presence.playerId === ada.player.id && presence.online,
    );
    const adaSeesGrace = waitForPresence(
      adaSocket,
      (presence) => presence.playerId === grace.player.id && presence.online,
    );

    await subscribe(graceSocket, active.id);
    await Promise.all([graceSeesAda, adaSeesGrace]);

    const stranger = await createTestSession(context.app, 'Katherine Johnson');
    const strangerSocket = await client(stranger.cookie);

    await expect(
      strangerSocket
        .timeout(WAIT_MS)
        .emitWithAck(SOCKET_EVENTS.GAME_SUBSCRIBE, { gameId: active.id }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_PARTICIPANT' },
    });

    const adaUpdate = waitForUpdate(adaSocket, (game) => game.version === active.version + 1);
    const graceUpdate = waitForUpdate(graceSocket, (game) => game.version === active.version + 1);
    const accepted = await move(adaSocket, active.id, 0, active.version);

    expect(accepted).toEqual({ ok: true });

    const [adaGame, graceGame] = await Promise.all([adaUpdate, graceUpdate]);

    expect(adaGame.board[0]).toBe('X');
    expect(adaGame.turn).toBe('O');
    expect(graceGame.board).toEqual(adaGame.board);

    await expect(move(graceSocket, active.id, 0, active.version + 1)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CELL_TAKEN' },
    });
    await expect(move(graceSocket, active.id, 4, 0)).resolves.toMatchObject({
      ok: false,
      error: { code: 'STALE_STATE' },
    });
    await expect(move(adaSocket, active.id, 1, active.version + 1)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });

    const graceAcceptedUpdate = waitForUpdate(
      graceSocket,
      (game) => game.version === active.version + 2,
    );

    await expect(move(graceSocket, active.id, 4, active.version + 1)).resolves.toEqual({
      ok: true,
    });

    expect((await graceAcceptedUpdate).board[4]).toBe('O');
  });

  it('restores the snapshot after reconnecting and reports presence changes', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const game = await startMultiplayerGame(context, ada, grace);
    const adaSocket = await client(ada.cookie);
    const graceSocket = await client(grace.cookie);

    await subscribe(adaSocket, game.id);
    await subscribe(graceSocket, game.id);

    const movedUpdate = waitForUpdate(graceSocket, (snapshot) => snapshot.version === 2);

    await expect(move(adaSocket, game.id, 0, game.version)).resolves.toEqual({ ok: true });
    await movedUpdate;

    const offline = waitForPresence(
      graceSocket,
      (presence) => presence.playerId === ada.player.id && !presence.online,
    );

    adaSocket.disconnect();
    await offline;

    const reconnected = await client(ada.cookie);
    const snapshot = waitForSnapshot(reconnected, (gameSnapshot) => gameSnapshot.board[0] === 'X');
    const online = waitForPresence(
      graceSocket,
      (presence) => presence.playerId === ada.player.id && presence.online,
    );

    await subscribe(reconnected, game.id);

    expect((await snapshot).version).toBe(2);
    await online;
  });

  it('forfeits on socket leave and broadcasts the final state', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const game = await startMultiplayerGame(context, ada, grace);
    const adaSocket = await client(ada.cookie);
    const graceSocket = await client(grace.cookie);

    await subscribe(adaSocket, game.id);
    await subscribe(graceSocket, game.id);

    const forfeitUpdate = waitForUpdate(adaSocket, (snapshot) => snapshot.status === 'finished');
    const graceOffline = waitForPresence(
      adaSocket,
      (presence) => presence.playerId === grace.player.id && !presence.online,
    );
    const ack: SocketAck = await graceSocket
      .timeout(WAIT_MS)
      .emitWithAck(SOCKET_EVENTS.GAME_LEAVE, { gameId: game.id });

    expect(ack).toEqual({ ok: true });
    expect(await forfeitUpdate).toMatchObject({
      status: 'finished',
      winner: 'X',
      finishReason: 'forfeit',
    });
    await graceOffline;
  });

  it('broadcasts rematch votes and notifies both players when a rematch starts', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const game = await startMultiplayerGame(context, ada, grace);
    const adaSocket = await client(ada.cookie);
    const graceSocket = await client(grace.cookie);

    await subscribe(adaSocket, game.id);
    await subscribe(graceSocket, game.id);

    let version = game.version;

    for (const [socket, cell] of [
      [adaSocket, 0],
      [graceSocket, 3],
      [adaSocket, 1],
      [graceSocket, 4],
    ] as const) {
      await expect(move(socket, game.id, cell, version)).resolves.toEqual({ ok: true });
      version += 1;
    }

    const finishedUpdate = waitForUpdate(graceSocket, (snapshot) => snapshot.status === 'finished');

    await expect(move(adaSocket, game.id, 2, version)).resolves.toEqual({ ok: true });

    const finished = await finishedUpdate;

    expect(finished.winner).toBe('X');
    await expect(move(adaSocket, game.id, 8, finished.version)).resolves.toMatchObject({
      ok: false,
      error: { code: 'GAME_FINISHED' },
    });

    const adaVote = waitForUpdate(
      adaSocket,
      (snapshot) => snapshot.id === game.id && snapshot.rematchRequestedByX,
    );
    const graceVote = waitForUpdate(
      graceSocket,
      (snapshot) => snapshot.id === game.id && snapshot.rematchRequestedByX,
    );

    await expect(
      adaSocket.timeout(WAIT_MS).emitWithAck(SOCKET_EVENTS.GAME_REMATCH, { gameId: game.id }),
    ).resolves.toEqual({ ok: true });

    await Promise.all([adaVote, graceVote]);

    const adaStarted = waitForRematch(adaSocket);
    const graceStarted = waitForRematch(graceSocket);

    await expect(
      graceSocket.timeout(WAIT_MS).emitWithAck(SOCKET_EVENTS.GAME_REMATCH, { gameId: game.id }),
    ).resolves.toEqual({ ok: true });

    const [adaRematch, graceRematch] = await Promise.all([adaStarted, graceStarted]);

    expect(adaRematch).toEqual(graceRematch);
    expect(adaRematch.gameId).not.toBe(game.id);

    const adaSnapshot = waitForSnapshot(adaSocket, (snapshot) => snapshot.id === adaRematch.gameId);
    const graceSnapshot = waitForSnapshot(
      graceSocket,
      (snapshot) => snapshot.id === adaRematch.gameId,
    );

    await subscribe(adaSocket, adaRematch.gameId);
    await subscribe(graceSocket, adaRematch.gameId);

    const [adaNewGame, graceNewGame] = await Promise.all([adaSnapshot, graceSnapshot]);

    expect(adaNewGame).toMatchObject({
      status: 'active',
      version: 0,
      turn: 'X',
      board: Array(9).fill(null),
      playerX: { id: grace.player.id },
      playerO: { id: ada.player.id },
    });
    expect(graceNewGame.id).toBe(adaNewGame.id);
  });

  it('broadcasts timeout forfeits from the sweeper', async () => {
    const ada = await createTestSession(context.app, 'Ada Lovelace');
    const grace = await createTestSession(context.app, 'Grace Hopper');
    const game = await startMultiplayerGame(context, ada, grace);
    const adaSocket = await client(ada.cookie);
    const graceSocket = await client(grace.cookie);

    await subscribe(adaSocket, game.id);
    await subscribe(graceSocket, game.id);

    await context.prisma.game.update({
      where: { id: game.id },
      data: { turnDeadline: new Date(Date.now() - 60_000) },
    });

    const adaTimeout = waitForUpdate(adaSocket, (snapshot) => snapshot.status === 'finished');
    const graceTimeout = waitForUpdate(graceSocket, (snapshot) => snapshot.status === 'finished');
    const sweeper = new GameSweeper({
      prisma: context.prisma,
      onGameUpdated: (gameId) => context.app.realtime.notifyGameById(gameId),
    });

    await expect(sweeper.sweep(new Date())).resolves.toEqual({ timedOut: 1, abandoned: 0 });

    const [adaFinal, graceFinal] = await Promise.all([adaTimeout, graceTimeout]);

    expect(adaFinal).toMatchObject({
      status: 'finished',
      winner: 'O',
      finishReason: 'timeout',
      turnDeadline: null,
    });
    expect(graceFinal.version).toBe(adaFinal.version);
  });
});
