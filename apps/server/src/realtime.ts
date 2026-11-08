import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { PrismaClient } from '@prisma/client';
import {
  SOCKET_EVENTS,
  cursorMoveRequestSchema,
  leaveGameRequestSchema,
  moveRequestSchema,
  rematchRequestSchema,
  subscribeGameRequestSchema,
  type ClientToServerEvents,
  type GameSnapshot,
  type ServerToClientEvents,
  type SocketAck,
  type SocketAckHandler,
} from '@ttt/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { createClient, type RedisClientType } from 'redis';
import { Server, type DefaultEventsMap, type Socket } from 'socket.io';
import type { ServerConfig } from './config.js';
import { noopCursorPublisher, type CursorPublisher } from './cursor/publisher.js';
import { HttpError } from './errors.js';
import type { GamePublisher } from './game/publisher.js';
import type { GameService } from './game/service.js';
import type { Metrics } from './metrics.js';
import { ActionWindow, SOCKET_ACTION_LIMIT_WINDOW_MS } from './rate-limit.js';
import { isAllowedHandshakeOrigin, sessionPlayerId } from './socket-auth.js';
import { parseInput } from './validation.js';

export const SOCKET_CURSOR_LIMIT_MAX = 250;

interface SocketData {
  playerId: string;
  games: Record<string, readonly string[]>;
  actionWindow: ActionWindow;
  cursorWindow: ActionWindow;
}

type RealtimeIo = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

export interface RealtimeServerOptions {
  readonly httpServer: HttpServer;
  readonly prisma: PrismaClient;
  readonly config: ServerConfig;
  readonly gameService: GameService;
  readonly logger: FastifyBaseLogger;
  readonly metrics?: Metrics;
  readonly cursorPublisher?: CursorPublisher;
}

export type RealtimeServerFactory = (options: RealtimeServerOptions) => Promise<RealtimeServer>;

function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

function participantIds(game: GameSnapshot): readonly string[] {
  return game.playerO ? [game.playerX.id, game.playerO.id] : [game.playerX.id];
}

function closeIo(io: RealtimeIo): Promise<void> {
  return new Promise((resolve) => {
    io.close(() => resolve());
  });
}

export class RealtimeServer implements GamePublisher {
  private readonly io: RealtimeIo;
  private readonly prisma: PrismaClient;
  private readonly config: ServerConfig;
  private readonly gameService: GameService;
  private readonly logger: FastifyBaseLogger;
  private readonly metrics: Metrics | undefined;
  private readonly cursorPublisher: CursorPublisher;
  private readonly publisher: RedisClientType | null;
  private readonly subscriber: RedisClientType | null;
  private closed = false;

  constructor(
    io: RealtimeIo,
    options: {
      readonly prisma: PrismaClient;
      readonly config: ServerConfig;
      readonly gameService: GameService;
      readonly logger: FastifyBaseLogger;
      readonly metrics?: Metrics;
      readonly cursorPublisher?: CursorPublisher;
      readonly publisher: RedisClientType | null;
      readonly subscriber: RedisClientType | null;
    },
  ) {
    this.io = io;
    this.prisma = options.prisma;
    this.config = options.config;
    this.gameService = options.gameService;
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.cursorPublisher = options.cursorPublisher ?? noopCursorPublisher;
    this.publisher = options.publisher;
    this.subscriber = options.subscriber;

    this.installHandshake();
    this.installHandlers();
  }

  notifyGame(game: GameSnapshot): void {
    this.io.to(gameRoom(game.id)).emit(SOCKET_EVENTS.GAME_UPDATE, { game });
  }

  notifyMutation(game: GameSnapshot, previousGameId: string): void {
    if (game.id === previousGameId) {
      this.notifyGame(game);
      return;
    }

    this.io.to(gameRoom(previousGameId)).emit(SOCKET_EVENTS.GAME_REMATCH_STARTED, {
      gameId: game.id,
      code: game.code,
    });
  }

  async notifyGameById(gameId: string): Promise<void> {
    try {
      const game = await this.gameService.getGameSnapshot(gameId);

      this.notifyGame(game);
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 404) {
        this.logger.warn({ gameId }, 'game update skipped for missing game');
        return;
      }

      throw error;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.publisher) {
      return true;
    }

    try {
      await this.publisher.ping();
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'redis readiness check failed');
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;
    this.io.disconnectSockets(true);
    await closeIo(this.io);
    await Promise.allSettled([this.publisher?.close(), this.subscriber?.close()]);
  }

  private installHandshake(): void {
    this.io.use(async (socket, next) => {
      if (!isAllowedHandshakeOrigin(socket.handshake.headers)) {
        this.logger.warn(
          {
            socketId: socket.id,
            origin: socket.handshake.headers.origin,
            host: socket.handshake.headers.host,
          },
          'socket handshake rejected: origin mismatch',
        );
        next(new Error('FORBIDDEN'));
        return;
      }

      const playerId = sessionPlayerId(socket.handshake.headers, this.config.sessionSecret);

      if (!playerId) {
        this.logger.warn(
          { socketId: socket.id, hasCookie: Boolean(socket.handshake.headers.cookie) },
          'socket handshake rejected: invalid session',
        );
        next(new Error('UNAUTHORIZED'));
        return;
      }

      try {
        const player = await this.prisma.player.findUnique({
          where: { id: playerId },
          select: { id: true },
        });

        if (!player) {
          next(new Error('UNAUTHORIZED'));
          return;
        }

        socket.data.playerId = player.id;
        socket.data.games = {};
        socket.data.actionWindow = new ActionWindow();
        socket.data.cursorWindow = new ActionWindow(
          SOCKET_CURSOR_LIMIT_MAX,
          SOCKET_ACTION_LIMIT_WINDOW_MS,
        );
        next();
      } catch (error) {
        this.logger.error({ err: error, socketId: socket.id }, 'socket authentication failed');
        next(new Error('INTERNAL_ERROR'));
      }
    });
  }

  private installHandlers(): void {
    this.io.on('connection', (socket) => {
      const playerId = socket.data.playerId;

      this.metrics?.activeSockets.inc();
      this.logger.info({ socketId: socket.id, playerId }, 'socket connected');

      socket.on(SOCKET_EVENTS.GAME_SUBSCRIBE, (request, ack) => {
        void this.runAction(socket, 'game:subscribe', ack, async () => {
          const input = parseInput(subscribeGameRequestSchema, request);
          const authorizedGame = await this.gameService.getGame(input.gameId, playerId);
          const room = gameRoom(authorizedGame.id);

          await socket.join(room);

          const game = await this.gameService.getGameSnapshot(input.gameId);
          const participants = participantIds(game);

          socket.data.games[game.id] = participants;
          socket.emit(SOCKET_EVENTS.GAME_SNAPSHOT, { game });
          await this.publishPresence(game.id, participants);
        });
      });

      socket.on(SOCKET_EVENTS.GAME_MOVE, (request, ack) => {
        void this.runAction(socket, 'game:move', ack, async () => {
          const input = parseInput(moveRequestSchema, request);
          const game = await this.gameService.playMove({
            gameId: input.gameId,
            playerId,
            cell: input.cell,
            expectedVersion: input.expectedVersion,
          });

          this.notifyGame(game);
        });
      });

      socket.on(SOCKET_EVENTS.GAME_LEAVE, (request, ack) => {
        void this.runAction(socket, 'game:leave', ack, async () => {
          const input = parseInput(leaveGameRequestSchema, request);
          const game = await this.gameService.leaveGame(input.gameId, playerId);
          const participants = participantIds(game);

          this.notifyGame(game);
          await socket.leave(gameRoom(game.id));
          delete socket.data.games[game.id];
          await this.publishPresence(game.id, participants);
        });
      });

      socket.on(SOCKET_EVENTS.GAME_REMATCH, (request, ack) => {
        void this.runAction(socket, 'game:rematch', ack, async () => {
          const input = parseInput(rematchRequestSchema, request);
          const game = await this.gameService.requestRematch(input.gameId, playerId);

          this.notifyMutation(game, input.gameId);
        });
      });

      socket.on(SOCKET_EVENTS.CURSOR_MOVE, (request) => {
        this.handleCursorMove(socket, request);
      });

      socket.on('disconnect', (reason) => {
        this.metrics?.activeSockets.dec();
        this.logger.info({ socketId: socket.id, playerId, reason }, 'socket disconnected');

        if (this.closed) return;

        void this.publishDisconnectPresence(socket);
      });
    });
  }

  private handleCursorMove(socket: RealtimeSocket, request: unknown): void {
    if (!socket.data.cursorWindow.allow()) {
      this.metrics?.cursorDropped.inc();
      return;
    }

    const parsed = cursorMoveRequestSchema.safeParse(request);

    if (!parsed.success || !(parsed.data.gameId in socket.data.games)) {
      this.metrics?.cursorDropped.inc();
      return;
    }

    this.cursorPublisher.publishMove({
      ...parsed.data,
      playerId: socket.data.playerId,
    });
  }

  private async runAction(
    socket: RealtimeSocket,
    action: string,
    ack: SocketAckHandler,
    run: () => Promise<void>,
  ): Promise<void> {
    if (!socket.data.actionWindow.allow()) {
      this.logger.warn(
        { action, socketId: socket.id, playerId: socket.data.playerId },
        'socket action rate limited',
      );
      this.respond(ack, {
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many actions. Slow down and try again.' },
      });
      return;
    }

    const startedAt = Date.now();

    try {
      await run();
      this.respond(ack, { ok: true });
      this.logger.info(
        {
          action,
          socketId: socket.id,
          playerId: socket.data.playerId,
          durationMs: Date.now() - startedAt,
        },
        'socket action accepted',
      );
    } catch (error) {
      if (error instanceof HttpError) {
        this.logger.warn(
          {
            action,
            socketId: socket.id,
            playerId: socket.data.playerId,
            code: error.code,
          },
          'socket action rejected',
        );
        this.respond(ack, {
          ok: false,
          error: { code: error.code, message: error.message },
        });
        return;
      }

      this.logger.error(
        { err: error, action, socketId: socket.id, playerId: socket.data.playerId },
        'socket action failed',
      );
      this.respond(ack, {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      });
    }
  }

  private respond(ack: SocketAckHandler | undefined, result: SocketAck): void {
    if (typeof ack === 'function') {
      ack(result);
    }
  }

  private async publishPresence(gameId: string, participants: readonly string[]): Promise<void> {
    const sockets = await this.io.in(gameRoom(gameId)).fetchSockets();
    const online = new Set(sockets.map((socket) => socket.data.playerId));

    for (const playerId of participants) {
      this.io.to(gameRoom(gameId)).emit(SOCKET_EVENTS.GAME_PRESENCE, {
        gameId,
        playerId,
        online: online.has(playerId),
      });
    }
  }

  private async publishDisconnectPresence(socket: RealtimeSocket): Promise<void> {
    const games = Object.entries(socket.data.games);

    socket.data.games = {};

    for (const [gameId, participants] of games) {
      try {
        await this.publishPresence(gameId, participants);
      } catch (error) {
        this.logger.error({ err: error, gameId }, 'presence update failed');
      }
    }
  }
}

export async function createRealtimeServer(
  options: RealtimeServerOptions,
): Promise<RealtimeServer> {
  const io: RealtimeIo = new Server(options.httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: options.config.socketPingIntervalMs,
    pingTimeout: options.config.socketPingTimeoutMs,
  });
  let publisher: RedisClientType | null = null;
  let subscriber: RedisClientType | null = null;

  if (options.config.redisUrl) {
    publisher = createClient({ url: options.config.redisUrl });
    subscriber = publisher.duplicate();
    publisher.on('error', (error) => {
      options.logger.error({ err: error }, 'redis publisher error');
    });
    subscriber.on('error', (error) => {
      options.logger.error({ err: error }, 'redis subscriber error');
    });

    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
      io.adapter(createAdapter(publisher, subscriber));
    } catch (error) {
      publisher.destroy();
      subscriber.destroy();
      await closeIo(io);
      throw error;
    }
  }

  return new RealtimeServer(io, {
    prisma: options.prisma,
    config: options.config,
    gameService: options.gameService,
    logger: options.logger,
    ...(options.metrics ? { metrics: options.metrics } : {}),
    ...(options.cursorPublisher ? { cursorPublisher: options.cursorPublisher } : {}),
    publisher,
    subscriber,
  });
}
