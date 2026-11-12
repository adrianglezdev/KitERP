import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as D from '@radix-ui/react-dialog';
import { Bell, Building, CheckCheck, ChevronsLeft, ChevronsRight, Grip, Home, Inbox, KeyRound, LogOut, Menu as MenuIcon, Moon, Palette, Plus, Search, Sun, User } from 'lucide-react';
import type { SearchResult } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useDebounced, useLocalState, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useMode } from '@/lib/theme';
import { cn, iconByName, PILLAR_CLASSES, relTime } from '@/lib/utils';
import { Avatar, Kbd, Menu, Sheet, Tooltip } from '@/components/ui';
import { moduleWebs } from '@/modules/registry';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { buildApps, favoriteIds, locate, quickActions, type AppInfo, type AppItem } from './apps';
import { AppContextProvider } from './app-context';
import { AppIcon, AppLauncher } from './AppLauncher';
import { BrandMark, BrandName } from './Logo';

function NavBadge({ url }: { url: string }) {
  const { data } = useApi<{ n: number }>(url, { refetchInterval: 60_000 });
  if (!data?.n) return null;
  return <span className="ml-auto rounded-full bg-earth px-2 text-[11px] font-bold leading-[19px] text-earth-fg">{data.n > 99 ? '99+' : data.n}</span>;
}

/** Apartados de la aplicación abierta. */
function AppNav({ app, collapsed, onNavigate }: { app: AppInfo; collapsed?: boolean; onNavigate?: () => void }) {
  // Dos apartados pueden compartir prefijo (/ausencias y /ausencias/calendario): solo se marca el más específico
  const needsEnd = (i: AppItem) => i.end ?? app.items.some((o) => o !== i && o.to.split('?')[0]!.startsWith(i.to.split('?')[0]! + '/'));
  let lastGroup: string | undefined;
  return (
    <nav aria-label={`Apartados de ${app.label}`}>
      <ul className="space-y-0.5">
        {app.items.map((i) => {
          const head = i.group && i.group !== lastGroup ? i.group : null;
          lastGroup = i.group;
          return (
            <li key={i.to}>
              {head && !collapsed && <p className="px-3 pb-1 pt-4 text-[11.5px] font-bold tracking-wide text-side-fg/45 first:pt-1">{head}</p>}
              {head && collapsed && <div className="mx-3 my-2 h-px bg-side-fg/10" />}
              <NavLink
                to={i.to}
                end={needsEnd(i)}
                onClick={onNavigate}
                title={collapsed ? i.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition',
                    isActive ? 'bg-side-active text-side-active-fg' : 'text-side-fg/75 hover:bg-side-fg/10 hover:text-side-fg',
                    collapsed && 'justify-center px-0',
                  )
                }
              >
                <i.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{i.label}</span>}
                {!collapsed && i.badgeUrl && <NavBadge url={i.badgeUrl} />}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CommandPalette({ open, setOpen, apps }: { open: boolean; setOpen: (o: boolean) => void; apps: AppInfo[] }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 220);
  const { data, isFetching } = useApi<SearchResult[]>(dq.length >= 2 ? `/buscar?q=${encodeURIComponent(dq)}` : null);
  const go = (to: string) => {
    setOpen(false);
    setQ('');
    nav(to);
  };
  const all = useMemo(() => apps.flatMap((a) => a.items.map((i) => ({ ...i, app: a }))), [apps]);
  const pages = all.filter((i) => !q || `${i.label} ${i.app.label}`.toLowerCase().includes(q.toLowerCase()));
  const heading = 'px-1 text-[11.5px] font-bold text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2';
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-fg/40 backdrop-blur-[2px] dark:bg-black/55" />
        <D.Content className="fixed left-1/2 top-[10vh] z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl bg-surface shadow-pop">
          <D.Title className="sr-only">Buscar</D.Title>
          <D.Description className="sr-only">Busca clientes, personas, documentos o pantallas</D.Description>
          <Command shouldFilter={false} loop>
            <div className="m-2 flex items-center gap-3 rounded-pill bg-sunken px-4">
              <Search className="h-5 w-5 shrink-0 text-muted" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Busca clientes, facturas, personas, artículos…" className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scroll-thin max-h-[60vh] overflow-y-auto p-2 pt-0">
              {q.length >= 2 && !isFetching && !data?.length && !pages.length && <Command.Empty className="py-8 text-center text-muted">Sin resultados para «{q}»</Command.Empty>}
              {!!data?.length && (
                <Command.Group heading="Resultados" className={heading}>
                  {data.map((r) => {
                    const Icon = iconByName(r.icono);
                    return (
                      <Command.Item key={`${r.tipo}-${r.id}`} value={`${r.tipo}-${r.id}`} onSelect={() => go(r.enlace)} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-fg data-[selected=true]:bg-sunken">
                        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary-soft text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold">{r.titulo}</p>
                          <p className="truncate text-[12px] font-medium text-muted">
                            {r.tipo}
                            {r.subtitulo ? ` · ${r.subtitulo}` : ''}
                          </p>
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {pages.length > 0 && (
                <Command.Group heading="Ir a" className={heading}>
                  {pages.slice(0, q ? 8 : 10).map((i) => (
                    <Command.Item key={i.to} value={`nav-${i.to}`} onSelect={() => go(i.to)} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-fg data-[selected=true]:bg-sunken">
                      <AppIcon app={i.app} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{i.label}</span>
                      <span className="shrink-0 text-[12px] font-medium text-muted">{i.app.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Notifications({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const nav = useNavigate();
  const { data } = useApi<{ items: any[]; sinLeer: number }>('/notificaciones');
  const leer = useMut((ids?: string[]) => api.post('/notificaciones/leer', { ids }), { invalidate: ['/notificaciones'] });
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Avisos">
      <div className="flex justify-end px-5 pb-1">
        <button type="button" className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-primary disabled:opacity-40" disabled={!data?.sinLeer} onClick={() => leer.mutate(undefined)}>
          <CheckCheck className="h-4 w-4" /> Marcar todo como leído
        </button>
      </div>
      {!data?.items.length ? (
        <p className="p-8 text-center text-muted">No tienes avisos</p>
      ) : (
        <ul className="space-y-0.5 px-2 pb-3">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn('flex w-full gap-3 rounded-2xl px-3 py-3 text-left hover:bg-sunken', !n.leidaEn && 'bg-primary-soft/50')}
                onClick={() => {
                  if (!n.leidaEn) leer.mutate([n.id]);
                  if (n.enlace) {
                    setOpen(false);
                    nav(n.enlace);
                  }
                }}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.leidaEn ? 'bg-transparent' : 'bg-earth')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold">{n.titulo}</span>
                  {n.cuerpo && <span className="block truncate text-[12.5px] text-muted">{n.cuerpo}</span>}
                  <span className="text-[11.5px] text-muted">{relTime(n.creadoEn)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

const LAST_APP = 'kite-app';

export function AppShell() {
  const { session, has, can, logout, savePrefs } = useSession();
  const loc = useLocation();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useLocalState('kite-sidebar', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [launcher, setLauncher] = useState<'top' | 'side' | 'mobile' | null>(null);
  const [mode, setMode] = useMode();
  const apps = useMemo(() => buildApps(has, can), [has, can]);
  const quick = useMemo(() => quickActions(has, can), [has, can]);
  const notif = useApi<{ sinLeer: number }>('/notificaciones?solo=nuevas', { refetchInterval: 45_000 });

  // Aplicación abierta: la del apartado que coincide con la dirección; en fichas y documentos
  // que no son de ninguna en concreto, se mantiene la última en la que estuvo.
  const found = useMemo(() => locate(apps, loc.pathname), [apps, loc.pathname]);
  const [lastId, setLastId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(LAST_APP);
    } catch {
      return null;
    }
  });
  // Una pantalla puede decir de qué aplicación es (un documento: Facturas, Presupuestos, Compras…)
  const [claimed, setClaimed] = useState<{ path: string; id: string } | null>(null);
  const claim = useCallback((path: string, id: string) => setClaimed((c) => (c?.path === path && c.id === id ? c : { path, id })), []);
  const claimedApp = claimed?.path === loc.pathname ? apps.find((a) => a.id === claimed.id) : undefined;
  const currentId = found?.app.id ?? claimedApp?.id;
  useEffect(() => {
    if (!currentId) return;
    setLastId(currentId);
    try {
      sessionStorage.setItem(LAST_APP, currentId);
    } catch {
      /* sin almacenamiento */
    }
  }, [currentId]);
  const app = found?.app ?? claimedApp ?? apps.find((a) => a.id === lastId) ?? apps[0] ?? null;
  const ctx = useMemo(() => ({ apps, app, item: found?.item ?? null, claim }), [apps, app, found, claim]);

  const favIds = useMemo(() => favoriteIds(apps, session?.preferencias?.favoritos), [apps, session?.preferencias?.favoritos]);
  const favApps = useMemo(() => favIds.map((id) => apps.find((a) => a.id === id)).filter(Boolean) as AppInfo[], [favIds, apps]);
  const inicio = apps.find((a) => a.id === 'inicio');
  const saveFavs = (ids: string[]) => void savePrefs({ favoritos: ids });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    setLauncher(null);
  }, [loc.pathname]);

  if (!session) return null;
  const hor = moduleWebs.find((m) => m.code === 'hor' && has('hor'));
  const fichar = hor?.portal?.find((p) => p.to.startsWith('/fichar') && (!p.perm || can(p.perm)));

  const launcherProps = { apps, favorites: favIds, currentId: app?.id, onChange: saveFavs };

  /** Cambiador de aplicaciones de la barra lateral: Inicio, las favoritas y el acceso a todas. */
  const switcher = (mini: boolean) => {
    const cell = (a: AppInfo) => (
      <Tooltip key={a.id} content={a.label} side={mini ? 'right' : 'bottom'}>
        <Link
          to={a.home}
          aria-label={a.label}
          aria-current={a.id === app?.id ? 'page' : undefined}
          className={cn('flex h-[42px] items-center justify-center rounded-xl transition', a.id === app?.id ? 'bg-side-active text-side-active-fg' : 'text-side-fg/75 hover:bg-side-fg/10 hover:text-side-fg')}
        >
          <a.icon className="h-[19px] w-[19px]" />
        </Link>
      </Tooltip>
    );
    return (
      <div className={cn('grid gap-1.5 rounded-2xl bg-side-fg/[0.07] p-[5px]', mini ? 'grid-cols-1' : 'grid-cols-5')}>
        {inicio && cell(inicio)}
        {favApps.slice(0, mini ? 6 : 8).map(cell)}
        <AppLauncher {...launcherProps} open={launcher === 'side'} onOpenChange={(o) => setLauncher(o ? 'side' : null)} side="right" align="start">
          <button type="button" aria-label="Todas las aplicaciones" title="Todas las aplicaciones" className="flex h-[42px] items-center justify-center rounded-xl text-side-fg/75 transition hover:bg-side-fg/10 hover:text-side-fg">
            <Grip className="h-[19px] w-[19px]" />
          </button>
        </AppLauncher>
      </div>
    );
  };

  const sidebar = (mobile = false) => {
    const mini = collapsed && !mobile;
    return (
      <div className={cn('flex h-full flex-col overflow-hidden bg-side text-side-fg', !mobile && 'rounded-3xl shadow-card')}>
        <div className={cn('shrink-0 px-4 pb-1 pt-5', mini && 'px-3')}>
          <Link to="/" className={cn('flex min-w-0 items-center gap-2.5', mini && 'justify-center')}>
            <BrandMark size="sm" stroke="rgb(var(--side))" className={mini ? 'h-8 w-8' : undefined} />
            {!mini && <BrandName className="text-[19px] text-side-fg" />}
          </Link>
          <div className="mt-5">{switcher(mini)}</div>
          {!mini && app && (
            <div className="mt-[18px] flex items-baseline justify-between gap-2 px-1">
              <b className="truncate font-display text-[17px] font-semibold tracking-tight text-side-fg">{app.label}</b>
              <span className="shrink-0 text-[12px] font-medium text-side-fg/45">
                {app.items.length} {app.items.length === 1 ? 'apartado' : 'apartados'}
              </span>
            </div>
          )}
          {mini && <div className="mx-2 mt-3 h-px bg-side-fg/10" />}
        </div>
        <div className="scroll-side min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">{app && <AppNav app={app} collapsed={mini} onNavigate={() => setMobileOpen(false)} />}</div>
        {!mobile && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-11 shrink-0 items-center justify-center gap-2 bg-side-fg/[0.06] text-[12.5px] font-semibold text-side-fg/60 hover:text-side-fg"
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" /> Contraer
              </>
            )}
          </button>
        )}
      </div>
    );
  };

  const iconBtn = 'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface text-muted shadow-card transition hover:text-fg';

  return (
    <AppContextProvider value={ctx}>
      <div className="flex h-dvh overflow-hidden">
        <aside className={cn('hidden shrink-0 py-3 pl-3 transition-[width] md:block', collapsed ? 'w-[82px]' : 'w-[284px]')}>{sidebar()}</aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="left" tone="none">
          {sidebar(true)}
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="safe-top z-20 flex h-[68px] shrink-0 items-center gap-2 px-3 md:h-[76px] md:px-6 lg:px-8">
            <button type="button" className={cn(iconBtn, 'md:hidden')} onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
              <MenuIcon className="h-5 w-5" />
            </button>

            {/* Dónde estás: pilar, aplicación y apartado */}
            {app && (
              <nav className="hidden min-w-0 items-center gap-1.5 text-[13px] font-semibold text-muted lg:flex" aria-label="Ubicación">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', PILLAR_CLASSES[app.pillar]!.dot)} />
                <Link to={app.home} className="truncate hover:text-fg">
                  {app.label}
                </Link>
                {ctx.item && ctx.item.label !== app.label && (
                  <>
                    <span className="text-muted/50">/</span>
                    <b className="truncate font-bold text-fg">{ctx.item.label}</b>
                  </>
                )}
              </nav>
            )}

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ml-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-pill bg-surface px-4 text-left text-[13.5px] font-medium text-muted shadow-card transition hover:text-fg md:max-w-[360px] md:flex-none md:basis-[32%]"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Buscar…</span>
              <span className="ml-auto hidden md:inline">
                <Kbd>Ctrl K</Kbd>
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              {quick.length > 0 && (
                <Menu
                  trigger={
                    <button type="button" className="hidden h-10 items-center gap-1.5 rounded-pill bg-primary px-4 text-[13.5px] font-bold text-primary-fg transition hover:bg-primary/90 sm:inline-flex">
                      <Plus className="h-4 w-4" /> Crear
                    </button>
                  }
                  items={quick.map((q) => ({ label: q.label, icon: q.icon, onSelect: () => nav(q.to) }))}
                />
              )}
              <span className="hidden md:block">
                <AppLauncher {...launcherProps} open={launcher === 'top'} onOpenChange={(o) => setLauncher(o ? 'top' : null)}>
                  <button type="button" className={cn(iconBtn, launcher === 'top' && 'text-fg')} aria-label="Aplicaciones" title="Aplicaciones">
                    <Grip className="h-5 w-5" />
                  </button>
                </AppLauncher>
              </span>
              <button type="button" onClick={() => setNotifOpen(true)} className={iconBtn} aria-label="Avisos" title="Avisos">
                <Bell className="h-5 w-5" />
                {!!notif.data?.sinLeer && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-earth px-1 text-[10px] font-bold text-earth-fg ring-2 ring-bg">{notif.data.sinLeer > 9 ? '9+' : notif.data.sinLeer}</span>
                )}
              </button>
              <Menu
                trigger={
                  <button type="button" className="flex items-center gap-2 rounded-pill p-1 transition hover:bg-surface lg:pr-3" aria-label="Menú de usuario">
                    <Avatar name={session.user.nombre} src={session.user.fotoUrl} size={34} />
                    <span className="hidden max-w-[150px] truncate text-left lg:block">
                      <span className="block truncate text-[13px] font-bold leading-tight">{session.user.nombre}</span>
                      <span className="block truncate text-[11.5px] font-medium leading-tight text-muted">{session.empresas.length > 1 ? session.empresa.nombre : (session.user.rol?.nombre ?? session.empresa.nombre)}</span>
                    </span>
                  </button>
                }
                items={[
                  { label: 'Mi perfil', icon: User, onSelect: () => nav(session.user.personaId ? `/personas/${session.user.personaId}` : '/cuenta') },
                  { label: 'Seguridad de la cuenta', icon: KeyRound, onSelect: () => nav('/cuenta') },
                  { label: mode === 'dark' ? 'Tema claro' : 'Tema oscuro', icon: mode === 'dark' ? Sun : Moon, onSelect: () => setMode(mode === 'dark' ? 'light' : 'dark') },
                  { label: 'Apariencia de la empresa', icon: Palette, hidden: !can('cfg.gestionar'), onSelect: () => nav('/config/apariencia') },
                  ...session.empresas
                    .filter((e) => e.id !== session.empresa.id)
                    .map((e) => ({ label: `Cambiar a ${e.nombre}`, icon: Building, onSelect: async () => { await api.post('/auth/empresa', { empresaId: e.id }); location.href = '/'; } })),
                  { separator: true, label: '' },
                  { label: 'Cerrar sesión', icon: LogOut, danger: true, onSelect: () => logout() },
                ]}
              />
            </div>
          </header>

          <main id="main" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-2 md:px-6 md:pb-10 lg:px-8">
              <ErrorBoundary resetKey={loc.pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>

          {/* Barra inferior en el móvil */}
          <nav className="safe-bottom fixed inset-x-3 bottom-3 z-30 overflow-hidden rounded-3xl bg-side text-side-fg shadow-pop md:hidden" aria-label="Accesos rápidos">
            <div className="grid h-16 grid-cols-5">
              {[
                { to: '/', label: 'Inicio', icon: Home, end: true },
                fichar ? { to: fichar.to, label: 'Fichar', icon: fichar.icon } : { to: '/tareas', label: 'Tareas', icon: Inbox },
                { to: '/bandeja', label: 'Bandeja', icon: Inbox },
              ].map((i) => (
                <NavLink key={i.to + i.label} to={i.to} end={'end' in i ? i.end : undefined} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-side-active' : 'text-side-fg/60')}>
                  <i.icon className="h-5 w-5" />
                  {i.label}
                </NavLink>
              ))}
              <AppLauncher {...launcherProps} open={launcher === 'mobile'} onOpenChange={(o) => setLauncher(o ? 'mobile' : null)}>
                <button type="button" className={cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', launcher === 'mobile' ? 'text-side-active' : 'text-side-fg/60')}>
                  <Grip className="h-5 w-5" /> Apps
                </button>
              </AppLauncher>
              <button type="button" onClick={() => setMobileOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-side-fg/60">
                <MenuIcon className="h-5 w-5" /> Menú
              </button>
            </div>
          </nav>
        </div>
        <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} apps={apps} />
        <Notifications open={notifOpen} setOpen={setNotifOpen} />
      </div>
    </AppContextProvider>
  );
}
