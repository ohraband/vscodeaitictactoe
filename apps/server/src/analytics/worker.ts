import 'dotenv/config';
import { Kafka, logLevel } from 'kafkajs';
import { loadConfig } from '../config.js';
import { createPrismaClient } from '../db.js';
import { ingestGameCompleted, InvalidAnalyticsEventError } from './ingest.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const kafkaConfig = config.kafka;

  if (!kafkaConfig) {
    throw new Error('KAFKA_BROKERS is required to run the analytics worker.');
  }

  const kafka = new Kafka({
    clientId: `${kafkaConfig.clientId}-worker`,
    brokers: kafkaConfig.brokers,
    logLevel: logLevel.ERROR,
  });
  const consumer = kafka.consumer({ groupId: kafkaConfig.groupId });
  const prisma = createPrismaClient(config.databaseUrl);
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;

    shuttingDown = true;
    console.info(JSON.stringify({ level: 'info', signal, message: 'analytics worker stopping' }));

    try {
      await consumer.disconnect();
      await prisma.$disconnect();
    } catch (error) {
      console.error(
        JSON.stringify({ level: 'error', message: 'analytics worker shutdown failed', error }),
      );
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await consumer.connect();
  await consumer.subscribe({ topic: kafkaConfig.topic, fromBeginning: false });
  console.info(
    JSON.stringify({
      level: 'info',
      topic: kafkaConfig.topic,
      groupId: kafkaConfig.groupId,
      message: 'analytics worker started',
    }),
  );

  try {
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          await ingestGameCompleted(prisma, message.value);
        } catch (error) {
          if (!(error instanceof InvalidAnalyticsEventError)) {
            throw error;
          }

          console.warn(
            JSON.stringify({
              level: 'warn',
              key: message.key?.toString(),
              message: 'discarding invalid analytics event',
              error: error.message,
            }),
          );
        }
      },
    });
  } catch (error) {
    if (!shuttingDown) throw error;
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ level: 'error', message: 'analytics worker failed', error }));
  process.exitCode = 1;
});
