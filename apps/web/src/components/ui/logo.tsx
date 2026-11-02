import { cn } from '../../lib/cn';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid size-9 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 rounded-xl border border-line-strong bg-panel-raised p-2',
        className,
      )}
    >
      <span className="rounded-[2px] bg-x" />
      <span className="rounded-full border-[2.5px] border-o" />
      <span className="rounded-full border-[2.5px] border-accent" />
      <span className="rounded-[2px] bg-fg/25" />
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="text-[0.72rem] leading-[1.05] font-extrabold tracking-[0.14em] uppercase">
        Tic
        <br />
        Tac
        <br />
        Toe
      </span>
    </span>
  );
}
