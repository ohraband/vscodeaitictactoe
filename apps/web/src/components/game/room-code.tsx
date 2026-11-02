import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';

export function RoomCode({ code, compact = false }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        compact
          ? 'rounded-xl border border-line bg-bg/35 px-2.5 py-1.5'
          : 'rounded-2xl border border-line bg-bg/35 p-2',
      )}
    >
      <div className={cn('min-w-0 flex-1', compact ? '' : 'px-2')}>
        {compact ? (
          <span className="block text-[0.58rem] font-bold tracking-[0.14em] text-subtle uppercase">
            Room
          </span>
        ) : null}
        <span
          className={cn(
            'block font-mono font-bold tracking-[0.18em] text-fg',
            compact ? 'text-sm' : 'text-xl sm:text-2xl',
          )}
        >
          {code}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-line-strong bg-panel-raised font-semibold transition hover:border-subtle hover:bg-panel',
          compact ? 'size-8' : 'h-10 px-3 text-xs',
        )}
        aria-label={copied ? `Room code ${code} copied` : `Copy room code ${code}`}
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        {compact ? null : <span>{copied ? 'Copied' : 'Copy'}</span>}
      </button>
    </div>
  );
}
