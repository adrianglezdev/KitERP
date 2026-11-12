import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as P from '@radix-ui/react-popover';
import { Check, Minus, Pencil, Plus, Search } from 'lucide-react';
import { useIsMobile } from '@/lib/hooks';
import { cn, PILLAR_CLASSES } from '@/lib/utils';
import { Sheet } from '@/components/ui';
import type { AppInfo } from './apps';

/** Baldosa de color con el icono de una aplicación. El color es el de su pilar. */
export function AppIcon({ app, size = 'md', className }: { app: AppInfo; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-12 w-12 rounded-2xl';
  const ic = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-[22px] w-[22px]';
  return (
    <span className={cn('flex shrink-0 items-center justify-center', box, PILLAR_CLASSES[app.pillar]!.solid, className)}>
      <app.icon className={ic} strokeWidth={2} />
    </span>
  );
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function Tile({
  app,
  active,
  editing,
  mode,
  onPick,
  onToggle,
  drag,
}: {
  app: AppInfo;
  active: boolean;
  editing: boolean;
  /** En edición: si la baldosa está entre las favoritas (se quita) o fuera (se añade); `fixed` no se puede quitar. */
  mode: 'fav' | 'rest' | 'fixed';
  onPick: () => void;
  onToggle: () => void;
  drag?: { onStart: () => void; onOver: () => void; onEnd: () => void; dragging: boolean };
}) {
  const body = (
    <>
      <span className="relative">
        <AppIcon app={app} />
        {editing && mode !== 'fixed' && (
          <span className={cn('absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-card ring-2 ring-surface', mode === 'fav' ? 'bg-earth text-earth-fg' : 'bg-primary text-primary-fg')}>
            {mode === 'fav' ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Plus className="h-3 w-3" strokeWidth={3} />}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[12.5px] font-semibold leading-tight">{app.label}</span>
    </>
  );
  const cls = cn(
    'flex w-full flex-col items-center gap-2 rounded-2xl px-1 pb-2.5 pt-3 outline-none transition hover:bg-sunken focus-visible:bg-sunken',
    active && !editing && 'bg-primary-soft hover:bg-primary-soft',
    drag?.dragging && 'opacity-40',
  );
  if (editing) {
    return (
      <button
        type="button"
        className={cn(cls, mode === 'fav' && 'cursor-grab active:cursor-grabbing')}
        onClick={mode === 'fixed' ? undefined : onToggle}
        draggable={mode === 'fav'}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          drag?.onStart();
        }}
        onDragOver={(e) => {
          if (!drag) return;
          e.preventDefault();
          drag.onOver();
        }}
        onDragEnd={() => drag?.onEnd()}
        aria-label={mode === 'fav' ? `Quitar ${app.label} de favoritos` : mode === 'rest' ? `Añadir ${app.label} a favoritos` : app.label}
        title={app.description}
      >
        {body}
      </button>
    );
  }
  return (
    <Link to={app.home} className={cls} onClick={onPick} title={app.description} aria-current={active ? 'page' : undefined}>
      {body}
    </Link>
  );
}

function LauncherBody({ apps, favorites, currentId, onChange, onPick }: { apps: AppInfo[]; favorites: string[]; currentId?: string; onChange: (ids: string[]) => void; onPick: () => void }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  // Mientras se edita se trabaja sobre una copia; se guarda al terminar
  const [draft, setDraft] = useState(favorites);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!editing) setDraft(favorites);
  }, [favorites, editing]);
  // Si se cierra el lanzador a media edición, se guarda igualmente
  const dirty = useRef(false);
  useEffect(
    () => () => {
      if (dirty.current) onChange(draftRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const byId = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const inicio = byId.get('inicio');
  const favs = draft.map((id) => byId.get(id)).filter(Boolean) as AppInfo[];
  const rest = apps.filter((a) => a.id !== 'inicio' && !draft.includes(a.id));
  const found = q.trim() ? apps.filter((a) => norm(`${a.label} ${a.description} ${a.pillarLabel} ${a.items.map((i) => i.label).join(' ')}`).includes(norm(q.trim()))) : null;

  const set = (ids: string[]) => {
    dirty.current = true;
    setDraft(ids);
  };
  const toggle = (id: string) => set(draft.includes(id) ? draft.filter((x) => x !== id) : [...draft, id]);
  const move = (over: string) => {
    if (!dragId || dragId === over) return;
    const ids = draft.filter((x) => x !== dragId);
    ids.splice(draft.indexOf(over), 0, dragId);
    set(ids);
  };
  const done = () => {
    if (dirty.current) onChange(draft);
    dirty.current = false;
    setEditing(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <label className="flex h-11 shrink-0 items-center gap-2.5 rounded-pill bg-surface px-4 text-muted focus-within:ring-4 focus-within:ring-primary/20">
        <Search className="h-4 w-4 shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aplicación…" className="h-full w-full min-w-0 bg-transparent text-[14px] text-fg outline-none placeholder:text-muted" aria-label="Buscar aplicación" />
      </label>

      <div className="scroll-thin -mr-1 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {found ? (
          <div className="rounded-3xl bg-surface p-2">
            {found.length ? (
              <div className="grid grid-cols-3 gap-0.5">
                {found.map((a) => (
                  <Tile key={a.id} app={a} active={a.id === currentId} editing={false} mode="rest" onPick={onPick} onToggle={() => {}} />
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-muted">Ninguna aplicación coincide con «{q.trim()}».</p>
            )}
          </div>
        ) : (
          <>
            <section className="rounded-3xl bg-surface p-2" aria-label="Tus favoritos">
              <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                <h2 className="min-w-0 flex-1 font-display text-[17px] font-semibold tracking-tight">Tus favoritos</h2>
                {editing ? (
                  <button type="button" onClick={done} className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-primary px-3.5 text-[13px] font-bold text-primary-fg hover:bg-primary/90">
                    <Check className="h-4 w-4" /> Hecho
                  </button>
                ) : (
                  <button type="button" onClick={() => setEditing(true)} className="flex h-9 w-12 items-center justify-center rounded-pill bg-sunken text-fg/70 hover:bg-line-strong/60 hover:text-fg" aria-label="Editar favoritos" title="Editar favoritos">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
              {editing && <p className="px-3 pb-1 text-[12px] text-muted">Toca una aplicación para añadirla o quitarla. Arrastra las favoritas para ordenarlas.</p>}
              <div className="grid grid-cols-3 gap-0.5">
                {inicio && <Tile app={inicio} active={currentId === 'inicio'} editing={editing} mode="fixed" onPick={onPick} onToggle={() => {}} />}
                {favs.map((a) => (
                  <Tile
                    key={a.id}
                    app={a}
                    active={a.id === currentId}
                    editing={editing}
                    mode="fav"
                    onPick={onPick}
                    onToggle={() => toggle(a.id)}
                    drag={{ onStart: () => setDragId(a.id), onOver: () => move(a.id), onEnd: () => setDragId(null), dragging: dragId === a.id }}
                  />
                ))}
              </div>
              {!favs.length && !editing && <p className="px-3 pb-3 pt-1 text-[12.5px] text-muted">Aún no tienes favoritas. Pulsa el lápiz para elegirlas.</p>}
            </section>

            {rest.length > 0 && (
              <section className="px-2 pb-1" aria-label="Más aplicaciones">
                <h2 className="px-3 pb-1 pt-2 text-[12px] font-bold text-muted">{editing ? 'Añadir a favoritos' : 'Más aplicaciones'}</h2>
                <div className="grid grid-cols-3 gap-0.5">
                  {rest.map((a) => (
                    <Tile key={a.id} app={a} active={a.id === currentId} editing={editing} mode="rest" onPick={onPick} onToggle={() => toggle(a.id)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Lanzador de aplicaciones: una cuadrícula con las favoritas de la persona arriba (editables con el
 * lápiz) y el resto debajo. En el móvil se abre como panel inferior.
 */
export function AppLauncher({
  apps,
  favorites,
  currentId,
  onChange,
  open,
  onOpenChange,
  children,
  side = 'bottom',
  align = 'end',
}: {
  apps: AppInfo[];
  favorites: string[];
  currentId?: string;
  onChange: (ids: string[]) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Botón que lo abre. */
  children: ReactNode;
  side?: 'bottom' | 'right';
  align?: 'start' | 'end';
}) {
  const mobile = useIsMobile();
  const body = <LauncherBody apps={apps} favorites={favorites} currentId={currentId} onChange={onChange} onPick={() => onOpenChange(false)} />;
  if (mobile) {
    return (
      <>
        <span onClick={() => onOpenChange(true)} className="contents">
          {children}
        </span>
        <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title="Aplicaciones" tone="sunken">
          <div className="flex max-h-[72dvh] flex-col px-3 pb-4 pt-1">{body}</div>
        </Sheet>
      </>
    );
  }
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{children}</P.Trigger>
      <P.Portal>
        <P.Content
          side={side}
          align={align}
          sideOffset={10}
          collisionPadding={12}
          className="z-50 flex max-h-[min(640px,calc(100dvh-96px))] w-[360px] flex-col rounded-[28px] bg-sunken p-2.5 shadow-pop outline-none ring-1 ring-line-strong/50 data-[state=open]:animate-pop-in"
          aria-label="Aplicaciones"
        >
          {body}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
