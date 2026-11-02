import type { GameSnapshot, GameStatus } from '@ttt/contracts';
import { Bot, ChevronLeft, ChevronRight, Clock3, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameList, useMe } from '../api/queries';
import type { GameListFilters } from '../api/client';
import { Button } from '../components/ui/button';
import { selectStyles } from '../components/ui/form';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { cn } from '../lib/cn';
import {
  difficultyLabel,
  formatDateTime,
  formatDuration,
  opponentFor,
  resultForPlayer,
  statusLabel,
} from '../lib/format';

type ModeFilter = 'all' | 'single' | 'multi';
type StatusFilter = 'all' | GameStatus;

const PAGE_SIZE = 12;

function gameDuration(game: GameSnapshot): string | null {
  if (!game.startedAt || !game.finishedAt) return null;

  const seconds = (new Date(game.finishedAt).getTime() - new Date(game.startedAt).getTime()) / 1000;

  return Number.isFinite(seconds) ? formatDuration(seconds) : null;
}

function HistoryRow({ game, playerId }: { game: GameSnapshot; playerId: string }) {
  const result = resultForPlayer(game, playerId);
  const duration = gameDuration(game);
  const replayable = game.status === 'finished' || game.status === 'abandoned';
  const target = replayable ? `/history/${game.id}` : `/play/${game.id}`;

  return (
    <Link
      to={target}
      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-transparent px-2 py-3 transition hover:border-line hover:bg-panel-raised/55 sm:px-3"
    >
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl border',
          game.mode === 'single' ? 'border-o/25 bg-o/10 text-o' : 'border-x/25 bg-x/10 text-x',
        )}
      >
        {game.mode === 'single' ? <Bot className="size-5" /> : <Users className="size-5" />}
      </span>

      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold">{opponentFor(game, playerId)}</span>
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold uppercase',
              result.tone === 'win' && 'bg-accent/15 text-accent',
              result.tone === 'loss' && 'bg-danger/10 text-danger',
              result.tone === 'draw' && 'bg-o/10 text-o',
              result.tone === 'neutral' && 'bg-panel-raised text-muted',
            )}
          >
            {replayable ? result.label : statusLabel(game.status)}
          </span>
          <span className="rounded-md border border-line px-1.5 py-0.5 text-[0.6rem] font-semibold text-subtle">
            {game.mode === 'single' ? difficultyLabel(game.difficulty) : 'Multiplayer'}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{formatDateTime(game.createdAt)}</span>
          {duration ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" />
                {duration}
              </span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span className="font-mono tracking-wider">{game.code}</span>
        </span>
      </span>

      <span className="flex items-center gap-1 text-xs font-semibold text-muted transition group-hover:text-fg">
        {replayable ? 'Replay' : 'Open'}
        <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-3">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export function HistoryPage() {
  const { data: me } = useMe();
  const [mode, setMode] = useState<ModeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const filters: GameListFilters = {
    page,
    pageSize: PAGE_SIZE,
    ...(mode !== 'all' ? { mode } : {}),
    ...(status !== 'all' ? { status } : {}),
  };
  const games = useGameList(filters);

  if (!me) return null;

  const totalPages = games.data ? Math.max(1, Math.ceil(games.data.total / PAGE_SIZE)) : 1;
  const setModeFilter = (next: ModeFilter) => {
    setMode(next);
    setPage(1);
  };
  const setStatusFilter = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Archive</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Your record.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Every game is stored server-side. Open a finished match to walk through the moves.
          </p>
        </div>
        {games.data ? (
          <p className="rounded-xl border border-line bg-panel/45 px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-fg">{games.data.total}</span>{' '}
            {games.data.total === 1 ? 'game' : 'games'}
          </p>
        ) : null}
      </div>

      <div className="mb-3 flex flex-col justify-between gap-3 rounded-2xl border border-line bg-panel/45 p-2 sm:flex-row sm:items-center">
        <div
          role="group"
          aria-label="Filter by mode"
          className="grid grid-cols-3 gap-1 rounded-xl bg-bg/35 p-1"
        >
          {(
            [
              ['all', 'All modes'],
              ['single', 'Solo'],
              ['multi', 'Multiplayer'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setModeFilter(value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                mode === value ? 'bg-panel-raised text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-1">
          <label htmlFor="history-status" className="text-xs font-medium text-muted">
            Status
          </label>
          <select
            id="history-status"
            value={status}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className={selectStyles}
          >
            <option value="all">Any status</option>
            <option value="active">Live</option>
            <option value="waiting">Waiting</option>
            <option value="finished">Finished</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
      </div>

      <div className="surface rounded-[1.75rem] p-2">
        {games.isPending ? (
          <HistorySkeleton />
        ) : games.isError ? (
          <ErrorState
            title="History unavailable"
            description={games.error.message}
            onRetry={() => void games.refetch()}
          />
        ) : games.data.games.length === 0 ? (
          <EmptyState
            title={
              mode === 'all' && status === 'all' ? 'No games yet' : 'No games match those filters'
            }
            description={
              mode === 'all' && status === 'all'
                ? 'Play a game and it will appear here with a full move-by-move replay.'
                : 'Try widening the filters to see more of your archive.'
            }
            action={
              <Link
                to="/"
                className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg"
              >
                Find a table
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-line/70">
            {games.data.games.map((game) => (
              <HistoryRow key={game.id} game={game} playerId={me.id} />
            ))}
          </div>
        )}
      </div>

      {games.data && games.data.total > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || games.isFetching}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-xs text-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || games.isFetching}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
