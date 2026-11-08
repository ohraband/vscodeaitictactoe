import type { FastifyBaseLogger } from 'fastify';
import { Kafka, logLevel } from 'kafkajs';
import { cursorMoveEventSchema, type CursorMoveEvent } from '@ttt/contracts';
import type { CursorConfig } from '../config.js';
import type { Metrics } from '../metrics.js';

export const CURSOR_COALESCE_MS = 40;
export const CURSOR_MAX_PENDING = 2_000;

export interface CursorProducer {
  connect(): Promise<void>;
  send(message: {
    readonly topic: string;
    readonly messages: readonly { readonly key: string; readonly value: string }[];
  }): Promise<void>;
  disconnect(): Promise<void>;
}

export type CursorProducerFactory = () => CursorProducer;

export interface CursorPublisher {
  publishMove(event: CursorMoveEvent): void;
  close(): Promise<void>;
}

export const noopCursorPublisher: CursorPublisher = {
  publishMove: () => undefined,
  close: async () => undefined,
};

function kafkaProducerFactory(cursor: CursorConfig): CursorProducerFactory {
  const client = new Kafka({
    clientId: cursor.clientId,
    brokers: cursor.brokers,
    logLevel: logLevel.ERROR,
  });

  return () => {
    const producer = client.producer({ allowAutoTopicCreation: true });

    return {
      connect: () => producer.connect(),
      send: async (message) => {
        await producer.send({
          topic: message.topic,
          messages: message.messages.map((entry) => ({ key: entry.key, value: entry.value })),
        });
      },
      disconnect: () => producer.disconnect(),
    };
  };
}

export function createCursorPublisher(options: {
  readonly cursor: CursorConfig | null;
  readonly logger: FastifyBaseLogger;
  readonly metrics?: Metrics;
  readonly producerFactory?: CursorProducerFactory;
}): CursorPublisher {
  const { cursor, logger, metrics } = options;

  if (!cursor) {
    return noopCursorPublisher;
  }

  const topic = cursor.topic;
  const createProducer = options.producerFactory ?? kafkaProducerFactory(cursor);
  const pending = new Map<string, CursorMoveEvent>();
  let producer: CursorProducer | null = null;
  let connecting: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let closing = false;

  async function connect(): Promise<void> {
    if (producer || closing) return;

    const candidate = createProducer();

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

  function scheduleFlush(): void {
    if (flushTimer || closing) return;

    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, CURSOR_COALESCE_MS);
  }

  async function flush(): Promise<void> {
    if (flushing || closing || pending.size === 0) return;

    flushing = true;
    const batch = [...pending.values()];
    pending.clear();

    try {
      if (!producer) {
        connecting ??= connect().finally(() => {
          connecting = null;
        });
        await connecting;
      }

      if (!producer) {
        metrics?.cursorDropped.inc(batch.length);
        return;
      }

      await producer.send({
        topic,
        messages: batch.map((event) => ({
          key: `${event.gameId}:${event.playerId}`,
          value: JSON.stringify(event),
        })),
      });
      metrics?.cursorPublished.inc(batch.length);
    } catch (error) {
      metrics?.cursorDropped.inc(batch.length);
      logger.warn({ err: error, events: batch.length }, 'cursor batch publish failed');

      const failed = producer;

      producer = null;

      if (failed) {
        await failed.disconnect().catch(() => undefined);
      }
    } finally {
      flushing = false;

      if (pending.size > 0) {
        scheduleFlush();
      }
    }
  }

  return {
    publishMove: (event) => {
      if (closing) return;

      const parsed = cursorMoveEventSchema.safeParse(event);

      if (!parsed.success) {
        metrics?.cursorDropped.inc();
        logger.warn({ event }, 'cursor event was invalid and was not published');
        return;
      }

      const key = `${parsed.data.gameId}:${parsed.data.playerId}`;

      if (!pending.has(key) && pending.size >= CURSOR_MAX_PENDING) {
        metrics?.cursorDropped.inc();
        return;
      }

      pending.set(key, parsed.data);
      scheduleFlush();
    },
    close: async () => {
      closing = true;

      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      pending.clear();

      const current = producer;

      producer = null;

      if (current) {
        await current.disconnect().catch(() => undefined);
      }
    },
  };
}
