import { z } from 'zod';

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TURN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  REDIS_URL: z.url().optional(),
  LOG_LEVEL: logLevelSchema.default('info'),
  RATE_LIMIT_ENABLED: z.stringbool().default(true),
  CSP_UPGRADE_INSECURE_REQUESTS: z.stringbool().default(false),
  SESSION_COOKIE_SECURE: z.stringbool().optional(),
  METRICS_REPLICA_ID: z.string().min(1).optional(),
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_CLIENT_ID: z.string().min(1).default('ttt-server'),
  KAFKA_ANALYTICS_TOPIC: z.string().min(1).default('ttt.game.completed'),
  KAFKA_ANALYTICS_GROUP_ID: z.string().min(1).default('ttt-analytics'),
});

export type LogLevel = z.infer<typeof logLevelSchema>;

export interface KafkaConfig {
  readonly brokers: string[];
  readonly clientId: string;
  readonly topic: string;
  readonly groupId: string;
}

export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  host: string;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  sessionTtlDays: number;
  turnSeconds: number;
  redisUrl: string | null;
  logLevel: LogLevel;
  rateLimitEnabled: boolean;
  cspUpgradeInsecureRequests: boolean;
  sessionCookieSecure: boolean;
  metricsReplicaId: string;
  kafka: KafkaConfig | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const parsed = result.data;
  const brokers = (parsed.KAFKA_BROKERS ?? '')
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker.length > 0);
  const kafka: KafkaConfig | null =
    brokers.length === 0
      ? null
      : {
          brokers,
          clientId: parsed.KAFKA_CLIENT_ID,
          topic: parsed.KAFKA_ANALYTICS_TOPIC,
          groupId: parsed.KAFKA_ANALYTICS_GROUP_ID,
        };

  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    turnSeconds: parsed.TURN_SECONDS,
    redisUrl: parsed.REDIS_URL ?? null,
    logLevel: parsed.LOG_LEVEL,
    rateLimitEnabled: parsed.RATE_LIMIT_ENABLED,
    cspUpgradeInsecureRequests: parsed.CSP_UPGRADE_INSECURE_REQUESTS,
    sessionCookieSecure: parsed.SESSION_COOKIE_SECURE ?? parsed.NODE_ENV === 'production',
    metricsReplicaId: parsed.METRICS_REPLICA_ID ?? env.HOSTNAME ?? 'local',
    kafka,
  };
}
