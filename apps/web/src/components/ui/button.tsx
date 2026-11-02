import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg shadow-[0_8px_24px_-12px_var(--accent)] hover:bg-accent-strong disabled:hover:bg-accent',
  secondary:
    'border border-line-strong bg-panel-raised text-fg hover:border-subtle hover:bg-panel disabled:hover:bg-panel-raised',
  ghost: 'text-muted hover:bg-panel-raised hover:text-fg disabled:hover:bg-transparent',
  danger: 'bg-danger text-white hover:brightness-110',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 gap-2 rounded-xl px-3 text-sm',
  md: 'h-11 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-13 gap-2.5 rounded-2xl px-6 text-base',
};

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex select-none items-center justify-center font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, variant = 'primary', size = 'md', loading = false, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonStyles(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});
