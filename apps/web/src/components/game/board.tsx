import type { Cell, PlayerSymbol } from '@ttt/game-engine';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { Mark } from './mark';

interface BoardProps {
  readonly board: readonly Cell[];
  readonly winningLine?: readonly number[] | null;
  readonly lastMove?: number | null;
  readonly turn?: PlayerSymbol;
  readonly disabled?: boolean;
  readonly onMove?: ((cell: number) => void) | undefined;
  readonly label?: string;
}

function center(index: number): { x: number; y: number } {
  return {
    x: (index % 3) * 100 + 50,
    y: Math.floor(index / 3) * 100 + 50,
  };
}

function WinLine({ cells }: { cells: readonly number[] }) {
  const reduceMotion = useReducedMotion();
  const start = center(cells[0] ?? 0);
  const end = center(cells[2] ?? 8);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 300"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-2 z-10"
    >
      <motion.line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="var(--accent)"
        strokeWidth="7"
        strokeLinecap="round"
        initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
    </svg>
  );
}

export function Board({
  board,
  winningLine,
  lastMove = null,
  turn = 'X',
  disabled = false,
  onMove,
  label = 'Tic-tac-toe board',
}: BoardProps) {
  const interactive = typeof onMove === 'function';
  const firstEmpty = board.findIndex((cell) => cell === null);
  const [focusIndex, setFocusIndex] = useState(firstEmpty >= 0 ? firstEmpty : 0);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!interactive || disabled) return;

    if (board[focusIndex] === null) return;

    const next = board.findIndex((cell) => cell === null);
    if (next >= 0) setFocusIndex(next);
  }, [board, disabled, focusIndex, interactive]);

  const moveFocus = (nextIndex: number) => {
    setFocusIndex(nextIndex);
    buttonRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!interactive) return;

    const row = Math.floor(index / 3);
    const col = index % 3;
    let next: number | null = null;

    if (event.key === 'ArrowUp') next = ((row + 2) % 3) * 3 + col;
    if (event.key === 'ArrowDown') next = ((row + 1) % 3) * 3 + col;
    if (event.key === 'ArrowLeft') next = row * 3 + ((col + 2) % 3);
    if (event.key === 'ArrowRight') next = row * 3 + ((col + 1) % 3);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 8;

    if (next !== null) {
      event.preventDefault();
      moveFocus(next);
    }
  };

  const cellClasses = (cell: Cell, index: number) =>
    cn(
      'group relative aspect-square rounded-[1.15rem] border border-line/80 bg-bg/45 p-3 outline-none transition duration-150 sm:rounded-[1.4rem] sm:p-4',
      interactive && !disabled && cell === null && 'hover:border-line-strong hover:bg-panel-raised',
      interactive &&
        !disabled &&
        'focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30',
      lastMove === index && cell !== null && 'border-accent/40 bg-accent/[0.04]',
      winningLine?.includes(index) && 'border-accent/40 bg-accent/[0.07]',
    );

  return (
    <div className="relative rounded-[1.7rem] border border-line bg-panel/55 p-2 shadow-lift backdrop-blur-sm sm:rounded-[2rem] sm:p-2.5">
      <div
        role={interactive ? 'group' : 'img'}
        aria-label={
          interactive
            ? label
            : `${label}: ${board
                .map((cell, index) => `cell ${index + 1} ${cell ?? 'empty'}`)
                .join(', ')}`
        }
        className="grid grid-cols-3 gap-1.5 sm:gap-2"
      >
        {board.map((cell, index) => {
          const row = Math.floor(index / 3) + 1;
          const column = (index % 3) + 1;
          const unavailable = disabled || cell !== null;

          if (!interactive) {
            return (
              <div key={index} aria-hidden="true" className={cellClasses(cell, index)}>
                {cell ? <Mark symbol={cell} /> : null}
              </div>
            );
          }

          return (
            <button
              key={index}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              tabIndex={focusIndex === index ? 0 : -1}
              aria-label={`Row ${row}, column ${column}: ${cell ?? 'empty'}`}
              aria-disabled={unavailable}
              onClick={() => {
                if (!unavailable) onMove?.(index);
              }}
              onFocus={() => setFocusIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(cellClasses(cell, index), unavailable && 'cursor-default')}
            >
              {cell ? (
                <Mark key={cell} symbol={cell} animate={lastMove === index} />
              ) : interactive && !disabled ? (
                <span className="absolute inset-[24%] opacity-0 transition-opacity duration-150 group-hover:opacity-[0.14] group-focus-visible:opacity-[0.14]">
                  <Mark symbol={turn} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {winningLine && winningLine.length === 3 ? <WinLine cells={winningLine} /> : null}
    </div>
  );
}
