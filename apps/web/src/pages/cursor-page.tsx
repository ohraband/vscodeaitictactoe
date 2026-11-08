import { useAppConfig, useGameDetail, useMe } from '../api/queries';
import { CursorCanvas } from '../components/cursor/cursor-canvas';
import { Button } from '../components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { cn } from '../lib/cn';
import { useCursorChannel } from '../realtime/use-cursor-channel';
import { useCursorStream } from '../realtime/use-cursor-stream';
import { useGameChannel } from '../realtime/use-game-channel';
import { useGameStore } from '../stores/game-store';
import { ArrowLeft, MousePointer2, Radio, Users } from 'lucide-react';
import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';

export function CursorPage() {
  const { gameId = '' } = useParams();
  const { data: me } = useMe();
  const configQuery = useAppConfig();
  const detailQuery = useGameDetail(gameId);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const producerConnection = useGameStore((state) => state.connection);

  const enabled = Boolean(configQuery.data?.cursor.enabled);

  useGameChannel(gameId);

  const { dots, connection, error } = useCursorChannel(gameId, enabled);

  useCursorStream(gameId, stageRef, enabled);

  if (!me) return null;

  if (configQuery.isPending) {
    return (
      <div className="mx-auto max-w-6xl">
        <Skeleton className="mb-5 h-10 w-64" />
        <Skeleton className="aspect-[16/10] w-full rounded-[2rem]" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="Cursor sharing is off"
          description="This deployment has not enabled the Kafka cursor stream. Gameplay is unaffected."
          action={
            <Link to={gameId ? `/play/${gameId}` : '/'} className="inline-flex">
              <Button variant="secondary">
                <ArrowLeft className="size-4" />
                Back to the game
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto max-w-6xl">
        <Skeleton className="mb-5 h-10 w-64" />
        <Skeleton className="aspect-[16/10] w-full rounded-[2rem]" />
      </div>
    );
  }

  if (!detailQuery.data) {
    return (
      <ErrorState
        title="Could not open the cursor room"
        description={
          detailQuery.error instanceof Error
            ? detailQuery.error.message
            : 'Only players in this game can share cursors.'
        }
        onRetry={() => void detailQuery.refetch()}
        backTo={gameId ? `/play/${gameId}` : '/'}
      />
    );
  }

  const game = detailQuery.data.game;
  const statusTone =
    connection === 'connected' && producerConnection === 'connected'
      ? 'border-accent/30 bg-accent/10 text-accent'
      : connection === 'connecting' || producerConnection === 'connecting'
        ? 'border-line bg-panel/60 text-muted'
        : 'border-danger/30 bg-danger/10 text-danger';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/play/${game.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
        >
          <ArrowLeft className="size-4" />
          Back to game
        </Link>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold',
            statusTone,
          )}
        >
          <Radio className="size-3" />
          {connection === 'connected' && producerConnection === 'connected'
            ? 'Streaming'
            : connection === 'disconnected' || producerConnection === 'disconnected'
              ? 'Reconnecting'
              : 'Connecting'}
        </span>
      </div>

      <div className="mb-5">
        <p className="eyebrow">Cursor room</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Move to leave a dot
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          Positions travel through the game WebSocket, Kafka, and a dedicated consumer socket before
          appearing here. Only the players in <span className="text-fg">{game.code}</span> can see
          this room.
        </p>
      </div>

      <div
        ref={stageRef}
        className="relative aspect-[16/10] w-full touch-none overflow-hidden rounded-[2rem] border border-line bg-panel/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_center,var(--line)_1px,transparent_1px)] [background-size:32px_32px]"
        />
        <CursorCanvas dots={dots} />

        {dots.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex max-w-xs flex-col items-center text-center">
              <span className="grid size-12 place-items-center rounded-2xl border border-line bg-panel-raised text-accent">
                <MousePointer2 className="size-5" />
              </span>
              <p className="mt-4 text-sm font-semibold">Waiting for movement</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Move your mouse anywhere over this panel. Your dot will appear for everyone else in
                the game.
              </p>
            </div>
          </div>
        ) : null}

        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-line bg-bg/70 px-2.5 py-1 text-[0.68rem] font-semibold text-muted backdrop-blur">
          <Users className="size-3" />
          {dots.length} active cursor{dots.length === 1 ? '' : 's'}
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-danger" role="status">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-xs text-subtle">
          Cursor updates are best-effort and expire after a few seconds without movement.
        </p>
      )}
    </div>
  );
}
