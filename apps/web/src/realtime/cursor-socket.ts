import {
  CURSOR_SOCKET_PATH,
  SOCKET_EVENTS,
  type CursorClientToServerEvents,
  type CursorServerToClientEvents,
  type CursorSubscribeRequest,
  type SocketAck,
} from '@ttt/contracts';
import { io, type Socket } from 'socket.io-client';

export type CursorSocket = Socket<CursorServerToClientEvents, CursorClientToServerEvents>;

let socket: CursorSocket | null = null;
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

export function getCursorSocket(): CursorSocket {
  if (!socket) {
    const loopback = isLoopbackHost();

    socket = io({
      autoConnect: false,
      path: CURSOR_SOCKET_PATH,
      transports: loopback ? ['polling'] : ['websocket', 'polling'],
      tryAllTransports: true,
      upgrade: !loopback,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
      timeout: 8_000,
    }) as CursorSocket;
  }

  return socket;
}

export function acquireCursorSocket(): CursorSocket {
  const active = getCursorSocket();

  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }

  if (!active.connected) active.connect();

  return active;
}

export function releaseCursorSocket(): void {
  if (disconnectTimer) clearTimeout(disconnectTimer);

  disconnectTimer = setTimeout(() => {
    disconnectTimer = null;
    socket?.disconnect();
  }, 50);
}

const ACK_TIMEOUT_MS = 8_000;

export function subscribeToCursors(input: CursorSubscribeRequest): Promise<SocketAck> {
  return getCursorSocket()
    .timeout(ACK_TIMEOUT_MS)
    .emitWithAck(SOCKET_EVENTS.CURSOR_SUBSCRIBE, input);
}
