import { SOCKET_EVENTS, type ErrorCode, type GameUpdate } from '@ttt/contracts';
import { useEffect } from 'react';
import { acquireGameSocket, releaseGameSocket, subscribeToGame } from './socket';
import { useGameStore } from '../stores/game-store';
import { useToast } from '../components/ui/toast';

const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000] as const;
const TERMINAL_SUBSCRIBE_CODES = new Set<ErrorCode>([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INVALID_REQUEST',
  'GAME_NOT_FOUND',
  'NOT_PARTICIPANT',
]);

export function useGameChannel(gameId: string): void {
  const { toast } = useToast();

  useEffect(() => {
    const store = useGameStore.getState();
    const socket = acquireGameSocket();
    let cancelled = false;
    let subscribing = false;
    let subscribed = false;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    store.begin(gameId);

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const markSubscribed = () => {
      subscribed = true;
      retryAttempt = 0;
      clearRetry();
      store.setConnection('connected');
    };

    const applyUpdate = (update: GameUpdate) => {
      if (cancelled || update.game.id !== gameId) return;

      markSubscribed();
      store.setGame(update.game);
    };

    const scheduleRetry = () => {
      if (cancelled || subscribed || retryTimer) return;

      const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)] ?? 4_000;
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;

        if (cancelled || subscribed) return;

        if (socket.connected) {
          void subscribe();
        } else {
          socket.connect();
        }
      }, delay);
    };

    const subscribe = async () => {
      if (cancelled || subscribing || subscribed) return;

      subscribing = true;
      clearRetry();

      try {
        const result = await subscribeToGame({ gameId });

        if (cancelled || subscribed) return;

        if (result.ok) {
          markSubscribed();
          return;
        }

        if (TERMINAL_SUBSCRIBE_CODES.has(result.error.code)) {
          store.setConnection('disconnected');
          toast({
            title: 'Could not join the live game',
            description: result.error.message,
            tone: 'error',
          });
          return;
        }

        scheduleRetry();
      } catch {
        if (cancelled || subscribed) return;
        scheduleRetry();
      } finally {
        subscribing = false;
      }
    };

    const onConnect = () => {
      if (cancelled) return;
      store.setConnection('connecting');
      void subscribe();
    };

    const onDisconnect = () => {
      if (cancelled) return;
      subscribed = false;
      clearRetry();
      store.setConnection('disconnected');
    };

    const onConnectError = (error: Error) => {
      if (cancelled) return;
      subscribed = false;
      clearRetry();
      store.setConnection('disconnected');
      toast({
        title: 'Realtime connection failed',
        description:
          error.message === 'UNAUTHORIZED'
            ? 'Your guest session expired. Refresh the page to continue.'
            : 'The live connection could not be established. We will keep trying.',
        tone: 'error',
      });
    };

    const onSnapshot = (update: GameUpdate) => applyUpdate(update);
    const onUpdate = (update: GameUpdate) => applyUpdate(update);
    const onPresence = (presence: Parameters<typeof store.setPresence>[0]) => {
      if (!cancelled) store.setPresence(presence);
    };
    const onRematch = (rematch: Parameters<typeof store.setRematch>[0]) => {
      if (!cancelled) store.setRematch(rematch);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(SOCKET_EVENTS.GAME_SNAPSHOT, onSnapshot);
    socket.on(SOCKET_EVENTS.GAME_UPDATE, onUpdate);
    socket.on(SOCKET_EVENTS.GAME_PRESENCE, onPresence);
    socket.on(SOCKET_EVENTS.GAME_REMATCH_STARTED, onRematch);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      cancelled = true;
      clearRetry();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(SOCKET_EVENTS.GAME_SNAPSHOT, onSnapshot);
      socket.off(SOCKET_EVENTS.GAME_UPDATE, onUpdate);
      socket.off(SOCKET_EVENTS.GAME_PRESENCE, onPresence);
      socket.off(SOCKET_EVENTS.GAME_REMATCH_STARTED, onRematch);
      releaseGameSocket();
      useGameStore.getState().end(gameId);
    };
  }, [gameId, toast]);
}
