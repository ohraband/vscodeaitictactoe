import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { PrismaClient } from '@prisma/client';
import {
  SOCKET_EVENTS,
  cursorDotSchema,
  cursorSubscribeRequestSchema,
  type CursorClientToServerEvents,
  type CursorDot,
  type CursorLeave,
  type CursorServerToClientEvents,
  type ErrorCode,
  type SocketAck,
  type SocketAckHandler,
} from '@ttt/contracts';
import { createClient, type RedisClientType } from 'redis';
import { Server, type DefaultEventsMap, type Socket } from 'socket.io';
import { HttpError } from '../errors.js';
import { ActionWindow, SOCKET_ACTION_LIMIT_WINDOW_MS } from '../rate-limit.js';
import { isAllowedHandshakeOrigin, sessionPlayerId } from '../socket-auth.js';
import { parseInput } from '../validation.js';

const CURSOR_SUBSCRIBE_LIMIT_MAX = 30;

interface CursorSocketData {
  playerId: string;
  games: Set<string>;
  subscribeWindow: ActionWindow;
}

type CursorIo = Server<
  CursorClientToServerEvents,
  CursorServerToClientEvents,
  DefaultEventsMap,
  CursorSocketData
>;

type CursorSocket = Socket<
  CursorClientToServerEvents,
  CursorServerToClientEvents,
  DefaultEventsMap,
  CursorSocketData
>;

export interface CursorSocketConfig {
  readonly path: string;
  readonly sessionSecret: string;
  readonly redisUrl: string | null;
  readonly socketPingIntervalMs: number;
  readonly socketPingTimeoutMs: number;
}

export interface CursorServerOptions {
  readonly httpServer: HttpServer;
  readonly prisma: PrismaClient;
  readonly config: CursorSocketConfig;
  readonly onRedisError?: (error: Error) => void;
}

export interface CursorServer {
  emitDot(dot: CursorDot): void;
  emitLeave(leave: CursorLeave): void;
  pingRedis(): Promise<boolean>;
  close(): Promise<void>;
}

function cursorRoom(gameId: string): string {
  return `cursor:${gameId}`;
}

function respond(ack: SocketAckHandler | undefined, result: SocketAck): void {
  if (typeof ack === 'function') {
    ack(result);
  }
}

function reject(ack: SocketAckHandler | undefined, code: ErrorCode, message: string): void {
  respond(ack, { ok: false, error: { code, message } });
}

async function isParticipant(
  prisma: PrismaClient,
  gameId: string,
  playerId: string,
): Promise<'ok' | 'missing' | 'forbidden'> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { playerXId: true, playerOId: true },
  });

  if (!game) return 'missing';
  if (game.playerXId !== playerId && game.playerOId !== playerId) return 'forbidden';

  return 'ok';
}

function closeIo(io: CursorIo): Promise<void> {
  return new Promise((resolve) => {
    io.close(() => resolve());
  });
}

export async function createCursorServer(options: CursorServerOptions): Promise<CursorServer> {
  const { httpServer, prisma, config, onRedisError } = options;
  const io: CursorIo = new Server(httpServer, {
    path: config.path,
    serveClient: false,
    maxHttpBufferSize: 8 * 1024,
    pingInterval: config.socketPingIntervalMs,
    pingTimeout: config.socketPingTimeoutMs,
  });
  let redisPublisher: RedisClientType | null = null;
  let redisSubscriber: RedisClientType | null = null;
  let closed = false;

  if (config.redisUrl) {
    redisPublisher = createClient({ url: config.redisUrl });
    redisSubscriber = redisPublisher.duplicate();

    const reportRedisError = (error: Error) => {
      onRedisError?.(error);
    };

    redisPublisher.on('error', reportRedisError);
    redisSubscriber.on('error', reportRedisError);

    try {
      await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);
      io.adapter(createAdapter(redisPublisher, redisSubscriber));
    } catch (error) {
      redisPublisher.destroy();
      redisSubscriber.destroy();
      await closeIo(io);
      throw error;
    }
  }

  io.use(async (socket, next) => {
    if (!isAllowedHandshakeOrigin(socket.handshake.headers)) {
      next(new Error('FORBIDDEN'));
      return;
    }

    const playerId = sessionPlayerId(socket.handshake.headers, config.sessionSecret);

    if (!playerId) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true },
      });

      if (!player) {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      socket.data.playerId = player.id;
      socket.data.games = new Set();
      socket.data.subscribeWindow = new ActionWindow(
        CURSOR_SUBSCRIBE_LIMIT_MAX,
        SOCKET_ACTION_LIMIT_WINDOW_MS,
      );
      next();
    } catch {
      next(new Error('INTERNAL_ERROR'));
    }
  });

  const handleDisconnect = async (socket: CursorSocket): Promise<void> => {
    const games = [...socket.data.games];

    socket.data.games.clear();

    if (closed) return;

    for (const gameId of games) {
      try {
        const remaining = await io.in(cursorRoom(gameId)).fetchSockets();

        if (remaining.some((candidate) => candidate.data.playerId === socket.data.playerId)) {
          continue;
        }

        io.to(cursorRoom(gameId)).emit(SOCKET_EVENTS.CURSOR_LEAVE, {
          gameId,
          playerId: socket.data.playerId,
        });
      } catch (error) {
        onRedisError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  io.on('connection', (socket: CursorSocket) => {
    socket.on(SOCKET_EVENTS.CURSOR_SUBSCRIBE, (request, ack) => {
      if (!socket.data.subscribeWindow.allow()) {
        reject(ack, 'RATE_LIMITED', 'Too many cursor subscriptions. Slow down and try again.');
        return;
      }

      void (async () => {
        let input;

        try {
          input = parseInput(cursorSubscribeRequestSchema, request);
        } catch (error) {
          if (error instanceof HttpError) {
            reject(ack, error.code, error.message);
            return;
          }
          reject(ack, 'INVALID_REQUEST', 'Invalid cursor subscription.');
          return;
        }

        try {
          const membership = await isParticipant(prisma, input.gameId, socket.data.playerId);

          if (membership === 'missing') {
            reject(ack, 'GAME_NOT_FOUND', 'Game not found.');
            return;
          }

          if (membership === 'forbidden') {
            reject(ack, 'NOT_PARTICIPANT', 'You are not part of this game.');
            return;
          }

          await socket.join(cursorRoom(input.gameId));
          socket.data.games.add(input.gameId);
          respond(ack, { ok: true });
        } catch {
          respond(ack, {
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: 'Could not subscribe to cursors.' },
          });
        }
      })();
    });

    socket.on('disconnect', () => {
      void handleDisconnect(socket);
    });
  });

  return {
    emitDot: (dot) => {
      if (closed) return;

      io.to(cursorRoom(dot.gameId)).emit(SOCKET_EVENTS.CURSOR_DOT, cursorDotSchema.parse(dot));
    },
    emitLeave: (leave) => {
      if (closed) return;

      io.to(cursorRoom(leave.gameId)).emit(SOCKET_EVENTS.CURSOR_LEAVE, leave);
    },
    pingRedis: async () => {
      if (!redisPublisher) return true;

      try {
        await redisPublisher.ping();
        return true;
      } catch {
        return false;
      }
    },
    close: async () => {
      if (closed) return;

      closed = true;
      io.disconnectSockets(true);
      await closeIo(io);
      await Promise.allSettled([redisPublisher?.close(), redisSubscriber?.close()]);
    },
  };
}
