import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { optionLabel, type EnumOption } from '@kite/shared';
import { cn, TONES, type Tone } from '@/lib/utils';

export function Badge({ tone = 'gray', children, className, dot }: { tone?: Tone | string; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-2 whitespace-nowrap rounded-md px-2 text-[12px] font-medium', TONES[(tone as Tone) ?? 'gray'] ?? TONES.gray, className)}>
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
    <div className={cn('rounded-2xl bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon: Icon, actions, subtitle, className }: { title: ReactNode; icon?: LucideIcon; actions?: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 px-5 pb-2 pt-4', className)}>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-[16px] font-medium">{title}</h3>
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
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
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sunken text-muted">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-display text-[16px] font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-[14px] text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Fondos suaves con su tinta: se leen igual en claro y en oscuro y con cualquier tema
const AVATAR_COLORS = ['bg-primary-soft text-primary', 'bg-sun text-sun-fg', 'bg-info-soft text-info', 'bg-bad-soft text-bad', 'bg-ok-soft text-ok', 'bg-line-strong/70 text-fg'];
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
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-medium', color, className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-sunken px-2 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

/**
 * Cifra: etiqueta, número y una línea de contexto. `icon` y `tone` se aceptan por compatibilidad,
 * pero no se pintan: una cifra se lee mejor sin adornos alrededor.
 */
export function Stat({ label, value, hint, to }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: Tone; to?: string }) {
  const inner = (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-medium text-fg/70">{label}</p>
      <p className="tabular mt-1 font-display text-[28px] font-medium leading-tight">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl bg-surface p-5 shadow-card transition-colors hover:bg-sunken/60">
      {inner}
    </Link>
  ) : (
    <div className="rounded-2xl bg-surface p-5 shadow-card">{inner}</div>
  );
}

/** Lista de pares etiqueta/valor (fichas). */
export function KeyValue({ items, cols = 2 }: { items: { label: string; value: ReactNode; span?: 1 | 2 }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 1 && 'grid-cols-1', cols === 2 && 'grid-cols-1 sm:grid-cols-2', cols === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map((it) => (
        <div key={it.label} className={cn('min-w-0', it.span === 2 && 'sm:col-span-2')}>
          <dt className="text-[12px] font-medium text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-[14px] font-medium">{it.value === null || it.value === undefined || it.value === '' ? <span className="text-muted">—</span> : it.value}</dd>
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
    <div className={cn('flex items-start gap-3 rounded-2xl px-4 py-4', TONES[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 text-[14px]">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-fg/80')}>{children}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'violet' }: { value: number; max?: number; tone?: 'violet' | 'green' | 'yellow' | 'red' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = { violet: 'bg-primary', green: 'bg-sun', yellow: 'bg-warn', red: 'bg-bad' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn('h-full origin-left rounded-full transition-transform duration-500', color)} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}
