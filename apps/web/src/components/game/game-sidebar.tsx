import type { GameSnapshot, PublicPlayer } from '@ttt/contracts';
import { Clock3, LogOut, RotateCcw, Sparkles, WifiOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  difficultyLabel,
  formatDuration,
  finishReasonLabel,
  isMyTurn,
  playerForSymbol,
  resultForPlayer,
} from '../../lib/format';
import type { ConnectionState } from '../../stores/game-store';
import { Button } from '../ui/button';
import { Mark } from './mark';
import { PlayerCard } from './player-card';
import { RoomCode } from './room-code';
import { useCountdown } from './use-countdown';

interface GameSidebarProps {
  readonly game: GameSnapshot;
  readonly me: PublicPlayer;
  readonly connection: ConnectionState;
  readonly presence: Readonly<Record<string, boolean>>;
  readonly onLeave: () => void;
  readonly onRematch: () => void;
  readonly rematchLoading: boolean;
  readonly onReconnect: () => void;
}

function TurnCard({
  game,
  me,
  presence,
  connection,
}: {
  game: GameSnapshot;
  me: PublicPlayer;
  presence: Readonly<Record<string, boolean>>;
  connection: ConnectionState;
}) {
  const seconds = useCountdown(game.status === 'active' ? game.turnDeadline : null);
  const turnPlayer = playerForSymbol(game, game.turn);
  const myTurn = isMyTurn(game, me.id);
  const opponent = game.playerX.id === me.id ? game.playerO : game.playerX;
  const opponentOnline =
    game.mode === 'multi' && opponent ? presence[opponent.id] === true : undefined;
  const result = resultForPlayer(game, me.id);

  if (game.status === 'waiting') {
    const publicTable = game.visibility === 'public';

    return (
      <div className="rounded-2xl border border-accent/25 bg-accent/[0.055] p-4">
        <p className="eyebrow text-accent">{publicTable ? 'Matchmaking' : 'Waiting room'}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          {publicTable ? 'Finding a rival' : 'Invite a rival'}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          {publicTable
            ? 'Your table is listed publicly. The board unlocks when another player joins.'
            : 'Share this code. The board unlocks the moment they join.'}
        </p>
        {publicTable ? null : (
          <div className="mt-4">
            <RoomCode code={game.code} />
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          <span className="flex gap-1">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            <span className="size-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
          </span>
          {publicTable ? 'Waiting for a challenger' : 'Waiting for an opponent'}
        </div>
      </div>
    );
  }

  if (game.status !== 'active') {
    return (
      <div className="rounded-2xl border border-line bg-bg/30 p-4">
        <p className="eyebrow">Result</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h2
            className={cn(
              'text-2xl font-semibold tracking-tight',
              result.tone === 'win' && 'text-accent',
              result.tone === 'loss' && 'text-danger',
            )}
          >
            {result.label}
          </h2>
          <span className="text-xs text-muted">{finishReasonLabel(game)}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{result.detail}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-bg/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{myTurn ? 'Your turn' : "Opponent's turn"}</p>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="size-7">
              <Mark symbol={game.turn} />
            </span>
            <h2 className="text-xl font-semibold tracking-tight">
              {game.mode === 'single'
                ? myTurn
                  ? 'Make your move'
                  : 'Computer thinking'
                : myTurn
                  ? 'Make your move'
                  : `${turnPlayer.displayName} is thinking`}
            </h2>
          </div>
        </div>
        {seconds !== null ? (
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums',
              seconds <= 10
                ? 'border-danger/40 bg-danger/10 text-danger'
                : 'border-line bg-panel-raised text-fg',
            )}
            aria-label={`${Math.ceil(seconds)} seconds left`}
          >
            <Clock3 className="size-3.5" />
            {formatDuration(seconds)}
          </div>
        ) : null}
      </div>
      {game.mode === 'multi' ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          {connection !== 'connected' ? (
            <>
              <WifiOff className="size-3.5 text-danger" />
              Reconnecting before the next move
            </>
          ) : opponentOnline ? (
            <>
              <span className="size-1.5 rounded-full bg-success" />
              Both players are here
            </>
          ) : (
            <>
              <span className="size-1.5 rounded-full bg-subtle" />
              Opponent is offline · The clock keeps running
            </>
          )}
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted">
          {difficultyLabel(game.difficulty)} AI · The computer replies instantly.
        </p>
      )}
    </div>
  );
}

function rematchCopy(game: GameSnapshot, me: PublicPlayer): string {
  const mySymbol = game.playerX.id === me.id ? 'X' : 'O';
  const requested = mySymbol === 'X' ? game.rematchRequestedByX : game.rematchRequestedByO;
  const opponentRequested = mySymbol === 'X' ? game.rematchRequestedByO : game.rematchRequestedByX;

  if (requested) return 'Rematch requested';
  if (opponentRequested) return 'Accept rematch';

  return 'Rematch';
}

export function GameSidebar({
  game,
  me,
  connection,
  presence,
  onLeave,
  onRematch,
  rematchLoading,
  onReconnect,
}: GameSidebarProps) {
  const mySymbol = game.playerX.id === me.id ? 'X' : 'O';
  const myRequested = mySymbol === 'X' ? game.rematchRequestedByX : game.rematchRequestedByO;
  const leaveLabel =
    game.status === 'waiting'
      ? 'Close room'
      : game.status === 'active'
        ? 'Leave game'
        : 'Back to lobby';

  return (
    <aside className="space-y-3" aria-label="Game details">
      {connection === 'disconnected' ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-3"
        >
          <WifiOff className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Live connection lost</p>
            <p className="mt-0.5 text-xs leading-5 text-muted">
              We are reconnecting. Moves are paused until the board resyncs.
            </p>
            <button
              type="button"
              onClick={onReconnect}
              className="mt-2 text-xs font-semibold text-fg underline underline-offset-2"
            >
              Retry now
            </button>
          </div>
        </div>
      ) : null}

      <TurnCard game={game} me={me} presence={presence} connection={connection} />

      <div className="rounded-2xl border border-line bg-bg/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Players</p>
          {game.mode === 'multi' && game.status === 'active' ? (
            <RoomCode code={game.code} compact />
          ) : null}
        </div>
        <div className="space-y-2">
          <PlayerCard
            player={game.playerX}
            symbol="X"
            isYou={game.playerX.id === me.id}
            online={game.mode === 'multi' ? presence[game.playerX.id] === true : undefined}
            active={game.status === 'active' && game.turn === 'X'}
          />
          <PlayerCard
            player={game.playerO}
            symbol="O"
            isYou={game.playerO?.id === me.id}
            online={
              game.playerO && game.mode === 'multi' ? presence[game.playerO.id] === true : undefined
            }
            active={game.status === 'active' && game.turn === 'O'}
            fallbackName={game.mode === 'single' ? 'Computer' : undefined}
            label={
              game.mode === 'single'
                ? `${difficultyLabel(game.difficulty)} AI`
                : game.playerO
                  ? undefined
                  : game.visibility === 'public'
                    ? 'Matchmaking'
                    : 'Invite pending'
            }
          />
        </div>
      </div>

      {game.status === 'finished' && game.mode === 'multi' ? (
        <div className="rounded-2xl border border-line bg-bg/30 p-3">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="text-xs leading-5 text-muted">
              {myRequested
                ? 'Your rematch vote is in. Waiting for your opponent.'
                : 'Run it back? Both players need to agree.'}
            </p>
          </div>
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={onRematch}
            loading={rematchLoading}
            disabled={myRequested}
          >
            <RotateCcw className="size-4" />
            {rematchCopy(game, me)}
          </Button>
        </div>
      ) : null}

      <Button variant="ghost" className="w-full justify-start" onClick={onLeave}>
        <LogOut className="size-4" />
        {leaveLabel}
      </Button>
    </aside>
  );
}
