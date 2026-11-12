import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Bell, Check, Clock, Grip, Home, Inbox, Plus, RotateCcw, Save, Search, Users, Wallet } from 'lucide-react';
import { APARIENCIA_DEFECTO, FUENTES, TEMAS, fuente, normalizarApariencia, type Apariencia, type AparienciaColores } from '@kite/shared';
import { api } from '@/lib/api';
import { contrast, hexToRgb, WHITE } from '@/lib/color';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { applyBrand, buildTokens, restoreBrand, swatches, type Mode } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, CardHeader, Field, FileDrop, Input, Segmented, Spinner, Switch } from '@/components/ui';

const COLORES: { k: keyof AparienciaColores; label: string; help: string }[] = [
  { k: 'primario', label: 'Principal', help: 'Botones, enlaces y selección' },
  { k: 'acento', label: 'Acento', help: 'Opción activa del menú, fichar y «correcto»' },
  { k: 'info', label: 'Información', help: 'Avisos informativos y «en curso»' },
  { k: 'alerta', label: 'Alerta', help: 'Errores, contadores e incumplidos' },
  { k: 'estructura', label: 'Estructura', help: 'Barra lateral y tinte de los grises' },
];

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Los valores que definen el aspecto, sin el nombre del tema de partida ni el de la aplicación. */
const forma = (a: Partial<Apariencia>) => {
  const { tema: _t, nombreApp: _n, ...resto } = a;
  return resto;
};

/** Variables del tema aplicadas solo dentro de un bloque: sirve para enseñar cómo queda sin tocar el resto. */
function scopedVars(ap: Apariencia, mode: Mode): CSSProperties {
  const t = buildTokens(ap);
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...t.base, ...t[mode] })) vars[`--${k}`] = v;
  return { ...vars, background: 'rgb(var(--bg))', color: 'rgb(var(--fg))', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontWeight: 'var(--font-weight-body)' as never, colorScheme: mode };
}

/** Miniatura de un tema para la galería. */
function TemaCard({ ap, nombre, descripcion, activo, onClick }: { ap: Apariencia; nombre: string; descripcion: string; activo: boolean; onClick: () => void }) {
  const s = swatches(ap, ap.modo === 'oscuro' ? 'dark' : 'light');
  const r = ap.esquinas === 'rectas' ? 3 : ap.esquinas === 'suaves' ? 6 : 10;
  const pill = ap.botones === 'pildora' ? 99 : ap.botones === 'redondeados' ? 5 : 2;
  return (
    <button type="button" onClick={onClick} aria-pressed={activo} className={cn('group rounded-2xl bg-surface p-2 text-left shadow-card outline-none transition hover:-translate-y-0.5', activo ? 'ring-2 ring-primary' : 'ring-1 ring-transparent hover:ring-line-strong')}>
      <div className="flex h-[92px] gap-1.5 overflow-hidden p-1.5" style={{ background: s.bg, borderRadius: r + 4 }} aria-hidden>
        <div className="flex w-[30%] flex-col gap-1 p-1.5" style={{ background: s.side, borderRadius: r }}>
          <span className="h-1.5 w-3/4 rounded-full" style={{ background: s.sideFg, opacity: 0.85 }} />
          <span className="mt-1 h-2.5 rounded-full" style={{ background: s.sideActive, borderRadius: Math.min(r, 5) }} />
          <span className="h-1.5 w-4/5 rounded-full" style={{ background: s.sideFg, opacity: 0.35 }} />
          <span className="h-1.5 w-3/5 rounded-full" style={{ background: s.sideFg, opacity: 0.35 }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2/5 rounded-full" style={{ background: s.fg }} />
            <span className="ml-auto h-3 w-8" style={{ background: s.primary, borderRadius: pill }} />
          </div>
          <div className="flex flex-1 gap-1.5">
            <div className="flex flex-1 flex-col justify-end gap-1 p-1.5" style={{ background: s.surface, borderRadius: r }}>
              <span className="h-1.5 w-1/2 rounded-full" style={{ background: s.muted, opacity: 0.6 }} />
              <span className="h-2.5 w-4/5 rounded-full" style={{ background: s.fg }} />
            </div>
            <div className="flex flex-1 flex-col justify-end gap-1 p-1.5" style={{ background: s.primary, borderRadius: r }}>
              <span className="h-1.5 w-1/2 rounded-full" style={{ background: s.primaryFg, opacity: 0.6 }} />
              <span className="h-2.5 w-4/5 rounded-full" style={{ background: s.primaryFg }} />
            </div>
          </div>
          <div className="flex gap-1">
            {[s.accent, s.info, s.alert, s.primarySoft].map((c, i) => (
              <span key={i} className="h-2.5 flex-1" style={{ background: c, borderRadius: pill }} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2 px-1.5 pb-1 pt-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-semibold tracking-tight" style={{ fontFamily: `${fuente(ap.fuenteTitulos).familia}, var(--font-display)` }}>
            {nombre}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{descripcion}</p>
        </div>
        {activo && (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  );
}

/** La aplicación en miniatura con el tema que se está editando, hecha con los componentes reales. */
function VistaPrevia({ ap, mode, nombre }: { ap: Apariencia; mode: Mode; nombre: string }) {
  const style = useMemo(() => scopedVars(ap, mode), [ap, mode]);
  const item = 'flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold';
  return (
    <div data-theme={mode} style={style} className="overflow-hidden rounded-2xl ring-1 ring-line-strong/60">
      <div className="flex gap-2.5 p-2.5">
        <div className="hidden w-[132px] shrink-0 flex-col rounded-2xl bg-side p-2.5 text-side-fg shadow-card sm:flex">
          <p className="truncate px-1 font-display text-[13px] font-bold tracking-tight">{nombre}</p>
          <div className="mt-2.5 grid grid-cols-4 gap-1 rounded-xl bg-side-fg/[0.07] p-1">
            {[Home, Clock, Users, Grip].map((I, i) => (
              <span key={i} className={cn('flex h-7 items-center justify-center rounded-lg', i === 1 ? 'bg-side-active text-side-active-fg' : 'text-side-fg/70')}>
                <I className="h-3.5 w-3.5" />
              </span>
            ))}
          </div>
          <p className="mt-3 px-1 font-display text-[12.5px] font-semibold">Fichaje</p>
          <div className="mt-1.5 space-y-0.5">
            <span className={cn(item, 'bg-side-active text-side-active-fg')}>
              <Clock className="h-3.5 w-3.5" /> Fichar
            </span>
            <span className={cn(item, 'text-side-fg/75')}>
              <Users className="h-3.5 w-3.5" /> Equipo ahora
            </span>
            <span className={cn(item, 'text-side-fg/75')}>
              <Inbox className="h-3.5 w-3.5" /> Incidencias
              <span className="ml-auto rounded-full bg-earth px-1.5 text-[10px] font-bold text-earth-fg">3</span>
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-pill bg-surface px-3 text-[11.5px] text-muted shadow-card">
              <Search className="h-3.5 w-3.5" /> Buscar…
            </span>
            <span className="flex h-8 items-center gap-1 rounded-pill bg-primary px-3 text-[11.5px] font-bold text-primary-fg">
              <Plus className="h-3.5 w-3.5" /> Crear
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-surface text-muted shadow-card">
              <Bell className="h-3.5 w-3.5" />
            </span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface py-0.5 pl-2 pr-2.5 text-[10.5px] font-bold text-fg/70 shadow-card">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Personas · Fichaje
            </span>
            <p className="mt-1.5 font-display text-[20px] font-semibold leading-tight tracking-[-0.03em]">Buenas tardes, Laura</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0 rounded-2xl bg-surface p-3 shadow-card">
              <p className="truncate text-[10.5px] font-bold text-fg/65">Horas esta semana</p>
              <p className="tabular whitespace-nowrap font-display text-[15px] font-semibold tracking-tight">21:43 h</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full w-[54%] rounded-full bg-primary" />
              </div>
            </div>
            <div className="min-w-0 rounded-2xl bg-primary p-3 text-primary-fg">
              <p className="truncate text-[10.5px] font-bold opacity-80">Facturado</p>
              <p className="tabular whitespace-nowrap font-display text-[15px] font-semibold tracking-tight">6.378 €</p>
              <p className="mt-0.5 text-[10.5px] font-semibold opacity-80">▲ 12 %</p>
            </div>
            <div className="min-w-0 rounded-2xl bg-sun p-3 text-sun-fg">
              <p className="truncate text-[10.5px] font-bold opacity-75">Valor del stock</p>
              <p className="tabular whitespace-nowrap font-display text-[15px] font-semibold tracking-tight">15.631 €</p>
              <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold opacity-75">
                <Wallet className="h-3 w-3 shrink-0" /> <span className="truncate">precio medio</span>
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-surface p-3 shadow-card">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="green" dot>
                Aprobado
              </Badge>
              <Badge tone="yellow" dot>
                Pendiente
              </Badge>
              <Badge tone="blue" dot>
                En curso
              </Badge>
              <Badge tone="red" dot>
                Incumplido
              </Badge>
              <span className="tag">P26-00001</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="primary">
                Guardar
              </Button>
              <Button size="sm">Cancelar</Button>
              <Button size="sm" variant="success" icon={Check}>
                Aprobar
              </Button>
              <span className="field-input !w-auto flex-1 !py-1.5 text-[12px] text-muted">Escribe aquí…</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, help, value, onChange, aviso }: { label: string; help: string; value: string; onChange: (v: string) => void; aviso?: string | null }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-sunken/70 p-2.5">
      <label className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-line-strong" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Color ${label.toLowerCase()}`} />
      </label>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold leading-tight">{label}</p>
        <p className="truncate text-[12px] text-muted">{aviso ? <span className="font-semibold text-bad">{aviso}</span> : help}</p>
      </div>
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase());
        }}
        onBlur={() => setText(value)}
        maxLength={7}
        spellCheck={false}
        className="field-input !w-[92px] shrink-0 !bg-surface !px-2.5 !py-2 font-mono text-[12.5px] uppercase"
        aria-label={`Código del color ${label.toLowerCase()}`}
      />
    </div>
  );
}

function FuentePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {FUENTES.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          aria-pressed={value === f.id}
          className={cn('flex items-baseline gap-2 rounded-xl px-3 py-2 text-left transition', value === f.id ? 'bg-primary-soft text-primary ring-2 ring-primary' : 'bg-sunken/70 hover:bg-sunken')}
        >
          <span className="text-[19px] font-semibold leading-none" style={{ fontFamily: `${f.familia}, system-ui, sans-serif` }}>
            Aa
          </span>
          <span className="min-w-0 truncate text-[12.5px] font-semibold" style={{ fontFamily: `${f.familia}, system-ui, sans-serif` }}>
            {f.nombre}
          </span>
        </button>
      ))}
    </div>
  );
}

function Opcion<T extends string>({ label, help, value, onChange, options }: { label: string; help?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold">{label}</p>
        {help && <p className="text-[12px] text-muted">{help}</p>}
      </div>
      <Segmented value={value} onChange={onChange} options={options} />
    </div>
  );
}

export default function AparienciaConfig() {
  const { session } = useSession();
  const { data, isLoading } = useApi<any>('/empresa');
  const [ap, setAp] = useState<Apariencia | null>(null);
  const [logo, setLogo] = useState<{ id: string | null; url: string | null } | null>(null);
  const [enVivo, setEnVivo] = useState(true);
  const guardada = useMemo(() => (data ? normalizarApariencia(data.ajustes?.apariencia) : null), [data]);
  const cargado = useRef(false);

  useEffect(() => {
    if (!data || cargado.current) return;
    cargado.current = true;
    setAp(normalizarApariencia(data.ajustes?.apariencia));
    setLogo({ id: data.logoArchivoId ?? null, url: data.logoUrl ?? null });
  }, [data]);

  // Tipografías de la galería (solo se descargan las que llegan a pintarse)
  useEffect(() => {
    const id = 'kite-fuentes-galeria';
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id;
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${FUENTES.filter((f) => f.google)
      .map((f) => `family=${f.google!.split(':')[0]}:wght@500;600`)
      .join('&')}&display=swap`;
    document.head.appendChild(l);
  }, []);

  // Vista en vivo: el tema que se edita se pinta en toda la aplicación; al salir vuelve el guardado
  const empresa = session?.empresa;
  useEffect(() => {
    if (!ap || !empresa) return;
    if (enVivo) applyBrand({ empresaId: empresa.id, nombre: empresa.nombre, logoUrl: logo?.url ?? null, apariencia: ap });
    else restoreBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ap, enVivo, logo?.url]);
  useEffect(() => () => restoreBrand(), []);

  const save = useMut(() => api.patch('/empresa', { logoArchivoId: logo?.id ?? null, ajustes: { apariencia: ap } }), {
    ok: 'Apariencia guardada: ya la ve toda la empresa',
    invalidate: ['/empresa', 'session'],
    onSuccess: () => {
      if (ap && empresa) applyBrand({ empresaId: empresa.id, nombre: empresa.nombre, logoUrl: logo?.url ?? null, apariencia: ap }, { persist: true });
    },
  });

  if (isLoading || !ap || !guardada) return <Spinner />;

  const set = (patch: Partial<Apariencia>) => setAp({ ...ap, ...patch, tema: 'tema' in patch ? patch.tema! : 'personalizado' });
  const setColor = (k: keyof AparienciaColores, v: string) => set({ colores: { ...ap.colores, [k]: v } });
  const cambios = !igual(ap, guardada) || (logo?.id ?? null) !== (data.logoArchivoId ?? null);
  const nombre = ap.nombreApp || data.nombre || 'KiteERP';
  const temaActivo = TEMAS.find((t) => igual(forma(t.apariencia), forma(ap)))?.id;
  const cPrim = contrast(hexToRgb(ap.colores.primario), WHITE);
  const cEstr = contrast(hexToRgb(ap.colores.estructura), WHITE);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
      <div className="space-y-5">
        <Alert tone="violet">
          La apariencia es de <b>{data.nombre}</b>: cada empresa tiene la suya. Los cambios no afectan a los datos y los ve todo el mundo al guardar. Cada persona sigue pudiendo elegir entre claro y oscuro.
        </Alert>

        <Card>
          <CardHeader title="Tema de partida" subtitle="Elige uno y ajústalo después a tu gusto" />
          <div className="grid gap-3 p-4 pt-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {TEMAS.map((t) => (
              <TemaCard key={t.id} ap={{ ...t.apariencia, nombreApp: null }} nombre={t.nombre} descripcion={t.descripcion} activo={temaActivo === t.id} onClick={() => setAp({ ...t.apariencia, nombreApp: ap.nombreApp })} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Marca" subtitle="El nombre y el logo que ve tu equipo al entrar" />
          <div className="grid gap-4 p-5 pt-2 sm:grid-cols-2">
            <Field label="Nombre de la aplicación" help="Aparece en la barra lateral, la pestaña del navegador y la pantalla de entrada.">
              <Input value={ap.nombreApp ?? ''} maxLength={40} placeholder={data.nombre} onChange={(e) => set({ nombreApp: e.target.value || null, tema: ap.tema })} />
            </Field>
            <div>
              <p className="label">Logo</p>
              <div className="flex items-center gap-3">
                {logo?.url ? (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 ring-1 ring-line-strong">
                    <img src={logo.url} alt="Logo actual" className="max-h-full max-w-full object-contain" />
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <FileDrop compact multiple={false} accept="image/png,image/jpeg,image/svg+xml" label={logo?.url ? 'Cambiar el logo' : 'Sube el logo (PNG, JPG o SVG)'} onUploaded={(fs) => fs[0] && setLogo({ id: fs[0].id, url: fs[0].url })} />
                </div>
                {logo?.url && (
                  <Button size="sm" variant="ghost" onClick={() => setLogo({ id: null, url: null })}>
                    Quitar
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[12px] text-muted">Sin logo se usa la cometa, con los colores del tema.</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Colores" subtitle="Cinco colores, cada uno con su papel. Los tonos suaves y el modo oscuro se calculan solos." />
          <div className="grid gap-2 p-5 pt-2 lg:grid-cols-2">
            {COLORES.map((c) => (
              <ColorField
                key={c.k}
                label={c.label}
                help={c.help}
                value={ap.colores[c.k]}
                onChange={(v) => setColor(c.k, v)}
                aviso={c.k === 'primario' && cPrim < 2.2 ? 'Muy claro: los botones llevarán texto oscuro' : c.k === 'estructura' && cEstr < 3 && ap.barra === 'oscura' ? 'Muy claro para una barra oscura' : null}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Tipografía" />
          <div className="space-y-5 p-5 pt-2">
            <div>
              <p className="label">Títulos y cifras</p>
              <FuentePicker value={ap.fuenteTitulos} onChange={(id) => set({ fuenteTitulos: id })} />
            </div>
            <div>
              <p className="label">Texto</p>
              <FuentePicker value={ap.fuenteTexto} onChange={(id) => set({ fuenteTexto: id })} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Formas y estilo" />
          <div className="space-y-4 p-5 pt-2">
            <Opcion label="Esquinas" help="Tarjetas, campos y paneles" value={ap.esquinas} onChange={(v) => set({ esquinas: v })} options={[{ value: 'rectas', label: 'Rectas' }, { value: 'suaves', label: 'Suaves' }, { value: 'redondas', label: 'Redondas' }]} />
            <Opcion label="Botones" help="También pestañas, insignias y buscadores" value={ap.botones} onChange={(v) => set({ botones: v })} options={[{ value: 'rectos', label: 'Rectos' }, { value: 'redondeados', label: 'Redondeados' }, { value: 'pildora', label: 'Píldora' }]} />
            <Opcion label="Tarjetas" value={ap.tarjetas} onChange={(v) => set({ tarjetas: v })} options={[{ value: 'sombra', label: 'Con sombra' }, { value: 'borde', label: 'Con borde' }, { value: 'planas', label: 'Planas' }]} />
            <Opcion label="Barra lateral" value={ap.barra} onChange={(v) => set({ barra: v })} options={[{ value: 'oscura', label: 'Oscura' }, { value: 'clara', label: 'Clara' }, { value: 'color', label: 'De color' }]} />
            <Opcion label="Densidad" help="Compacta enseña más datos por pantalla" value={ap.densidad} onChange={(v) => set({ densidad: v })} options={[{ value: 'comoda', label: 'Cómoda' }, { value: 'compacta', label: 'Compacta' }]} />
            <Opcion label="Modo al abrir" help="Para quien no ha elegido el suyo" value={ap.modo} onChange={(v) => set({ modo: v })} options={[{ value: 'claro', label: 'Claro' }, { value: 'oscuro', label: 'Oscuro' }, { value: 'sistema', label: 'El del dispositivo' }]} />
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-2">
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 font-display text-[15px] font-semibold tracking-tight">Vista previa</h3>
            {cambios ? <Badge tone="yellow">Cambios sin guardar</Badge> : <Badge tone="green">Guardado</Badge>}
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-bold text-muted">Claro</p>
            <VistaPrevia ap={ap} mode="light" nombre={nombre} />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-bold text-muted">Oscuro</p>
            <VistaPrevia ap={ap} mode="dark" nombre={nombre} />
          </div>
          <Switch checked={enVivo} onChange={setEnVivo} label="Probar en toda la aplicación" description="Mientras editas ves el resultado en todas las pantallas. Si sales sin guardar, vuelve el tema anterior." />
        </Card>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" icon={RotateCcw} disabled={igual(forma(ap), forma(APARIENCIA_DEFECTO))} onClick={() => setAp({ ...APARIENCIA_DEFECTO, nombreApp: ap.nombreApp })}>
            Tema original
          </Button>
          <Button disabled={!cambios} onClick={() => { setAp(guardada); setLogo({ id: data.logoArchivoId ?? null, url: data.logoUrl ?? null }); }}>
            Descartar
          </Button>
          <Button variant="primary" icon={Save} loading={save.isPending} disabled={!cambios} onClick={() => save.mutate(undefined)}>
            Guardar apariencia
          </Button>
        </div>
      </div>
    </div>
  );
}
