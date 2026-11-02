import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Board } from '../components/game/board';

const board = ['X', 'O', 'X', 'O', null, 'X', 'O', 'X', 'O'] as const;

export function NotFoundPage() {
  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 py-8 md:grid-cols-2 md:py-16">
      <div className="max-w-md">
        <p className="eyebrow text-danger">404 · Empty square</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          This square is empty.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted sm:text-base">
          The page you are looking for is not part of this board. Head back to the lobby and make a
          move that counts.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg"
        >
          <ArrowLeft className="size-4" />
          Back to lobby
        </Link>
      </div>
      <div className="mx-auto w-full max-w-xs opacity-80">
        <Board board={board} label="An almost full tic-tac-toe board" />
      </div>
    </div>
  );
}
