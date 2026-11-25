import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { appName } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Cabecera de página: título, subtítulo, migas y acciones. En móvil las acciones bajan a una fila propia.
 * La aplicación y el pilar ya se ven en la cabecera de la ventana, así que aquí no se repiten.
 * `icon` se acepta por compatibilidad, pero no se pinta.
 */
export function PageHeader({
  title,
  subtitle,
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
  useEffect(() => {
    if (typeof title === 'string') document.title = `${title} · ${appName()}`;
  }, [title]);
  return (
    <div className="mb-5 mt-1">
      {crumbs && crumbs.length > 0 && (
        <nav className="mb-2 hidden items-center gap-1 text-[13px] font-medium text-muted sm:flex" aria-label="Migas de pan">
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
        <div className="min-w-0 flex-1 basis-[min(100%,24rem)]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[28px] font-medium leading-tight sm:text-[32px]">{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="mt-1 max-w-[72ch] text-[14px] text-muted">{subtitle}</div>}
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
            {title && <h2 className="text-[18px] font-medium">{title}</h2>}
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
              'flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-4 text-[14px] font-medium transition-colors',
              current === t.id ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
            )}
          >
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="tabular font-mono text-[12px] text-muted">{t.count}</span>}
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
