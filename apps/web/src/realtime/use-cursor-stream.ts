import { SOCKET_EVENTS } from '@ttt/contracts';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { getGameSocket } from './socket';

const SEND_INTERVAL_MS = 50;

export function useCursorStream(
  gameId: string,
  stageRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): string {
  const [streamId] = useState(() => crypto.randomUUID());
  const latest = useRef<{ x: number; y: number } | null>(null);
  const lastSentAt = useRef(0);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket = getGameSocket();

    const emit = () => {
      const point = latest.current;

      if (!point || !socket.connected) return;

      lastSentAt.current = performance.now();
      seq.current += 1;
      socket.volatile.emit(SOCKET_EVENTS.CURSOR_MOVE, {
        gameId,
        streamId,
        x: point.x,
        y: point.y,
        seq: seq.current,
        sentAt: new Date().toISOString(),
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = stageRef.current?.getBoundingClientRect();

      if (!rect || rect.width === 0 || rect.height === 0) return;

      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      if (x < 0 || x > 1 || y < 0 || y > 1) return;

      latest.current = { x, y };

      const wait = SEND_INTERVAL_MS - (performance.now() - lastSentAt.current);

      if (wait <= 0) {
        emit();
        return;
      }

      if (timer.current === null) {
        timer.current = setTimeout(() => {
          timer.current = null;
          emit();
        }, wait);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      latest.current = null;

      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [enabled, gameId, stageRef, streamId]);

  return streamId;
}
