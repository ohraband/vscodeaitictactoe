import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type LeaveGameRequest,
  type MoveRequest,
  type RematchRequest,
  type ServerToClientEvents,
  type SocketAck,
  type SubscribeGameRequest,
} from '@ttt/contracts';
import { io, type Socket } from 'socket.io-client';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isLoopbackHost(): boolean {
  const hostname = window.location.hostname;

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

export function getGameSocket(): GameSocket {
  if (!socket) {
    const loopback = isLoopbackHost();

    socket = io({
      autoConnect: false,
      path: '/socket.io',
      transports: loopback ? ['polling'] : ['websocket', 'polling'],
      tryAllTransports: true,
      upgrade: !loopback,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
      timeout: 8_000,
    }) as GameSocket;
  }

  return socket;
}

export function acquireGameSocket(): GameSocket {
  const active = getGameSocket();

  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }

  if (!active.connected) active.connect();

  return active;
}

export function releaseGameSocket(): void {
  if (disconnectTimer) clearTimeout(disconnectTimer);

  disconnectTimer = setTimeout(() => {
    disconnectTimer = null;
    socket?.disconnect();
  }, 50);
}

const ACK_TIMEOUT_MS = 8_000;

export function subscribeToGame(input: SubscribeGameRequest): Promise<SocketAck> {
  return getGameSocket().timeout(ACK_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GAME_SUBSCRIBE, input);
}

export function sendMove(input: MoveRequest): Promise<SocketAck> {
  return getGameSocket().timeout(ACK_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GAME_MOVE, input);
}

export function leaveGame(input: LeaveGameRequest): Promise<SocketAck> {
  return getGameSocket().timeout(ACK_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GAME_LEAVE, input);
}

export function requestRematch(input: RematchRequest): Promise<SocketAck> {
  return getGameSocket().timeout(ACK_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GAME_REMATCH, input);
}
