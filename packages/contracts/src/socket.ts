import { z } from 'zod';
import { ackErrorSchema } from './api.js';
import type {
  GamePresence,
  GameUpdate,
  LeaveGameRequest,
  MoveRequest,
  RematchRequest,
  RematchStarted,
  SubscribeGameRequest,
} from './game.js';

export const socketAckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: ackErrorSchema }),
]);

export type SocketAck = z.infer<typeof socketAckSchema>;
export type SocketAckHandler = (result: SocketAck) => void;

export interface ClientToServerEvents {
  'game:subscribe': (request: SubscribeGameRequest, ack: SocketAckHandler) => void;
  'game:move': (request: MoveRequest, ack: SocketAckHandler) => void;
  'game:leave': (request: LeaveGameRequest, ack: SocketAckHandler) => void;
  'game:rematch': (request: RematchRequest, ack: SocketAckHandler) => void;
}

export interface ServerToClientEvents {
  'game:snapshot': (update: GameUpdate) => void;
  'game:update': (update: GameUpdate) => void;
  'game:presence': (presence: GamePresence) => void;
  'game:rematch-started': (rematch: RematchStarted) => void;
}
