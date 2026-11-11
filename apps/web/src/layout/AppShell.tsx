import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as D from '@radix-ui/react-dialog';
import {
  Bell,
  Building,
  CheckCheck,
  ChevronsLeft,
  ChevronsRight,
  Home,
  Inbox,
  KeyRound,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Plus,
  Search,
  Sun,
  User,
} from 'lucide-react';
import type { SearchResult } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useDebounced, useLocalState, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn, iconByName, PILLAR_CLASSES, relTime } from '@/lib/utils';
import { Avatar, Kbd, Menu, Sheet } from '@/components/ui';
import { moduleWebs } from '@/modules/registry';
import { buildNav, quickActions, type NavGroup } from './nav';
import { Logo } from './Logo';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('kite-theme', theme);
    } catch {
      /* sin almacenamiento */
    }
  }, [theme]);
  return [theme, setTheme] as const;
}

function NavBadge({ url }: { url: string }) {
  const { data } = useApi<{ n: number }>(url, { refetchInterval: 60_000 });
  if (!data?.n) return null;
  return <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white">{data.n > 99 ? '99+' : data.n}</span>;
}

function NavGroups({ groups, collapsed, onNavigate }: { groups: NavGroup[]; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5" aria-label="Navegación principal">
      {groups.map((g) => (
        <div key={g.id}>
          {!collapsed && g.id !== 'general' && (
            <p className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/55">
              {g.pillar && <span className={cn('h-2 w-2 rotate-45 rounded-[2px]', PILLAR_CLASSES[g.pillar]!.dot)} />}
              {g.label}
            </p>
          )}
          {collapsed && g.id !== 'general' && <div className="mx-3 mb-2 h-px bg-white/10" />}
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  end={i.end}
                  onClick={onNavigate}
                  title={collapsed ? i.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
                      isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/8 hover:bg-white/10 hover:text-white',
                      collapsed && 'justify-center px-0',
                    )
                  }
                >
                  <i.icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{i.label}</span>}
                  {!collapsed && i.badgeUrl && <NavBadge url={i.badgeUrl} />}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 220);
  const { has, can } = useSession();
  const groups = useMemo(() => buildNav(has, can), [has, can]);
  const { data, isFetching } = useApi<SearchResult[]>(dq.length >= 2 ? `/buscar?q=${encodeURIComponent(dq)}` : null);
  const go = (to: string) => {
    setOpen(false);
    setQ('');
    nav(to);
  };
  const pages = groups.flatMap((g) => g.items).filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[10vh] z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <D.Title className="sr-only">Buscar</D.Title>
          <D.Description className="sr-only">Busca clientes, personas, documentos o pantallas</D.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-5 w-5 text-muted" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Busca clientes, facturas, personas, artículos…" className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scroll-thin max-h-[60vh] overflow-y-auto p-2">
              {q.length >= 2 && !isFetching && !data?.length && !pages.length && <Command.Empty className="py-8 text-center text-muted">Sin resultados para «{q}»</Command.Empty>}
              {!!data?.length && (
                <Command.Group heading="Resultados" className="text-[11px] font-semibold uppercase tracking-wide text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {data.map((r) => {
                    const Icon = iconByName(r.icono);
                    return (
                      <Command.Item key={`${r.tipo}-${r.id}`} value={`${r.tipo}-${r.id}`} onSelect={() => go(r.enlace)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 normal-case tracking-normal text-fg data-[selected=true]:bg-sunken">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium">{r.titulo}</p>
                          <p className="truncate text-[12px] text-muted">
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
                <Command.Group heading="Ir a" className="text-[11px] font-semibold uppercase tracking-wide text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {pages.slice(0, q ? 8 : 12).map((i) => (
                    <Command.Item key={i.to} value={`nav-${i.to}`} onSelect={() => go(i.to)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 normal-case tracking-normal text-fg data-[selected=true]:bg-sunken">
                      <i.icon className="h-4 w-4 text-muted" />
                      <span className="text-[14px]">{i.label}</span>
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
      <div className="flex justify-end border-b border-line px-4 py-2">
        <button type="button" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary disabled:opacity-40" disabled={!data?.sinLeer} onClick={() => leer.mutate(undefined)}>
          <CheckCheck className="h-4 w-4" /> Marcar todo como leído
        </button>
      </div>
      {!data?.items.length ? (
        <p className="p-8 text-center text-muted">No tienes avisos</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-sunken', !n.leidaEn && 'bg-primary-soft/40')}
                onClick={() => {
                  if (!n.leidaEn) leer.mutate([n.id]);
                  if (n.enlace) {
                    setOpen(false);
                    nav(n.enlace);
                  }
                }}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.leidaEn ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{n.titulo}</span>
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

export function AppShell() {
  const { session, has, can, logout } = useSession();
  const loc = useLocation();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useLocalState('kite-sidebar', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const groups = useMemo(() => buildNav(has, can), [has, can]);
  const quick = useMemo(() => quickActions(has, can), [has, can]);
  const notif = useApi<{ sinLeer: number }>('/notificaciones?solo=nuevas', { refetchInterval: 45_000 });

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
  useEffect(() => setMobileOpen(false), [loc.pathname]);

  if (!session) return null;
  const portal = moduleWebs.find((m) => m.code === 'hor' && has('hor'));
  const fichar = portal?.portal?.find((p) => p.to.startsWith('/fichar'));

  const sidebar = (mobile = false) => (
    <div className="flex h-full flex-col bg-deep text-deep-fg">
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 px-4', collapsed && !mobile && 'justify-center px-0')}>
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" stroke="#5E2A78" />
          {(!collapsed || mobile) && <span className="font-display text-[18px] font-extrabold tracking-tight">kite</span>}
        </Link>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2 [scrollbar-color:rgba(255,255,255,.2)_transparent]">
        <NavGroups groups={groups} collapsed={collapsed && !mobile} onNavigate={() => setMobileOpen(false)} />
      </div>
      {!mobile && (
        <button type="button" onClick={() => setCollapsed(!collapsed)} className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-white/10 text-[12.5px] text-white/60 hover:text-white" aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}>
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Contraer</>)}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className={cn('hidden shrink-0 transition-[width] md:block', collapsed ? 'w-[68px]' : 'w-[248px]')}>{sidebar()}</aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="left">
        {sidebar(true)}
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur md:px-5">
          <button type="button" className="rounded-lg p-2 text-muted hover:bg-sunken md:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2 md:hidden">
            <Logo className="h-6 w-6" />
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-sunken/60 px-3 text-left text-[13.5px] text-muted hover:border-primary/40 md:max-w-md"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Buscar…</span>
            <span className="ml-auto hidden md:inline">
              <Kbd>Ctrl K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {quick.length > 0 && (
              <Menu
                trigger={
                  <button type="button" className="hidden h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13.5px] font-medium text-primary-fg shadow-sm hover:bg-primary/90 sm:inline-flex">
                    <Plus className="h-4 w-4" /> Crear
                  </button>
                }
                items={quick.map((q) => ({ label: q.label, icon: q.icon, onSelect: () => nav(q.to) }))}
              />
            )}
            <button type="button" onClick={() => setNotifOpen(true)} className="relative rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg" aria-label="Avisos">
              <Bell className="h-5 w-5" />
              {!!notif.data?.sinLeer && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{notif.data.sinLeer > 9 ? '9+' : notif.data.sinLeer}</span>}
            </button>
            <Menu
              trigger={
                <button type="button" className="flex items-center gap-2 rounded-lg p-1 hover:bg-sunken" aria-label="Menú de usuario">
                  <Avatar name={session.user.nombre} src={session.user.fotoUrl} size={30} />
                  <span className="hidden max-w-[140px] truncate text-left lg:block">
                    <span className="block truncate text-[13px] font-semibold leading-tight">{session.user.nombre}</span>
                    <span className="block truncate text-[11.5px] leading-tight text-muted">{session.user.rol?.nombre ?? session.empresa.nombre}</span>
                  </span>
                </button>
              }
              items={[
                { label: 'Mi perfil', icon: User, onSelect: () => nav(session.user.personaId ? `/personas/${session.user.personaId}` : '/cuenta') },
                { label: 'Seguridad de la cuenta', icon: KeyRound, onSelect: () => nav('/cuenta') },
                { label: theme === 'dark' ? 'Tema claro' : 'Tema oscuro', icon: theme === 'dark' ? Sun : Moon, onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
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
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-5 md:px-6 md:pb-10 lg:px-8">
            <ErrorBoundary resetKey={loc.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>

        {/* Barra inferior en el móvil */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="Accesos rápidos">
          <div className="grid h-16 grid-cols-5">
            {[
              { to: '/', label: 'Inicio', icon: Home, end: true },
              fichar ? { to: fichar.to, label: 'Fichar', icon: fichar.icon } : { to: '/tareas', label: 'Tareas', icon: Inbox },
              { to: '/bandeja', label: 'Bandeja', icon: Inbox },
            ].map((i) => (
              <NavLink key={i.to + i.label} to={i.to} end={'end' in i ? i.end : undefined} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted')}>
                <i.icon className="h-5 w-5" />
                {i.label}
              </NavLink>
            ))}
            <button type="button" onClick={() => setPaletteOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
              <Search className="h-5 w-5" /> Buscar
            </button>
            <button type="button" onClick={() => setMobileOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
              <MenuIcon className="h-5 w-5" /> Más
            </button>
          </div>
        </nav>
      </div>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
      <Notifications open={notifOpen} setOpen={setNotifOpen} />
    </div>
  );
}
