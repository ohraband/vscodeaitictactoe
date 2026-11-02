import { displayNameSchema } from '@ttt/contracts';
import { ArrowRight, CircleDot, Radio, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useCreateSession } from '../api/queries';
import { Board } from '../components/game/board';
import { Button } from '../components/ui/button';
import { FieldError, Input } from '../components/ui/form';
import { Logo } from '../components/ui/logo';

const demoBoard = ['X', null, 'O', null, 'X', null, 'O', null, 'X'] as const;

export function OnboardingPage() {
  const createSession = useCreateSession();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = displayNameSchema.safeParse(displayName);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Choose a display name.');
      return;
    }

    createSession.mutate(parsed.data, {
      onError: (mutationError) => {
        setError(
          mutationError instanceof ApiError && mutationError.code === 'NAME_TAKEN'
            ? 'That name is already playing. Pick another one.'
            : mutationError.message,
        );
      },
    });
  };

  return (
    <main className="relative mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-12">
      <section className="max-w-xl">
        <Logo className="size-11" />
        <p className="eyebrow mt-8">Guest sessions · No sign-up</p>
        <h1 className="mt-3 text-balance text-5xl leading-[0.92] font-semibold tracking-[-0.055em] sm:text-6xl lg:text-7xl">
          Make your <span className="text-x">move.</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-muted sm:text-lg">
          A clean board, a real opponent, and no account to manage. Play the computer or invite
          someone with a six-character code.
        </p>

        <div className="mt-8 hidden max-w-md lg:block">
          <Board
            board={demoBoard}
            winningLine={[0, 4, 8]}
            lastMove={8}
            label="Example winning board"
          />
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2 sm:max-w-md">
          {[
            { icon: CircleDot, label: 'Solo AI', detail: '3 levels' },
            { icon: Users, label: 'Private', detail: 'Room codes' },
            { icon: Radio, label: 'Realtime', detail: 'Rematches' },
          ].map(({ icon: Icon, label, detail }) => (
            <div key={label} className="rounded-2xl border border-line bg-panel/50 p-3">
              <Icon className="size-4 text-accent" />
              <p className="mt-3 text-xs font-semibold">{label}</p>
              <p className="mt-0.5 text-[0.68rem] text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface w-full max-w-md justify-self-center rounded-[2rem] p-6 sm:p-8 lg:justify-self-end">
        <p className="eyebrow">New guest</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">What should we call you?</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your name appears on the board and the casual leaderboard.
        </p>

        <form onSubmit={submit} className="mt-7" noValidate>
          <label htmlFor="display-name" className="mb-2 block text-sm font-medium">
            Display name
          </label>
          <Input
            id="display-name"
            name="displayName"
            autoComplete="nickname"
            autoFocus
            maxLength={20}
            placeholder="e.g. Ada Lovelace"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'display-name-error' : 'display-name-hint'}
          />
          {error ? (
            <div id="display-name-error">
              <FieldError>{error}</FieldError>
            </div>
          ) : (
            <p id="display-name-hint" className="mt-2 text-xs leading-5 text-subtle">
              3–20 characters. Letters, numbers, spaces, underscores, or hyphens.
            </p>
          )}

          <Button type="submit" size="lg" className="mt-6 w-full" loading={createSession.isPending}>
            Start playing
            {createSession.isPending ? null : <ArrowRight className="size-4" />}
          </Button>
        </form>

        <p className="mt-5 border-t border-line pt-5 text-xs leading-5 text-subtle">
          Your guest session stays in this browser for 30 days. Clearing cookies starts fresh.
        </p>
      </section>
    </main>
  );
}
