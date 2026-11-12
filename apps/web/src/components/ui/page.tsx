import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { appName } from '@/lib/theme';
import { cn, PILLAR_CLASSES } from '@/lib/utils';
import { useCurrentApp } from '@/layout/app-context';

/**
 * Cabecera de página: título, subtítulo, migas y acciones. En móvil las acciones bajan a una fila propia.
 * Sobre el título se indica la aplicación a la que pertenece la pantalla, con el color de su pilar.
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  back,
  crumbs,
  badges,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  back?: string | boolean;
  crumbs?: { label: string; to?: string }[];
  badges?: ReactNode;
}) {
  const nav = useNavigate();
  const { app } = useCurrentApp();
  useEffect(() => {
    if (typeof title === 'string') document.title = `${title} · ${appName()}`;
  }, [title]);
  const eyebrow = app && !back && !(crumbs && crumbs.length > 0);
  return (
    <div className="mb-5 mt-1">
      {eyebrow && (
        <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-pill bg-surface py-1 pl-2.5 pr-3 text-[12px] font-bold text-fg/70 shadow-card">
          <span className={cn('h-2 w-2 rounded-full', PILLAR_CLASSES[app.pillar]!.dot)} />
          {app.pillarLabel === app.label || app.pillar === 'plataforma' ? app.label : `${app.pillarLabel} · ${app.label}`}
        </p>
      )}
      {crumbs && crumbs.length > 0 && (
        <nav className="mb-2 hidden items-center gap-1 text-[12.5px] font-semibold text-muted sm:flex" aria-label="Migas de pan">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              {c.to ? (
                <Link to={c.to} className="hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {back && (
          <button
            type="button"
            onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
            className="mt-0.5 rounded-pill bg-surface p-2 text-muted shadow-card hover:text-fg"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {Icon && !back && (
          <span className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-primary sm:flex">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 basis-[min(100%,24rem)]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[30px]">{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="mt-1 max-w-[72ch] text-[13.5px] text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h2>}
            {description && <p className="text-[13px] text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Pestañas sincronizadas con ?tab= para poder enlazarlas y volver atrás. */
export function Tabs({ tabs, value, onChange, urlKey = 'tab', className }: { tabs: { id: string; label: ReactNode; icon?: LucideIcon; count?: number; hidden?: boolean }[]; value?: string; onChange?: (id: string) => void; urlKey?: string | null; className?: string }) {
  const [sp, setSp] = useSearchParams();
  const visible = tabs.filter((t) => !t.hidden);
  const current = value ?? (urlKey ? sp.get(urlKey) : null) ?? visible[0]?.id;
  const select = (id: string) => {
    onChange?.(id);
    if (urlKey && value === undefined) {
      const n = new URLSearchParams(sp);
      n.set(urlKey, id);
      setSp(n, { replace: true });
    }
  };
  return (
    <div className={cn('scroll-thin -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)} role="tablist">
      <div className="flex gap-1">
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            onClick={() => select(t.id)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 text-[13.5px] font-semibold transition',
              current === t.id ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface hover:text-fg',
            )}
          >
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className={cn('rounded-full px-1.5 text-[11px] font-bold', current === t.id ? 'bg-primary/15' : 'bg-line-strong/60 text-fg/70')}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function useTab(defaultTab: string, urlKey = 'tab') {
  const [sp] = useSearchParams();
  return sp.get(urlKey) ?? defaultTab;
}
