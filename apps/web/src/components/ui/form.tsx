import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const inputStyles =
  'h-11 w-full rounded-xl border border-line-strong bg-bg/50 px-3.5 text-sm text-fg placeholder:text-subtle transition focus:border-focus focus:ring-2 focus:ring-focus/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputStyles, className)} {...props} />;
  },
);

export function FieldError({ children }: { children?: string | undefined }) {
  if (!children) return null;

  return (
    <p role="alert" className="mt-2 text-sm text-danger">
      {children}
    </p>
  );
}

export const selectStyles =
  'h-10 rounded-xl border border-line-strong bg-panel-raised px-3 pr-8 text-sm text-fg transition focus:border-focus focus:outline-none';
