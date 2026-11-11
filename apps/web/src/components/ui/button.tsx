import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary/90 shadow-sm',
  secondary: 'bg-surface text-fg border border-line hover:bg-sunken shadow-sm',
  ghost: 'text-fg hover:bg-sunken',
  danger: 'bg-bad text-white hover:bg-bad/90 shadow-sm',
  success: 'bg-ok text-white hover:bg-ok/90 shadow-sm',
  soft: 'bg-primary-soft text-primary hover:bg-primary/15',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-[14px] gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconR, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-medium transition disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
      {IconR && <IconR className="h-4 w-4" />}
    </button>
  );
});

export function ButtonLink({ to, variant = 'secondary', size = 'md', icon: Icon, className, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn('inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition', VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {children}
    </Link>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'secondary' | 'soft' }>(
  function IconButton({ icon: Icon, label, size = 'md', variant = 'ghost', className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-lg transition disabled:opacity-40',
          size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
          variant === 'ghost' && 'text-muted hover:bg-sunken hover:text-fg',
          variant === 'secondary' && 'border border-line bg-surface text-fg hover:bg-sunken',
          variant === 'soft' && 'bg-primary-soft text-primary hover:bg-primary/15',
          className,
        )}
        {...rest}
      >
        <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
      </button>
    );
  },
);
