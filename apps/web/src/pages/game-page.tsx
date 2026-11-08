import type { Cell } from '@ttt/game-engine';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Keyboard, MousePointer2, Radio } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { queryKeys, useCreateGame, useGameDetail, useMe } from '../api/queries';
import { Board } from '../components/game/board';
import { GameSidebar } from '../components/game/game-sidebar';
import { RoomCode } from '../components/game/room-code';
import { ResultDialog } from '../components/game/result-dialog';
import { ConfirmDialog } from '../components/ui/modal';
import { Skeleton, ErrorState } from '../components/ui/states';
import { useToast } from '../components/ui/toast';
import {
  difficultyLabel,
  isMyTurn,
  playerForSymbol,
  resultForPlayer,
  statusLabel,
} from '../lib/format';
import { getGameSocket, leaveGame, requestRematch, sendMove } from '../realtime/socket';
import { useGameChannel } from '../realtime/use-game-channel';
import { useGameStore } from '../stores/game-store';

function GameSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <Skeleton className="mb-5 h-9 w-48" />
        <Skeleton className="aspect-square w-full rounded-[2rem]" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
      </div>
    </div>
  );
}

export function GamePage() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useMe();
  const detailQuery = useGameDetail(gameId);
  const liveGame = useGameStore((state) => state.game);
  const connection = useGameStore((state) => state.connection);
  const presence = useGameStore((state) => state.presence);
  const rematch = useGameStore((state) => state.rematch);
  const createGame = useCreateGame();
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const previousBoard = useRef<readonly Cell[] | null>(null);
  const previousStatus = useRef<string | null>(null);

  useGameChannel(gameId);

  const game = liveGame?.id === gameId ? liveGame : (detailQuery.data?.game ?? null);

  useLayoutEffect(() => {
    if (detailQuery.data) {
      useGameStore.getState().setGame(detailQuery.data.game);
      const finalMove = detailQuery.data.moves.at(-1);
      if (finalMove) setLastMove(finalMove.cell);
    }
  }, [detailQuery.data]);

  useLayoutEffect(() => {
    if (!game) return;

    const previous = previousBoard.current;

    if (previous) {
      const changed = game.board
        .map((cell, index) => (cell !== previous[index] ? index : -1))
        .filter((index) => index >= 0);

      if (changed.length === 1) setLastMove(changed[0] ?? null);
    }

    previousBoard.current = game.board;
  }, [game]);

  useEffect(() => {
    if (!game) return;

    if (previousStatus.current === 'active' && game.status === 'finished') {
      setResultOpen(true);
    }

    previousStatus.current = game.status;
  }, [game]);

  useEffect(() => {
    if (game?.status !== 'finished') return;

    void queryClient.invalidateQueries({ queryKey: queryKeys.games });
    void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard });
  }, [game?.status, queryClient]);

  useEffect(() => {
    if (!rematch) return;

    toast({
      title: 'Rematch ready',
      description: 'A fresh board is waiting. Symbols have swapped.',
      tone: 'success',
    });
    navigate(`/play/${rematch.gameId}`);
  }, [navigate, rematch, toast]);

  useEffect(() => {
    previousBoard.current = null;
    previousStatus.current = null;
    setLastMove(null);
    setResultOpen(false);
  }, [gameId]);

  if (!me) return null;

  if (detailQuery.isPending && !game) return <GameSkeleton />;

  if (!game) {
    const notFound = detailQuery.error instanceof ApiError && detailQuery.error.status === 403;
    const missing = detailQuery.error instanceof ApiError && detailQuery.error.status === 404;

    return (
      <ErrorState
        title={
          missing
            ? 'Game not found'
            : notFound
              ? 'This game is not yours'
              : 'Could not load the game'
        }
        description={
          missing
            ? 'The room may have expired, or the link is incomplete.'
            : notFound
              ? 'Only the two players in a game can open its board.'
              : detailQuery.error instanceof Error
                ? detailQuery.error.message
                : 'Please try again in a moment.'
        }
        onRetry={() => void detailQuery.refetch()}
        backTo="/"
      />
    );
  }

  const myTurn = isMyTurn(game, me.id);
  const canPlay = game.status === 'active';
  const result = resultForPlayer(game, me.id);
  const turnPlayer = playerForSymbol(game, game.turn);
  const isSingle = game.mode === 'single';
  const boardDisabled = !canPlay || !myTurn || pendingCell !== null || connection !== 'connected';

  const turnName = isSingle && game.turn === 'O' ? 'Computer' : turnPlayer.displayName;
  const announcement =
    game.status === 'waiting'
      ? 'Waiting for an opponent to join.'
      : game.status === 'active'
        ? `${turnName}'s turn, ${game.turn}.`
        : `${result.label}. ${result.detail}`;

  const handleMove = async (cell: number) => {
    if (
      !canPlay ||
      !myTurn ||
      pendingCell !== null ||
      connection !== 'connected' ||
      game.board[cell] !== null
    ) {
      return;
    }

    setPendingCell(cell);

    try {
      const ack = await sendMove({ gameId: game.id, cell, expectedVersion: game.version });

      if (!ack.ok) {
        toast({
          title: 'Move not accepted',
          description: ack.error.message,
          tone: 'error',
        });
        void detailQuery.refetch();
      }
    } catch {
      toast({
        title: 'Move did not go through',
        description: 'The connection timed out. The board will resync when you reconnect.',
        tone: 'error',
      });
    } finally {
      setPendingCell(null);
    }
  };

  const performLeave = async () => {
    setLeaving(true);

    try {
      const ack = await leaveGame({ gameId: game.id });

      if (!ack.ok) {
        toast({ title: 'Could not leave', description: ack.error.message, tone: 'error' });
        return;
      }

      navigate('/');
    } catch {
      toast({
        title: 'Could not leave the game',
        description: 'Check your connection and try again.',
        tone: 'error',
      });
    } finally {
      setLeaving(false);
      setConfirmLeave(false);
    }
  };

  const handleLeave = () => {
    if (game.status === 'finished') {
      navigate('/');
      return;
    }

    setConfirmLeave(true);
  };

  const handleRematch = async () => {
    setRematchLoading(true);

    try {
      const ack = await requestRematch({ gameId: game.id });

      if (!ack.ok) {
        toast({ title: 'Rematch unavailable', description: ack.error.message, tone: 'error' });
      }
    } catch {
      toast({
        title: 'Could not request a rematch',
        description: 'Check your connection and try again.',
        tone: 'error',
      });
    } finally {
      setRematchLoading(false);
    }
  };

  const playAgain = async () => {
    try {
      const fresh = await createGame.mutateAsync({
        mode: 'single',
        difficulty: (game.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard',
      });

      navigate(`/play/${fresh.id}`);
    } catch (error) {
      toast({
        title: 'Could not start a new game',
        description: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
        >
          <ArrowLeft className="size-4" />
          Lobby
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-line bg-panel/60 px-2.5 py-1 text-[0.68rem] font-semibold text-muted">
            {isSingle
              ? `Solo · ${difficultyLabel(game.difficulty)}`
              : game.visibility === 'public'
                ? 'Open table'
                : 'Private room'}
          </span>
          {!isSingle && game.status !== 'waiting' ? <RoomCode code={game.code} compact /> : null}
          {!isSingle ? (
            <Link
              to={`/play/${game.id}/cursors`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel/60 px-2.5 py-1 text-[0.68rem] font-semibold text-muted transition hover:border-line-strong hover:text-fg"
            >
              <MousePointer2 className="size-3" />
              Cursors
            </Link>
          ) : null}
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold ${
              game.status === 'active'
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-line bg-panel/60 text-muted'
            }`}
          >
            {game.status === 'active' ? <Radio className="size-3" /> : null}
            {statusLabel(game.status)}
          </span>
        </div>
      </div>

      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {isSingle
            ? 'Solo vs computer'
            : game.status === 'waiting'
              ? game.visibility === 'public'
                ? 'Your open table'
                : 'Your private table'
              : 'Head to head'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isSingle
            ? `${difficultyLabel(game.difficulty)} difficulty · First to three wins.`
            : game.status === 'waiting'
              ? game.visibility === 'public'
                ? 'We will pair you with the next available player. Keep this tab open.'
                : 'Send the room code to a friend. No account needed.'
              : `First to three. ${game.turnDeadline ? 'The clock is running.' : 'Play at your pace.'}`}
        </p>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Game board">
          {game.status === 'waiting' && game.visibility === 'private' ? (
            <div className="mb-3 rounded-2xl border border-accent/25 bg-accent/[0.055] p-3 sm:hidden">
              <p className="mb-2 text-xs font-semibold text-muted">Share this room code</p>
              <RoomCode code={game.code} />
            </div>
          ) : null}

          <Board
            board={game.board as Cell[]}
            winningLine={game.winningLine}
            lastMove={lastMove}
            turn={game.turn}
            disabled={boardDisabled}
            {...(canPlay ? { onMove: (cell: number) => void handleMove(cell) } : {})}
            label={`${isSingle ? 'Solo' : 'Multiplayer'} tic-tac-toe board`}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
            {canPlay ? (
              <p className="flex items-center gap-1.5 text-xs text-subtle">
                <Keyboard className="size-3.5" />
                Arrow keys to move · Enter to place
              </p>
            ) : (
              <span />
            )}
            {game.status === 'active' && game.mode === 'multi' ? (
              <p className="text-xs text-subtle">
                {game.turnDeadline ? 'Timer is server-authoritative.' : 'Timer disabled.'}
              </p>
            ) : null}
          </div>
        </section>

        <GameSidebar
          game={game}
          me={me}
          connection={connection}
          presence={presence}
          onLeave={handleLeave}
          onRematch={() => void handleRematch()}
          rematchLoading={rematchLoading}
          onReconnect={() => {
            const socket = getGameSocket();
            socket.disconnect();
            socket.connect();
          }}
        />
      </div>

      <ResultDialog
        open={resultOpen && game.status === 'finished'}
        onOpenChange={setResultOpen}
        game={game}
        playerId={me.id}
        onRematch={() => void handleRematch()}
        rematchLoading={rematchLoading}
        onPlayAgain={() => void playAgain()}
        playAgainLoading={createGame.isPending}
        onLobby={() => navigate('/')}
      />

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={game.status === 'waiting' ? 'Close this room?' : 'Leave this game?'}
        description={
          game.status === 'waiting'
            ? 'The room will be closed and the code will stop working.'
            : 'Leaving an active game counts as a forfeit. Your opponent will be awarded the win.'
        }
        confirmLabel={game.status === 'waiting' ? 'Close room' : 'Forfeit game'}
        onConfirm={() => void performLeave()}
        loading={leaving}
        destructive
      />
    </div>
  );
}
