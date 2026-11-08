import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';

export interface Metrics {
  readonly registry: Registry;
  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  readonly activeSockets: Gauge;
  readonly gamesStarted: Counter<'mode'>;
  readonly gamesFinished: Counter<'mode' | 'reason'>;
  readonly moves: Counter<'mode'>;
  readonly staleConflicts: Counter;
  readonly aiDuration: Histogram<'difficulty'>;
  readonly cursorPublished: Counter;
  readonly cursorConsumed: Counter;
  readonly cursorDropped: Counter;
  readonly cursorLatency: Histogram;
}

export function createMetrics(replicaId: string): Metrics {
  const registry = new Registry();

  registry.setDefaultLabels({ replica: replicaId });
  collectDefaultMetrics({ register: registry, prefix: 'ttt_' });

  return {
    registry,
    httpRequestDuration: new Histogram<'method' | 'route' | 'status_code'>({
      name: 'ttt_http_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    }),
    activeSockets: new Gauge({
      name: 'ttt_active_sockets',
      help: 'Currently connected WebSocket clients.',
      registers: [registry],
    }),
    gamesStarted: new Counter<'mode'>({
      name: 'ttt_games_started_total',
      help: 'Games that became active.',
      labelNames: ['mode'],
      registers: [registry],
    }),
    gamesFinished: new Counter<'mode' | 'reason'>({
      name: 'ttt_games_finished_total',
      help: 'Games that finished or were abandoned.',
      labelNames: ['mode', 'reason'],
      registers: [registry],
    }),
    moves: new Counter<'mode'>({
      name: 'ttt_moves_total',
      help: 'Accepted moves, including computer moves.',
      labelNames: ['mode'],
      registers: [registry],
    }),
    staleConflicts: new Counter({
      name: 'ttt_stale_move_conflicts_total',
      help: 'Move requests rejected because the game version was stale.',
      registers: [registry],
    }),
    aiDuration: new Histogram<'difficulty'>({
      name: 'ttt_ai_move_duration_seconds',
      help: 'Time spent choosing a computer move.',
      labelNames: ['difficulty'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      registers: [registry],
    }),
    cursorPublished: new Counter({
      name: 'ttt_cursor_published_total',
      help: 'Cursor positions published to Kafka.',
      registers: [registry],
    }),
    cursorConsumed: new Counter({
      name: 'ttt_cursor_consumed_total',
      help: 'Cursor positions consumed from Kafka.',
      registers: [registry],
    }),
    cursorDropped: new Counter({
      name: 'ttt_cursor_dropped_total',
      help: 'Cursor positions dropped due to backpressure or validation.',
      registers: [registry],
    }),
    cursorLatency: new Histogram({
      name: 'ttt_cursor_delivery_latency_seconds',
      help: 'Time from cursor capture to Kafka consumption.',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [registry],
    }),
  };
}
