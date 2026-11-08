import 'dotenv/config';
import { createServer, type Server as HttpServer } from 'node:http';
import type { CursorMoveEvent } from '@ttt/contracts';
import { Kafka, logLevel } from 'kafkajs';
import { loadConfig } from '../config.js';
import { createPrismaClient } from '../db.js';
import { createMetrics } from '../metrics.js';
import { CursorSequenceTracker, parseCursorMessage } from './ingest.js';
import { createCursorServer, type CursorServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const cursor = config.cursor;

  if (!cursor) {
    console.info(
      JSON.stringify({
        level: 'info',
        message: 'cursor consumer disabled; set CURSOR_ENABLED=true and KAFKA_BROKERS',
      }),
    );
    return;
  }

  const metrics = createMetrics(`${config.metricsReplicaId}-cursor`);
  const prisma = createPrismaClient(config.databaseUrl);
  const kafka = new Kafka({
    clientId: `${cursor.clientId}-viewer`,
    brokers: cursor.brokers,
    logLevel: logLevel.ERROR,
  });
  const consumer = kafka.consumer({ groupId: cursor.groupId });
  const tracker = new CursorSequenceTracker();
  let kafkaReady = false;
  let shuttingDown = false;
  let cursorServer: CursorServer | null = null;

  const isReady = async (): Promise<boolean> => {
    const server = cursorServer;

    if (shuttingDown || !kafkaReady || !server) return false;

    const dbReady = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

    if (!dbReady) return false;

    return server.pingRedis();
  };

  const httpServer: HttpServer = createServer((request, response) => {
    void (async () => {
      if (request.url === '/health/live') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (request.url === '/health/ready') {
        const ready = await isReady();

        response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: ready ? 'ok' : 'unavailable' }));
        return;
      }

      if (request.url === '/metrics') {
        const body = await metrics.registry.metrics();

        response.writeHead(200, { 'content-type': metrics.registry.contentType });
        response.end(body);
        return;
      }

      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    })();
  });

  cursorServer = await createCursorServer({
    httpServer,
    prisma,
    config: {
      path: cursor.path,
      sessionSecret: config.sessionSecret,
      redisUrl: config.redisUrl,
      socketPingIntervalMs: config.socketPingIntervalMs,
      socketPingTimeoutMs: config.socketPingTimeoutMs,
    },
    onRedisError: (error) => {
      console.error(JSON.stringify({ level: 'error', message: 'cursor redis error', error }));
    },
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;

    shuttingDown = true;
    kafkaReady = false;
    console.info(JSON.stringify({ level: 'info', signal, message: 'cursor consumer stopping' }));

    try {
      await consumer.disconnect();
      await cursorServer?.close();
      await prisma.$disconnect();
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'cursor shutdown failed', error }));
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    await consumer.connect();
    await consumer.subscribe({ topic: cursor.topic, fromBeginning: false });
    kafkaReady = true;

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(cursor.port, config.host, () => {
        httpServer.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    kafkaReady = false;
    await Promise.allSettled([consumer.disconnect(), cursorServer?.close(), prisma.$disconnect()]);
    throw error;
  }

  console.info(
    JSON.stringify({
      level: 'info',
      topic: cursor.topic,
      groupId: cursor.groupId,
      port: cursor.port,
      path: cursor.path,
      message: 'cursor consumer started',
    }),
  );

  try {
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value || !cursorServer) return;

        let event: CursorMoveEvent;

        try {
          event = parseCursorMessage(message.value);
        } catch (error) {
          metrics.cursorDropped.inc();
          console.warn(
            JSON.stringify({
              level: 'warn',
              key: message.key?.toString(),
              message: 'discarding invalid cursor event',
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          return;
        }

        if (!tracker.isNew(event)) {
          metrics.cursorDropped.inc();
          return;
        }

        const emittedAt = new Date();
        const sentAt = Date.parse(event.sentAt);

        if (Number.isFinite(sentAt)) {
          metrics.cursorLatency.observe(Math.max(0, emittedAt.getTime() - sentAt) / 1_000);
        }

        metrics.cursorConsumed.inc();
        cursorServer.emitDot({
          ...event,
          emittedAt: emittedAt.toISOString(),
        });
      },
    });
  } catch (error) {
    if (!shuttingDown) throw error;
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ level: 'error', message: 'cursor consumer failed', error }));
  process.exitCode = 1;
});
