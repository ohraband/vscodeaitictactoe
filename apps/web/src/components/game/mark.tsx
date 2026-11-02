import type { PlayerSymbol } from '@ttt/game-engine';
import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

interface MarkProps {
  readonly symbol: PlayerSymbol;
  readonly className?: string;
  readonly animate?: boolean;
}

export function Mark({ symbol, className, animate = false }: MarkProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 10,
    strokeLinecap: 'round' as const,
  };
  const drawStyle = (durationMs: number, delayMs = 0): CSSProperties | undefined =>
    shouldAnimate
      ? ({
          strokeDasharray: 1,
          strokeDashoffset: 0,
          animation: `mark-draw ${durationMs}ms ease-out ${delayMs}ms backwards`,
        } as CSSProperties)
      : undefined;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      className={cn('size-full', symbol === 'X' ? 'text-x' : 'text-o', className)}
    >
      {symbol === 'X' ? (
        <>
          <path pathLength={1} d="M24 24 76 76" {...common} style={drawStyle(220)} />
          <path pathLength={1} d="M76 24 24 76" {...common} style={drawStyle(220, 80)} />
        </>
      ) : (
        <circle pathLength={1} cx="50" cy="50" r="26" {...common} style={drawStyle(280)} />
      )}
    </svg>
  );
}
