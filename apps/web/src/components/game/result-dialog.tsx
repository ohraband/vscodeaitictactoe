import type { GameSnapshot } from '@ttt/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import { finishReasonLabel, resultForPlayer } from '../../lib/format';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';

const confettiColors = ['var(--accent)', 'var(--x)', 'var(--o)', 'var(--fg)'];

function Confetti() {
  const reduceMotion = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        id: index,
        x: (index % 2 === 0 ? 1 : -1) * (18 + ((index * 37) % 150)),
        y: -25 - ((index * 29) % 150),
        rotate: (index * 67) % 260,
        color: confettiColors[index % confettiColors.length],
        delay: (index % 7) * 0.02,
      })),
    [],
  );

  if (reduceMotion) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute top-1/3 left-1/2 size-1.5 rounded-[1px]"
          style={{ backgroundColor: piece.color }}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{ opacity: 0, x: piece.x, y: piece.y, rotate: piece.rotate }}
          transition={{ duration: 1, delay: piece.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

interface ResultDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly game: GameSnapshot;
  readonly playerId: string;
  readonly onRematch: () => void;
  readonly rematchLoading: boolean;
  readonly onPlayAgain: () => void;
  readonly playAgainLoading: boolean;
  readonly onLobby: () => void;
}

export function ResultDialog({
  open,
  onOpenChange,
  game,
  playerId,
  onRematch,
  rematchLoading,
  onPlayAgain,
  playAgainLoading,
  onLobby,
}: ResultDialogProps) {
  const result = resultForPlayer(game, playerId);
  const mySymbol = game.playerX.id === playerId ? 'X' : 'O';
  const requested = mySymbol === 'X' ? game.rematchRequestedByX : game.rematchRequestedByO;
  const opponentRequested = mySymbol === 'X' ? game.rematchRequestedByO : game.rematchRequestedByX;

  const title =
    result.tone === 'win'
      ? 'Victory is yours.'
      : result.tone === 'loss'
        ? 'That one got away.'
        : result.tone === 'draw'
          ? 'Honours even.'
          : 'Game complete.';

  const rematchLabel = requested
    ? 'Rematch requested'
    : opponentRequested
      ? 'Accept rematch'
      : 'Request rematch';

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`${result.detail} ${finishReasonLabel(game)}.`}
    >
      <Confetti />
      <div className="relative z-10">
        <div
          className={cn(
            'mb-6 flex items-center justify-center gap-3 rounded-2xl border border-line bg-bg/35 p-4',
          )}
        >
          <span
            className={cn(
              'text-4xl font-black tracking-tight',
              result.tone === 'win'
                ? 'text-accent'
                : result.tone === 'loss'
                  ? 'text-danger'
                  : 'text-fg',
            )}
          >
            {result.label}
          </span>
          <span className="text-sm text-muted">
            {game.winner === 'draw' ? 'No winner' : `${game.winner ?? '?'} takes the line`}
          </span>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onLobby}>
            Back to lobby
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Review board
          </Button>
          {game.mode === 'multi' ? (
            <Button
              onClick={onRematch}
              loading={rematchLoading}
              disabled={requested}
              title={requested ? 'Waiting for your opponent' : undefined}
            >
              {rematchLabel}
            </Button>
          ) : (
            <Button onClick={onPlayAgain} loading={playAgainLoading}>
              Play again
            </Button>
          )}
        </div>
        {game.mode === 'multi' ? (
          <p className="mt-3 text-right text-xs text-subtle">
            {requested
              ? 'Waiting for your opponent to accept.'
              : 'Both players need to agree to a rematch.'}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
