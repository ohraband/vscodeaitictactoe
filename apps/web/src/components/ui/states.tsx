import { AlertTriangle, ArrowLeft, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { buttonStyles } from './button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative overflow-hidden rounded-xl bg-panel-raised', className)}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent [animation:shimmer_1.8s_infinite]" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-panel-raised text-muted">
        <Inbox className="size-5" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  backTo,
}: {
  readonly title?: string;
  readonly description: string;
  readonly onRetry?: () => void;
  readonly backTo?: string;
}) {
  return (
    <div className="surface mx-auto my-12 max-w-xl rounded-3xl px-6 py-12 text-center sm:px-10">
      <span className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">{description}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonStyles('primary')}>
            Try again
          </button>
        ) : null}
        {backTo ? (
          <Link to={backTo} className={buttonStyles('secondary')}>
            <ArrowLeft className="size-4" />
            Go back
          </Link>
        ) : null}
      </div>
    </div>
  );
}
