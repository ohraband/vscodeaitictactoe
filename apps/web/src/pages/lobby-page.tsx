import {
  roomCodeSchema,
  type Difficulty,
  type GameSnapshot,
  type PublicPlayer,
} from '@ttt/contracts';
import { ArrowRight, Bot, Clock3, DoorOpen, LoaderCircle, Swords, Users, Zap } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useCreateGame, useGameList, useJoinGame, useQuickMatch } from '../api/queries';
import { Button } from '../components/ui/button';
import { FieldError, Input } from '../components/ui/form';
import { EmptyState } from '../components/ui/states';
import { useToast } from '../components/ui/toast';
import { cn } from '../lib/cn';
import { difficultyLabel, formatRelativeDate, opponentFor, resultForPlayer } from '../lib/format';

const difficulties = ['easy', 'medium', 'hard'] as const;

function CardShell({
  children,
  className,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={cn(
        'surface relative flex flex-col overflow-hidden rounded-[1.75rem] p-5 sm:p-6',
        accent && 'border-accent/30',
        className,
      )}
    >
      {accent ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-20 size-52 rounded-full bg-accent/10 blur-3xl"
        />
      ) : null}
      <div className="relative flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function CardHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: typeof Bot;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl border border-line bg-panel-raised text-accent">
          <Icon className="size-4" />
        </span>
        <p className="eyebrow">{eyebrow}</p>
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em]">{title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function trendLabel(game: GameSnapshot, playerId: string): string {
  if (game.status === 'waiting') return 'Waiting';
  if (game.status === 'active') return 'Resume';
  return resultForPlayer(game, playerId).label;
}

function RecentGame({ game, playerId }: { game: GameSnapshot; playerId: string }) {
  const result = resultForPlayer(game, playerId);
  const target =
    game.status === 'finished' || game.status === 'abandoned'
      ? `/history/${game.id}`
      : `/play/${game.id}`;

  return (
    <Link
      to={target}
      className="group flex items-center gap-3 rounded-2xl border border-transparent px-2.5 py-3 transition hover:border-line hover:bg-panel-raised/60 sm:px-3"
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl border text-[0.65rem] font-bold uppercase',
          game.mode === 'single' ? 'border-o/25 bg-o/10 text-o' : 'border-x/25 bg-x/10 text-x',
        )}
      >
        {game.mode === 'single' ? <Bot className="size-4" /> : <Users className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{opponentFor(game, playerId)}</span>
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold uppercase',
              result.tone === 'win' && 'bg-accent/15 text-accent',
              result.tone === 'loss' && 'bg-danger/10 text-danger',
              result.tone === 'draw' && 'bg-o/10 text-o',
              result.tone === 'neutral' && 'bg-panel-raised text-muted',
            )}
          >
            {trendLabel(game, playerId)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>{game.mode === 'single' ? difficultyLabel(game.difficulty) : 'Multiplayer'}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRelativeDate(game.createdAt)}</span>
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
    </Link>
  );
}

export function LobbyPage({ player }: { player: PublicPlayer }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createGame = useCreateGame();
  const joinGame = useJoinGame();
  const quickMatch = useQuickMatch();
  const recent = useGameList({ pageSize: 6 });
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const busy = createGame.isPending || joinGame.isPending || quickMatch.isPending;

  const notifyActionError = (error: Error, title: string) => {
    toast({
      title,
      description:
        error instanceof ApiError && error.status === 429
          ? 'A few too many requests. Give it a moment and try again.'
          : error.message,
      tone: 'error',
    });
  };

  const startSolo = () => {
    createGame.mutate(
      { mode: 'single', difficulty },
      {
        onSuccess: (game) => navigate(`/play/${game.id}`),
        onError: (error) => notifyActionError(error, 'Could not start the solo game'),
      },
    );
  };

  const createRoom = () => {
    createGame.mutate(
      { mode: 'multi', visibility: 'private' },
      {
        onSuccess: (game) => navigate(`/play/${game.id}`),
        onError: (error) => notifyActionError(error, 'Could not create the room'),
      },
    );
  };

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCodeError(null);

    const parsed = roomCodeSchema.safeParse(code);

    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? 'Enter a valid room code.');
      return;
    }

    joinGame.mutate(parsed.data, {
      onSuccess: (game) => navigate(`/play/${game.id}`),
      onError: (error) => setCodeError(error.message),
    });
  };

  const findMatch = () => {
    quickMatch.mutate(undefined, {
      onSuccess: (game) => navigate(`/play/${game.id}`),
      onError: (error) => notifyActionError(error, 'Could not find a match'),
    });
  };

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Welcome back, {player.displayName}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Pick your table.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Play the computer, open a private room, or jump into the first available match.
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-xl border border-line bg-panel/45 px-3 py-2 text-xs text-muted sm:flex">
          <Clock3 className="size-3.5 text-accent" />
          60-second turns · Reconnect safe
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <CardShell accent>
          <CardHeading
            icon={Bot}
            eyebrow="Solo"
            title="Play the computer"
            description="Three difficulty levels, from gentle to genuinely sharp."
          />
          <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-line bg-bg/30 p-1">
            {difficulties.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDifficulty(value)}
                aria-pressed={difficulty === value}
                className={cn(
                  'rounded-lg px-2 py-2 text-xs font-semibold transition',
                  difficulty === value
                    ? 'bg-accent text-accent-fg'
                    : 'text-muted hover:bg-panel-raised hover:text-fg',
                )}
              >
                {difficultyLabel(value)}
              </button>
            ))}
          </div>
          <div className="mt-auto pt-4">
            <Button
              className="w-full"
              onClick={startSolo}
              loading={createGame.isPending && createGame.variables?.mode === 'single'}
              disabled={busy}
            >
              Start solo game
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardShell>

        <CardShell>
          <CardHeading
            icon={Users}
            eyebrow="Private room"
            title="Challenge a friend"
            description="Open a table, share the six-character code, and play in realtime."
          />
          <div className="mt-5">
            <Button
              variant="secondary"
              className="w-full"
              onClick={createRoom}
              loading={createGame.isPending && createGame.variables?.mode === 'multi'}
              disabled={busy}
            >
              <DoorOpen className="size-4" />
              Create private room
            </Button>
          </div>
          <div className="my-4 flex items-center gap-3 text-[0.62rem] font-semibold tracking-wider text-subtle uppercase">
            <span className="h-px flex-1 bg-line" />
            or join
            <span className="h-px flex-1 bg-line" />
          </div>
          <form onSubmit={joinRoom} noValidate>
            <label htmlFor="room-code" className="sr-only">
              Room code
            </label>
            <div className="flex gap-2">
              <Input
                id="room-code"
                value={code}
                onChange={(event) => {
                  setCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6),
                  );
                  setCodeError(null);
                }}
                placeholder="ABC234"
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-[0.16em] uppercase"
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? 'room-code-error' : undefined}
              />
              <Button
                type="submit"
                variant="secondary"
                className="shrink-0"
                loading={joinGame.isPending}
                disabled={busy || code.length === 0}
              >
                Join
              </Button>
            </div>
            {codeError ? (
              <div id="room-code-error">
                <FieldError>{codeError}</FieldError>
              </div>
            ) : null}
          </form>
        </CardShell>

        <CardShell>
          <CardHeading
            icon={Zap}
            eyebrow="Quick match"
            title="Find an open table"
            description="Match with the longest-waiting public room, or open a new one."
          />
          <div className="mt-5 rounded-2xl border border-line bg-bg/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Matchmaking is open
            </div>
            <p className="mt-2 text-xs leading-5 text-subtle">
              No rank or queue. Just the next available guest.
            </p>
          </div>
          <div className="mt-auto pt-4">
            <Button
              variant="secondary"
              className="w-full"
              onClick={findMatch}
              loading={quickMatch.isPending}
              disabled={busy}
            >
              <Swords className="size-4" />
              Quick match
            </Button>
          </div>
        </CardShell>
      </div>

      <section className="mt-7" aria-labelledby="recent-heading">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Your table</p>
            <h2 id="recent-heading" className="mt-1 text-xl font-semibold tracking-tight">
              Recent games
            </h2>
          </div>
          <Link
            to="/history"
            className="text-sm font-medium text-muted underline-offset-4 transition hover:text-fg hover:underline"
          >
            Full history
          </Link>
        </div>

        <div className="surface rounded-[1.75rem] p-2">
          {recent.isPending ? (
            <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" />
              Loading your games…
            </div>
          ) : recent.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-8">
              <p className="text-sm text-muted">Recent games could not be loaded.</p>
              <Button variant="secondary" size="sm" onClick={() => void recent.refetch()}>
                Retry
              </Button>
            </div>
          ) : recent.data.games.length === 0 ? (
            <EmptyState
              title="No games on the board yet"
              description="Start a solo game or open a room. Your finished matches will land here."
            />
          ) : (
            <div className="divide-y divide-line/70">
              {recent.data.games.map((game) => (
                <RecentGame key={game.id} game={game} playerId={player.id} />
              ))}
            </div>
          )}
        </div>
      </section>

      <p className="mt-4 text-center text-[0.68rem] text-subtle">
        {recent.data
          ? `${recent.data.total} ${recent.data.total === 1 ? 'game' : 'games'} on record`
          : null}
      </p>
    </div>
  );
}
