import type { PublicPlayer } from '@ttt/contracts';
import { Crown, Info, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeaderboard } from '../api/queries';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { cn } from '../lib/cn';

function rankStyle(rank: number): string {
  if (rank === 1) return 'border-accent/40 bg-accent/15 text-accent';
  if (rank === 2) return 'border-o/35 bg-o/10 text-o';
  if (rank === 3) return 'border-x/35 bg-x/10 text-x';
  return 'border-line bg-panel-raised text-muted';
}

function LeaderboardSkeleton() {
  return (
    <div className="surface rounded-[1.75rem] p-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-4">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function LeaderboardPage({ player }: { player: PublicPlayer }) {
  const leaderboard = useLeaderboard();
  const entries = leaderboard.data?.entries ?? [];
  const myEntry = entries.find((entry) => entry.player.id === player.id);
  const minimumGames = leaderboard.data?.minimumGames ?? 5;
  const totalGames = entries.reduce((sum, entry) => sum + entry.games, 0);

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Casual rankings</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            The leaderboard.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Wins and win rate across finished multiplayer games. No ELO, no pressure.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-xl border border-line bg-panel/45 px-3 py-2 text-xs text-muted sm:self-auto">
          <Trophy className="size-3.5 text-accent" />
          Top {Math.max(entries.length, 50)} · Min {minimumGames} games
        </span>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="surface rounded-2xl p-4">
          <p className="eyebrow">Ranked players</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{entries.length}</p>
        </div>
        <div className="surface rounded-2xl p-4">
          <p className="eyebrow">Games counted</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{totalGames}</p>
        </div>
        <div className={cn('surface rounded-2xl p-4', myEntry && 'border-accent/35')}>
          <p className="eyebrow">Your rank</p>
          <p className="mt-2 flex items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums">
            {myEntry ? `#${myEntry.rank}` : '—'}
            <span className="font-sans text-[0.65rem] font-medium text-muted">
              {myEntry ? `${myEntry.wins} wins` : `${minimumGames} multiplayer games to qualify`}
            </span>
          </p>
        </div>
      </div>

      {leaderboard.isPending ? (
        <LeaderboardSkeleton />
      ) : leaderboard.isError ? (
        <ErrorState
          title="Leaderboard unavailable"
          description={leaderboard.error.message}
          onRetry={() => void leaderboard.refetch()}
        />
      ) : entries.length === 0 ? (
        <div className="surface rounded-[1.75rem]">
          <EmptyState
            title="No ranked players yet"
            description={`Play and finish ${minimumGames} multiplayer games to join the board. Solo games never count toward the leaderboard.`}
            action={
              <Link
                to="/"
                className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg"
              >
                Open a table
              </Link>
            }
          />
        </div>
      ) : (
        <div className="surface overflow-hidden rounded-[1.75rem]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <caption className="sr-only">
                Multiplayer leaderboard ranked by wins, then win rate
              </caption>
              <thead>
                <tr className="border-b border-line text-[0.62rem] tracking-[0.12em] text-subtle uppercase">
                  <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Player
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Games
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    W–D–L
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Win rate
                  </th>
                  <th scope="col" className="w-36 px-4 py-3 font-semibold sm:px-5">
                    <span className="sr-only">Rate bar</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {entries.map((entry) => {
                  const isMe = entry.player.id === player.id;
                  const initial = entry.player.displayName.slice(0, 1).toUpperCase();

                  return (
                    <tr
                      key={entry.player.id}
                      className={cn(
                        'transition-colors hover:bg-panel-raised/45',
                        isMe && 'bg-accent/[0.045]',
                      )}
                    >
                      <td className="px-4 py-3.5 sm:px-5">
                        <span
                          className={cn(
                            'inline-grid size-8 place-items-center rounded-lg border font-mono text-xs font-bold tabular-nums',
                            rankStyle(entry.rank),
                          )}
                        >
                          {entry.rank === 1 ? <Crown className="size-3.5" /> : entry.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line-strong bg-panel-raised text-xs font-bold">
                            {initial}
                          </span>
                          <span className="truncate text-sm font-semibold">
                            {entry.player.displayName}
                          </span>
                          {isMe ? (
                            <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.58rem] font-bold tracking-wider text-accent uppercase">
                              You
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums text-muted">
                        {entry.games}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums">
                        <span className="text-success">{entry.wins}</span>
                        <span className="text-subtle">–{entry.draws}–</span>
                        <span className="text-danger">{entry.losses}</span>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-xs font-semibold tabular-nums">
                        {Math.round(entry.winRate * 100)}%
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-line"
                          role="img"
                          aria-label={`${Math.round(entry.winRate * 100)} percent win rate`}
                        >
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${Math.max(2, entry.winRate * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-line bg-panel/35 p-3 text-xs leading-5 text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
        <p>
          Casual guest leaderboard. Only finished multiplayer games count; solo results are
          excluded, and names are not verified. Ranking is by wins, then win rate.
        </p>
      </div>
    </div>
  );
}
