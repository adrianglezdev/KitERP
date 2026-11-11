import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { optionLabel, type EnumOption } from '@kite/shared';
import { cn, TONES, type Tone } from '@/lib/utils';

export function Badge({ tone = 'gray', children, className, dot }: { tone?: Tone | string; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', TONES[(tone as Tone) ?? 'gray'] ?? TONES.gray, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Insignia a partir de una lista de opciones (estado, tipo…). */
export function EnumBadge({ options, value, dot = true }: { options?: readonly EnumOption[]; value: unknown; dot?: boolean }) {
  const o = optionLabel(options, value);
  if (!o) return value ? <Badge>{String(value)}</Badge> : <span className="text-muted">—</span>;
  return (
    <Badge tone={o.tone ?? 'gray'} dot={dot}>
      {o.label}
    </Badge>
  );
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon: Icon, actions, subtitle, className }: { title: ReactNode; icon?: LucideIcon; actions?: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 border-b border-line px-4 py-3', className)}>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14.5px] font-semibold">{title}</h3>
        {subtitle && <p className="truncate text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-muted', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-sunken', className)} />;
}

export function EmptyState({ icon: Icon = Inbox, title, children, action, className }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-display text-[15px] font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-md text-[13.5px] text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const AVATAR_COLORS = ['bg-primary', 'bg-deep', 'bg-leaf', 'bg-earth', 'bg-info', 'bg-warn'];
export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  if (src) return <img src={src} alt={name} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  return (
    <span
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', color, className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Stat({ label, value, hint, icon: Icon, tone = 'violet', to }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: Tone; to?: string }) {
  const inner = (
    <div className="flex items-start gap-3">
      {Icon && (
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', TONES[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-[12.5px] text-muted">{label}</p>
        <p className="tabular font-display text-[22px] font-bold leading-tight">{value}</p>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-xl border border-line bg-surface p-4 shadow-card transition hover:border-primary/40">
      {inner}
    </Link>
  ) : (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">{inner}</div>
  );
}

/** Lista de pares etiqueta/valor (fichas). */
export function KeyValue({ items, cols = 2 }: { items: { label: string; value: ReactNode; span?: 1 | 2 }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 1 && 'grid-cols-1', cols === 2 && 'grid-cols-1 sm:grid-cols-2', cols === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map((it) => (
        <div key={it.label} className={cn('min-w-0', it.span === 2 && 'sm:col-span-2')}>
          <dt className="text-[12px] text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-[14px]">{it.value === null || it.value === undefined || it.value === '' ? <span className="text-muted">—</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-line', className)} />;
}

export function Alert({ tone = 'yellow', icon: Icon, title, children, className }: { tone?: Tone; icon?: LucideIcon; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3 rounded-xl px-4 py-3 ring-1 ring-inset', TONES[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 text-[13.5px]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-fg/80')}>{children}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'violet' }: { value: number; max?: number; tone?: 'violet' | 'green' | 'yellow' | 'red' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = { violet: 'bg-primary', green: 'bg-leaf', yellow: 'bg-sun', red: 'bg-bad' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
