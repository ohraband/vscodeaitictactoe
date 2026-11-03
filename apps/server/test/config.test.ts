import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  DATABASE_URL: 'postgresql://ttt:ttt@localhost:5432/ttt',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('applies development defaults', () => {
    const config = loadConfig(validEnv);

    expect(config).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      host: '0.0.0.0',
      port: 3000,
      sessionTtlDays: 30,
      turnSeconds: 60,
      socketPingIntervalMs: 25_000,
      socketPingTimeoutMs: 20_000,
      redisUrl: null,
      logLevel: 'info',
      rateLimitEnabled: true,
      cspUpgradeInsecureRequests: false,
      sessionCookieSecure: false,
      metricsReplicaId: 'local',
      kafka: null,
    });
  });

  it('parses production settings', () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '8080',
      SESSION_TTL_DAYS: '7',
      TURN_SECONDS: '15',
      SOCKET_PING_INTERVAL_MS: '10000',
      SOCKET_PING_TIMEOUT_MS: '5000',
      REDIS_URL: 'redis://localhost:6379',
      LOG_LEVEL: 'debug',
      RATE_LIMIT_ENABLED: 'false',
      CSP_UPGRADE_INSECURE_REQUESTS: 'true',
      METRICS_REPLICA_ID: 'replica-2',
      KAFKA_BROKERS: 'kafka-a:9092, kafka-b:9092',
      KAFKA_CLIENT_ID: 'ttt-api',
      KAFKA_ANALYTICS_TOPIC: 'games.completed',
      KAFKA_ANALYTICS_GROUP_ID: 'games-analytics',
    });

    expect(config).toMatchObject({
      nodeEnv: 'production',
      isProduction: true,
      host: '127.0.0.1',
      port: 8080,
      sessionTtlDays: 7,
      turnSeconds: 15,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      redisUrl: 'redis://localhost:6379',
      logLevel: 'debug',
      rateLimitEnabled: false,
      cspUpgradeInsecureRequests: true,
      sessionCookieSecure: true,
      metricsReplicaId: 'replica-2',
      kafka: {
        brokers: ['kafka-a:9092', 'kafka-b:9092'],
        clientId: 'ttt-api',
        topic: 'games.completed',
        groupId: 'games-analytics',
      },
    });
  });

  it('allows plain-HTTP production to disable secure cookies', () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: 'production',
      SESSION_COOKIE_SECURE: 'false',
    });

    expect(config.isProduction).toBe(true);
    expect(config.sessionCookieSecure).toBe(false);
  });

  it('rejects missing or malformed settings', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'a'.repeat(32) })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://ttt', SESSION_SECRET: 'short' })).toThrow(
      /SESSION_SECRET/,
    );
    expect(() => loadConfig({ ...validEnv, PORT: '0' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
    expect(() => loadConfig({ ...validEnv, TURN_SECONDS: '-1' })).toThrow(/TURN_SECONDS/);
    expect(() => loadConfig({ ...validEnv, TURN_SECONDS: '3601' })).toThrow(/TURN_SECONDS/);
    expect(() => loadConfig({ ...validEnv, REDIS_URL: 'not a url' })).toThrow(/REDIS_URL/);
    expect(() => loadConfig({ ...validEnv, RATE_LIMIT_ENABLED: 'sometimes' })).toThrow(
      /RATE_LIMIT_ENABLED/,
    );
  });
});
