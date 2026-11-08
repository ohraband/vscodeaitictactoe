import { randomUUID } from 'node:crypto';
import type { CursorMoveEvent } from '@ttt/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CursorConfig } from '../src/config.js';
import {
  CURSOR_COALESCE_MS,
  CURSOR_MAX_PENDING,
  createCursorPublisher,
  noopCursorPublisher,
  type CursorProducer,
  type CursorProducerFactory,
} from '../src/cursor/publisher.js';

type ProducerMessage = Parameters<CursorProducer['send']>[0];

const cursor: CursorConfig = {
  brokers: ['localhost:9092'],
  clientId: 'ttt-test-cursor',
  topic: 'ttt.cursor.moved',
  groupId: 'ttt-test-cursor',
  port: 3001,
  path: '/cursor.io',
};

const gameId = '33333333-3333-4333-8333-333333333333';
const playerId = '11111111-1111-4111-8111-111111111111';

function event(overrides: Partial<CursorMoveEvent> = {}): CursorMoveEvent {
  return {
    gameId,
    playerId,
    streamId: '44444444-4444-4444-8444-444444444444',
    x: 0.25,
    y: 0.75,
    seq: 1,
    sentAt: '2026-10-24T10:00:00.000Z',
    ...overrides,
  };
}

function fakeLogger(): FastifyBaseLogger {
  return {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

function fakeProducer(
  send = vi.fn(async (_message: ProducerMessage) => undefined),
): CursorProducer {
  return {
    connect: vi.fn(async () => undefined),
    send,
    disconnect: vi.fn(async () => undefined),
  };
}

describe('cursor publisher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a no-op when the cursor stream is disabled', async () => {
    expect(() => noopCursorPublisher.publishMove(event())).not.toThrow();
    await expect(noopCursorPublisher.close()).resolves.toBeUndefined();
  });

  it('coalesces updates for the same player into one Kafka message', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    const publisher = createCursorPublisher({
      cursor,
      logger: fakeLogger(),
      producerFactory: () => producer,
    });

    publisher.publishMove(event({ x: 0.1, seq: 1 }));
    publisher.publishMove(event({ x: 0.8, seq: 2 }));

    expect(producer.send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CURSOR_COALESCE_MS);

    expect(producer.send).toHaveBeenCalledTimes(1);

    const message = (producer.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      ProducerMessage | undefined;

    expect(message?.topic).toBe(cursor.topic);
    expect(message?.messages).toHaveLength(1);
    expect(JSON.parse(message?.messages[0]?.value ?? '{}')).toMatchObject({ x: 0.8, seq: 2 });
  });

  it('batches updates from different players together', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    const publisher = createCursorPublisher({
      cursor,
      logger: fakeLogger(),
      producerFactory: () => producer,
    });

    publisher.publishMove(event({ playerId }));
    publisher.publishMove(event({ playerId: randomUUID() }));

    await vi.advanceTimersByTimeAsync(CURSOR_COALESCE_MS);

    expect(producer.send).toHaveBeenCalledTimes(1);

    const message = (producer.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      ProducerMessage | undefined;

    expect(message?.messages).toHaveLength(2);
  });

  it('drops invalid events without connecting to Kafka', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    const logger = fakeLogger();
    const factory = vi.fn<CursorProducerFactory>(() => producer);
    const publisher = createCursorPublisher({
      cursor,
      logger,
      producerFactory: factory,
    });

    publisher.publishMove(event({ x: 1.5 }));

    await vi.advanceTimersByTimeAsync(CURSOR_COALESCE_MS);

    expect(factory).not.toHaveBeenCalled();
    expect(producer.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('caps the pending buffer and drops excess streams', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    const publisher = createCursorPublisher({
      cursor,
      logger: fakeLogger(),
      producerFactory: () => producer,
    });

    for (let index = 0; index < CURSOR_MAX_PENDING; index += 1) {
      publisher.publishMove(event({ playerId: randomUUID(), seq: index }));
    }

    publisher.publishMove(event({ playerId: randomUUID(), seq: CURSOR_MAX_PENDING }));

    await vi.advanceTimersByTimeAsync(CURSOR_COALESCE_MS);

    const message = (producer.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      ProducerMessage | undefined;

    expect(message?.messages).toHaveLength(CURSOR_MAX_PENDING);
  });

  it('reconnects after a failed batch', async () => {
    vi.useFakeTimers();
    const failed = fakeProducer(vi.fn(async () => Promise.reject(new Error('kafka down'))));
    const healthy = fakeProducer();
    const factory = vi
      .fn<CursorProducerFactory>()
      .mockReturnValueOnce(failed)
      .mockReturnValueOnce(healthy);
    const logger = fakeLogger();
    const publisher = createCursorPublisher({
      cursor,
      logger,
      producerFactory: factory,
    });

    publisher.publishMove(event({ seq: 1 }));
    await vi.advanceTimersByTimeAsync(CURSOR_COALESCE_MS);

    expect(logger.warn).toHaveBeenCalled();
    expect(failed.disconnect).toHaveBeenCalled();

    publisher.publishMove(event({ seq: 2 }));
    await vi.advanceTimersByTimeAsync(CURSOR_COALESCE_MS);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(healthy.send).toHaveBeenCalledTimes(1);
  });

  it('stops publishing after close', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    const publisher = createCursorPublisher({
      cursor,
      logger: fakeLogger(),
      producerFactory: () => producer,
    });

    await publisher.close();
    publisher.publishMove(event());

    await vi.advanceTimersByTimeAsync(CURSOR_COALESCE_MS);

    expect(producer.send).not.toHaveBeenCalled();
  });
});
