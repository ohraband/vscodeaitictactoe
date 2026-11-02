import { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useGameDetail, useMe } from '../api/queries';
import { Board } from '../components/game/board';
import { Mark } from '../components/game/mark';
import { PlayerCard } from '../components/game/player-card';
import { Button } from '../components/ui/button';
import { ErrorState, Skeleton } from '../components/ui/states';
import { cn } from '../lib/cn';
import {
  difficultyLabel,
  finishReasonLabel,
  formatDateTime,
  formatDuration,
  opponentFor,
  resultForPlayer,
  statusLabel,
} from '../lib/format';
import { buildReplayFrames, frameAt } from '../lib/replay';

function ReplaySkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <Skeleton className="mb-5 h-9 w-52" />
        <Skeleton className="aspect-square w-full rounded-[2rem]" />
        <Skeleton className="mt-3 h-14 rounded-2xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}

export function ReplayPage() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const detail = useGameDetail(gameId);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frames = useMemo(
    () => (detail.data ? buildReplayFrames({ ...detail.data.game, moves: detail.data.moves }) : []),
    [detail.data],
  );
  const lastIndex = Math.max(0, frames.length - 1);
  const frame = frameAt(frames, index);
  const game = detail.data?.game;
  const atEnd = index >= lastIndex;
  const atStart = index <= 0;

  useEffect(() => {
    setIndex(Math.max(0, frames.length - 1));
    setPlaying(false);
  }, [gameId, frames.length]);

  useEffect(() => {
    if (!playing) return;

    if (index >= lastIndex) {
      setPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, lastIndex));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [index, lastIndex, playing]);

  if (!me) return null;

  if (detail.isPending) return <ReplaySkeleton />;

  if (!detail.data || !game) {
    return (
      <ErrorState
        title={
          detail.error instanceof ApiError && detail.error.status === 404
            ? 'Replay not found'
            : 'Could not load the replay'
        }
        description={
          detail.error instanceof Error
            ? detail.error.message
            : 'The game may have expired or the link is incomplete.'
        }
        onRetry={() => void detail.refetch()}
        backTo="/history"
      />
    );
  }

  const result = resultForPlayer(game, me.id);
  const final = index === lastIndex;
  const winningLine = final ? game.winningLine : null;
  const live = game.status === 'active' || game.status === 'waiting';
  const startedAt = game.startedAt;
  const finishedAt = game.finishedAt;
  const duration =
    startedAt && finishedAt
      ? formatDuration((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        to="/history"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        History
      </Link>

      <div className="mt-4 mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Replay · {statusLabel(game.status)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            {opponentFor(game, me.id)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {game.mode === 'single' ? 'Solo' : 'Multiplayer'} · {formatDateTime(game.createdAt)}
          </p>
        </div>
        {live ? (
          <Button variant="secondary" onClick={() => navigate(`/play/${game.id}`)}>
            Open live game
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Replay board">
          <Board
            board={frame.board}
            winningLine={winningLine}
            lastMove={frame.move?.cell ?? null}
            label="Replayed tic-tac-toe board"
          />

          <div className="surface mt-3 rounded-2xl p-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  setIndex(0);
                }}
                disabled={atStart}
                aria-label="First move"
              >
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  setIndex((current) => Math.max(0, current - 1));
                }}
                disabled={atStart}
                aria-label="Previous move"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (atEnd) setIndex(0);
                  setPlaying((current) => !current);
                }}
                disabled={frames.length <= 1}
                aria-label={playing ? 'Pause replay' : 'Play replay'}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                {playing ? 'Pause' : 'Play'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  setIndex((current) => Math.min(lastIndex, current + 1));
                }}
                disabled={atEnd}
                aria-label="Next move"
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  setIndex(lastIndex);
                }}
                disabled={atEnd}
                aria-label="Final move"
              >
                <ChevronsRight className="size-4" />
              </Button>
              <span className="ml-auto pr-1 font-mono text-xs text-muted tabular-nums">
                {index} / {lastIndex}
              </span>
            </div>

            <div className="mt-3 px-1">
              <label htmlFor="replay-scrubber" className="sr-only">
                Replay position
              </label>
              <input
                id="replay-scrubber"
                type="range"
                min={0}
                max={lastIndex}
                value={index}
                onChange={(event) => {
                  setPlaying(false);
                  setIndex(Number(event.target.value));
                }}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--accent)]"
              />
              <div className="mt-2 flex items-center justify-between text-[0.65rem] text-subtle">
                <span>Start</span>
                <span>
                  Move {frame.moveNumber} of {detail.data.moves.length}
                </span>
                <span>Final</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-3" aria-label="Replay details">
          <div className="rounded-2xl border border-line bg-bg/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Result</p>
                <p
                  className={cn(
                    'mt-1 text-2xl font-semibold tracking-tight',
                    result.tone === 'win' && 'text-accent',
                    result.tone === 'loss' && 'text-danger',
                  )}
                >
                  {result.label}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {finishReasonLabel(game)}
                  {game.winner && game.winner !== 'draw' ? ` · ${game.winner}` : ''}
                </p>
              </div>
              <span className="rounded-lg border border-line bg-panel-raised px-2 py-1 text-[0.65rem] font-semibold text-muted">
                {game.mode === 'single' ? difficultyLabel(game.difficulty) : 'Multi'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/30 p-3">
            <p className="eyebrow mb-2 px-1">Players</p>
            <div className="space-y-2">
              <PlayerCard
                player={game.playerX}
                symbol="X"
                isYou={game.playerX.id === me.id}
                active={
                  frame.board.filter(Boolean).length % 2 === 0 && final && game.status === 'active'
                }
              />
              <PlayerCard
                player={game.playerO}
                symbol="O"
                isYou={game.playerO?.id === me.id}
                fallbackName={game.mode === 'single' ? 'Computer' : undefined}
                label={
                  game.mode === 'single' ? `${difficultyLabel(game.difficulty)} AI` : undefined
                }
                active={
                  frame.board.filter(Boolean).length % 2 === 1 && final && game.status === 'active'
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/30 p-4">
            <p className="eyebrow">Details</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Room</dt>
                <dd className="font-mono font-semibold tracking-wider">{game.code}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Started</dt>
                <dd>{startedAt ? formatDateTime(startedAt) : 'Not started'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Finished</dt>
                <dd>{finishedAt ? formatDateTime(finishedAt) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Duration</dt>
                <dd>{duration ?? '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-bg/30 p-3">
            <p className="eyebrow mb-2 px-1">Moves</p>
            {detail.data.moves.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted">No moves were recorded.</p>
            ) : (
              <div className="no-scrollbar max-h-64 space-y-1 overflow-y-auto">
                {detail.data.moves.map((move, moveIndex) => {
                  const mover =
                    move.playerId === null
                      ? 'Computer'
                      : move.playerId === game.playerX.id
                        ? game.playerX.displayName
                        : (game.playerO?.displayName ?? 'Player');

                  return (
                    <button
                      key={move.moveNumber}
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setIndex(moveIndex + 1);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition',
                        index === moveIndex + 1
                          ? 'bg-panel-raised text-fg'
                          : 'text-muted hover:bg-panel-raised/60 hover:text-fg',
                      )}
                    >
                      <span className="w-4 text-subtle tabular-nums">{move.moveNumber}</span>
                      <span className="size-3.5 shrink-0">
                        <Mark symbol={move.symbol} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{mover}</span>
                      <span className="font-mono text-[0.65rem] text-subtle">
                        {String.fromCharCode(65 + move.cell)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
