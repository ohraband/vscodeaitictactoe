import type { PublicPlayer } from '@ttt/contracts';
import type { PlayerSymbol } from '@ttt/game-engine';
import { cn } from '../../lib/cn';
import { Mark } from './mark';

interface PlayerCardProps {
  readonly player: PublicPlayer | null;
  readonly symbol: PlayerSymbol;
  readonly isYou?: boolean;
  readonly online?: boolean | undefined;
  readonly active?: boolean;
  readonly label?: string | undefined;
  readonly fallbackName?: string | undefined;
}

export function PlayerCard({
  player,
  symbol,
  isYou = false,
  online,
  active = false,
  label,
  fallbackName,
}: PlayerCardProps) {
  const name = player?.displayName ?? fallbackName ?? 'Waiting for rival';
  const initial = (player?.displayName ?? fallbackName)?.slice(0, 1).toUpperCase() ?? '?';

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3 transition-colors',
        active ? 'border-accent/50 bg-accent/[0.055]' : 'border-line bg-bg/25',
      )}
    >
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl border bg-panel-raised text-sm font-bold',
          player || fallbackName ? 'border-line-strong' : 'border-dashed border-line text-subtle',
          symbol === 'X' ? 'text-x' : 'text-o',
        )}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate text-sm font-semibold', !player && 'text-muted')}>
            {name}
          </span>
          {isYou ? (
            <span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-accent uppercase">
              You
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[0.68rem] text-muted">
          {label ? <span>{label}</span> : null}
          {online !== undefined && player ? (
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  online ? 'bg-success [animation:ping-soft_2s_ease-out_infinite]' : 'bg-subtle',
                )}
              />
              {online ? 'Online' : 'Offline'}
            </span>
          ) : null}
        </div>
      </div>
      <span className="size-8 shrink-0 opacity-90">
        <Mark symbol={symbol} />
      </span>
    </div>
  );
}
