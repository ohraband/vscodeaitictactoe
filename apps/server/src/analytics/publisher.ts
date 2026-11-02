import type { FastifyBaseLogger } from 'fastify';
import { Kafka, logLevel, type Producer } from 'kafkajs';
import { analyticsGameCompletedSchema, type AnalyticsGameCompleted } from '@ttt/contracts';
import type { KafkaConfig } from '../config.js';

export interface AnalyticsPublisher {
  publishGameCompleted(event: AnalyticsGameCompleted): void;
  close(): Promise<void>;
}

export const noopAnalyticsPublisher: AnalyticsPublisher = {
  publishGameCompleted: () => undefined,
  close: async () => undefined,
};

export function createAnalyticsPublisher(options: {
  readonly kafka: KafkaConfig | null;
  readonly logger: FastifyBaseLogger;
}): AnalyticsPublisher {
  const { kafka, logger } = options;

  if (!kafka) {
    return noopAnalyticsPublisher;
  }

  const kafkaConfig = kafka;
  const client = new Kafka({
    clientId: kafkaConfig.clientId,
    brokers: kafkaConfig.brokers,
    logLevel: logLevel.ERROR,
  });
  let producer: Producer | null = null;
  let connecting: Promise<void> | null = null;
  let closing = false;

  async function connect(): Promise<void> {
    if (producer || closing) return;

    const candidate = client.producer({ allowAutoTopicCreation: true });

    try {
      await candidate.connect();
    } catch (error) {
      await candidate.disconnect().catch(() => undefined);
      throw error;
    }

    if (closing) {
      await candidate.disconnect().catch(() => undefined);
      return;
    }

    producer = candidate;
  }

  async function publish(event: AnalyticsGameCompleted): Promise<void> {
    try {
      if (!producer) {
        connecting ??= connect().finally(() => {
          connecting = null;
        });
        await connecting;
      }

      if (!producer) return;

      await producer.send({
        topic: kafkaConfig.topic,
        messages: [
          {
            key: event.gameId,
            value: JSON.stringify(event),
          },
        ],
      });
    } catch (error) {
      logger.warn(
        { err: error, gameId: event.gameId },
        'analytics event publish failed; gameplay was unaffected',
      );

      const failed = producer;

      producer = null;

      if (failed) {
        await failed.disconnect().catch(() => undefined);
      }
    }
  }

  return {
    publishGameCompleted: (event) => {
      if (closing) return;

      const parsed = analyticsGameCompletedSchema.safeParse(event);

      if (!parsed.success) {
        logger.warn({ event }, 'analytics event was invalid and was not published');
        return;
      }

      void publish(parsed.data);
    },
    close: async () => {
      closing = true;

      const current = producer;

      producer = null;

      if (current) {
        await current.disconnect().catch(() => undefined);
      }
    },
  };
}
