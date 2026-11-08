import { SOCKET_EVENTS, type CursorDot, type CursorLeave } from '@ttt/contracts';
import { useEffect, useState } from 'react';
import {
  acquireCursorSocket,
  releaseCursorSocket,
  subscribeToCursors,
} from './cursor-socket';

const DOT_TTL_MS = 5_000;
const MAX_DOTS = 64;

export type CursorConnection = 'connecting' | 'connected' | 'disconnected';

export interface CursorPoint {
  readonly gameId: string;
  readonly playerId: string;
  readonly streamId: string;
  readonly x: number;
  readonly y: number;
  readonly seq: number;
  readonly updatedAt: number;
}

export interface CursorChannel {
  readonly dots: readonly CursorPoint[];
  readonly connection: CursorConnection;
  readonly error: string | null;
}

export function useCursorChannel(gameId: string, enabled: boolean): CursorChannel {
  const [dots, setDots] = useState<readonly CursorPoint[]>([]);
  const [connection, setConnection] = useState<CursorConnection>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDots([]);
      setConnection('disconnected');
      setError(null);
      return;
    }

    const socket = acquireCursorSocket();
    let cancelled = false;
    let subscribing = false;

    const subscribe = async () => {
      if (cancelled || subscribing) return;

      subscribing = true;

      try {
        const ack = await subscribeToCursors({ gameId });

        if (cancelled) return;

        if (ack.ok) {
          setConnection('connected');
          setError(null);
          return;
        }

        setConnection('disconnected');
        setError(ack.error.message);
      } catch {
        if (cancelled) return;
        setConnection('disconnected');
        setError('Cursor stream connection timed out.');
      } finally {
        subscribing = false;
      }
    };

    const onConnect = () => {
      if (cancelled) return;
      setConnection('connecting');
      void subscribe();
    };

    const onDisconnect = () => {
      if (cancelled) return;
      setConnection('disconnected');
    };

    const onConnectError = (connectError: Error) => {
      if (cancelled) return;
      setConnection('disconnected');
      setError(
        connectError.message === 'UNAUTHORIZED'
          ? 'Your guest session expired. Refresh the page to continue.'
          : 'The cursor stream is unavailable. We will keep trying.',
      );
    };

    const onDot = (dot: CursorDot) => {
      if (cancelled || dot.gameId !== gameId) return;

      setDots((previous) => {
        const existing = previous.find((point) => point.streamId === dot.streamId);

        if (existing && dot.seq <= existing.seq) return previous;

        const next = previous.filter((point) => point.streamId !== dot.streamId);

        next.push({
          gameId: dot.gameId,
          playerId: dot.playerId,
          streamId: dot.streamId,
          x: dot.x,
          y: dot.y,
          seq: dot.seq,
          updatedAt: Date.now(),
        });

        return next.slice(-MAX_DOTS);
      });
    };

    const onLeave = (leave: CursorLeave) => {
      if (cancelled || leave.gameId !== gameId) return;

      setDots((previous) => previous.filter((point) => point.playerId !== leave.playerId));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(SOCKET_EVENTS.CURSOR_DOT, onDot);
    socket.on(SOCKET_EVENTS.CURSOR_LEAVE, onLeave);

    if (socket.connected) {
      onConnect();
    }

    const expiry = setInterval(() => {
      const cutoff = Date.now() - DOT_TTL_MS;

      setDots((previous) => previous.filter((point) => point.updatedAt >= cutoff));
    }, 1_000);

    return () => {
      cancelled = true;
      clearInterval(expiry);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(SOCKET_EVENTS.CURSOR_DOT, onDot);
      socket.off(SOCKET_EVENTS.CURSOR_LEAVE, onLeave);
      releaseCursorSocket();
    };
  }, [enabled, gameId]);

  return { dots, connection, error };
}
