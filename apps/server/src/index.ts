import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrismaClient } from './db.js';
import { GameSweeper } from './game/sweeper.js';
import { createRealtimeServer } from './realtime.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);
  const app = await buildApp({ config, prisma, realtimeFactory: createRealtimeServer });
  const sweeper = new GameSweeper({
    prisma,
    onGameUpdated: (gameId) => app.realtime.notifyGameById(gameId),
    metrics: app.metrics,
    analytics: app.analytics,
  });
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.lifecycle.shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    sweeper.stop();

    try {
      await app.close();
      await prisma.$disconnect();
    } catch (error) {
      app.log.error({ err: error }, 'graceful shutdown failed');
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
    await app.listen({ host: config.host, port: config.port });
    sweeper.start(app.log);
  } catch (error) {
    app.log.error({ err: error }, 'server failed to start');
    sweeper.stop();
    await prisma.$disconnect();
    process.exitCode = 1;
  }
}

void main();
