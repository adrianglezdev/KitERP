import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, LogIn, LogOut, Megaphone, Pin } from 'lucide-react';
import { PILLARS, fmtHours, moduleInfo, type ApprovalItem, type DashboardWidget, type Pillar } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { appName } from '@/lib/theme';
import { cn, PILLAR_CLASSES, relTime } from '@/lib/utils';
import { WidgetCard } from '@/components/charts/Widget';
import { Card, CardHeader, Skeleton } from '@/components/ui';
import { moduleWebs } from '@/modules/registry';

const pilarDe = (modulo: string): Pillar => moduleInfo(modulo)?.pillar ?? 'plataforma';

/** Tarjeta de jornada: estado del fichaje, reloj y horas de la semana, con acceso directo a fichar. */
function Jornada() {
  const { data } = useApi<any>('/hor/estado', { refetchInterval: 60_000 });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const estado: 'fuera' | 'trabajando' | 'pausa' = data?.estado ?? 'fuera';
  const hora = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');
  const trabajadas = Number(data?.semana?.trabajadas ?? 0);
  const previstas = Number(data?.semana?.previstas ?? 0);
  const pct = previstas > 0 ? Math.min(100, (trabajadas / previstas) * 100) : 0;
  const turno = data?.hoy?.turno;
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-deep p-5 text-deep-fg dark:bg-surface dark:text-fg dark:shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium opacity-70">{estado === 'trabajando' ? `Trabajando desde las ${hora(data?.desde ?? data?.ultimo?.momento)}` : estado === 'pausa' ? `En pausa desde las ${hora(data?.ultimo?.momento)}` : 'Fuera de la jornada'}</p>
        {turno?.horaInicio && (
          <span className="tabular shrink-0 rounded-pill bg-white/[0.12] px-3 py-0.5 text-[12px] font-semibold dark:bg-sunken">
            {String(turno.horaInicio).slice(0, 5)} – {String(turno.horaFin).slice(0, 5)}
          </span>
        )}
      </div>
      <p className="tabular font-display text-[44px] font-medium leading-none tracking-[-0.03em]">{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}</p>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.14] dark:bg-sunken">
          <div className="h-full origin-left rounded-full bg-sun transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="mt-2 text-[13px] font-medium opacity-70">
          {fmtHours(trabajadas)}
          {previstas > 0 ? ` de ${fmtHours(previstas)}` : ''} esta semana
        </p>
      </div>
      <Link to="/fichar" className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-sun text-[14px] font-semibold text-sun-fg transition-[filter,transform] hover:brightness-95 active:scale-[0.98]">
        {estado === 'fuera' ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        {estado === 'fuera' ? 'Fichar entrada' : estado === 'pausa' ? 'Volver de la pausa' : 'Fichar salida'}
      </Link>
    </div>
  );
}

/**
 * Indicadores de un pilar, colocados para que no queden huecos sea cual sea su número y su alto:
 *  - las cifras van en filas iguales (cinco cifras son 3 + 2, seis son 3 + 3) y las de la última
 *    fila se estiran hasta el borde;
 *  - un gráfico grande ocupa todo el ancho;
 *  - las listas y los gráficos pequeños se reparten en columnas de alto parecido, cada tarjeta
 *    con el alto de su contenido.
 */
function SeccionPilar({ ws }: { ws: DashboardWidget[] }) {
  const cifras = ws.filter((w) => w.data.kind === 'stat');
  const anchos = ws.filter((w) => w.data.kind === 'chart' && w.size === 'lg');
  const resto = ws.filter((w) => w.data.kind !== 'stat' && !anchos.includes(w));
  const porFila = cifras.length <= 4 ? cifras.length : cifras.length <= 6 ? 3 : 4;
  return (
    <div className="space-y-4">
      {cifras.length > 0 && (
        <div className="flex flex-wrap gap-4" style={{ '--basis': `calc((100% - ${porFila - 1}rem) / ${porFila})` } as CSSProperties}>
          {cifras.map((w) => (
            <div key={w.id} className="min-w-0 grow basis-full sm:basis-[calc((100%-1rem)/2)] xl:basis-[var(--basis)] [&>*]:h-full">
              <WidgetCard w={{ ...w, size: 'sm' }} />
            </div>
          ))}
        </div>
      )}
      {anchos.map((w) => (
        <WidgetCard key={w.id} w={w} />
      ))}
      {resto.length > 0 && (
        <>
          <Columnas ws={resto} max={1} className="md:hidden" />
          <Columnas ws={resto} max={2} className="hidden md:flex xl:hidden" />
          <Columnas ws={resto} max={3} className="hidden xl:flex" />
        </>
      )}
    </div>
  );
}

/** Alto aproximado de una tarjeta, en «filas», para repartirlas entre columnas. */
function peso(w: DashboardWidget) {
  if (w.data.kind === 'chart') return 6;
  if (w.data.kind === 'list') return 2 + Math.max(1, w.data.items.length);
  return 3;
}

/** Reparte las tarjetas en `n` columnas, cada una a la columna que va más corta. */
function repartir(ws: DashboardWidget[], n: number) {
  const cols: DashboardWidget[][] = Array.from({ length: n }, () => []);
  const altos = new Array<number>(n).fill(0);
  for (const w of ws) {
    const i = altos.indexOf(Math.min(...altos));
    cols[i]!.push(w);
    altos[i]! += peso(w);
  }
  const alto = Math.max(...altos);
  // Lo que cuenta: que la sección sea corta y que no queden huecos bajo las columnas más bajas
  const hueco = altos.reduce((a, h) => a + alto - h, 0);
  return { cols, coste: alto + hueco / 2 };
}

/**
 * Columnas de tarjetas sin huecos. Prueba de 1 a `max` columnas y se queda con el reparto más
 * compacto: tres listas muy desiguales quedan mejor en dos columnas que en tres.
 */
function Columnas({ ws, max, className }: { ws: DashboardWidget[]; max: number; className?: string }) {
  let mejor = repartir(ws, 1);
  for (let n = 2; n <= Math.min(max, ws.length); n++) {
    const r = repartir(ws, n);
    if (r.coste <= mejor.coste) mejor = r;
  }
  return (
    <div className={cn('flex items-start gap-4', className)}>
      {mejor.cols.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
          {col.map((w) => (
            <WidgetCard key={w.id} w={{ ...w, size: 'md' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Inicio() {
  const { session, has, can } = useSession();
  const widgets = useApi<DashboardWidget[]>('/panel');
  const aprob = useApi<ApprovalItem[]>('/aprobaciones');
  const anuncios = useApi<any[]>('/anuncios');
  const avisos = useApi<{ sinLeer: number }>('/notificaciones?solo=nuevas');
  const tiles = moduleWebs.filter((m) => has(m.code)).flatMap((m) => (m.portal ?? []).filter((p) => !p.perm || can(p.perm)));
  // El título de la portada es el día: es el contexto de todo lo que hay debajo
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const sinLeer = (anuncios.data ?? []).filter((a) => !a.leido);
  const ficha = has('hor') && can('hor.fichar') && !!session?.user.personaId;
  const nAprob = aprob.data?.length ?? 0;

  useEffect(() => {
    document.title = `Inicio · ${appName()}`;
  }, []);

  // Los indicadores se agrupan por pilar, cada uno con su color
  const porPilar = (Object.keys(PILLARS) as Pillar[]).map((p) => ({ p, ws: (widgets.data ?? []).filter((w) => pilarDe(w.modulo) === p) })).filter((g) => g.ws.length);

  const resumen = [
    { n: nAprob, label: nAprob === 1 ? 'aprobación pendiente' : 'aprobaciones pendientes', to: '/bandeja' },
    { n: avisos.data?.sinLeer ?? 0, label: avisos.data?.sinLeer === 1 ? 'aviso sin leer' : 'avisos sin leer', to: '/bandeja' },
    { n: sinLeer.length, label: sinLeer.length === 1 ? 'anuncio nuevo en el tablón' : 'anuncios nuevos en el tablón', to: '/tablon' },
  ].filter((r) => r.n > 0);

  return (
    <div className="space-y-4 pt-1">
      <div className={cn('grid gap-4', ficha && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
        <Card className="flex flex-col justify-between gap-5 p-6 sm:p-7">
          <div>
            <p className="text-[13px] text-muted">{session?.empresa.nombre}</p>
            <h1 className="mt-1 text-[28px] font-medium leading-[1.1] first-letter:uppercase sm:text-[36px]">{fecha}</h1>
          </div>
          {resumen.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {resumen.map((r) => (
                <Link key={r.label} to={r.to} className="inline-flex h-8 items-center gap-2 rounded-lg bg-sunken px-3 text-[13px] text-fg/70 transition-colors hover:bg-line-strong/60 hover:text-fg">
                  <span className="tabular font-medium text-fg">{r.n}</span>
                  {r.label}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-muted">Nada pendiente</p>
          )}
        </Card>
        {ficha && <Jornada />}
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {tiles.slice(0, 6).map((t) => (
            <Link key={t.to} to={t.to} className="group flex flex-col items-start gap-3 rounded-2xl bg-surface p-4 shadow-card transition-colors hover:bg-sunken/60">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sunken text-muted transition-colors group-hover:text-fg">
                <t.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-medium leading-tight">{t.label}</span>
                {t.description && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{t.description}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}

      {(nAprob > 0 || sinLeer.length > 0) && (
        <div className={cn('grid items-start gap-4', nAprob > 0 && sinLeer.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
          {nAprob > 0 && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    Pendiente de tu aprobación <span className="tag">{nAprob}</span>
                  </span>
                }
                actions={
                  <Link to="/bandeja" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
                    Abrir bandeja <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <ul className="px-2 pb-3">
                {aprob.data!.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link to="/bandeja" className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-sunken/70">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', PILLAR_CLASSES[pilarDe(a.modulo)]!.dot)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{a.titulo}</span>
                        <span className="block truncate text-[12px] text-muted">{[a.tipo, a.solicitante, relTime(a.fecha)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {sinLeer.length > 0 && (
            <Card>
              <CardHeader
                title="Tablón"
                icon={Megaphone}
                actions={
                  <Link to="/tablon" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
                    Abrir <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <ul className="px-2 pb-3">
                {sinLeer.slice(0, 3).map((a) => (
                  <li key={a.id}>
                    <Link to="/tablon" className="block rounded-2xl px-3 py-3 transition-colors hover:bg-sunken/70">
                      <span className="flex items-center gap-2 text-[14px] font-semibold">
                        {a.fijado && <Pin className="h-3.5 w-3.5 shrink-0 text-muted" />}
                        <span className="truncate">{a.titulo}</span>
                      </span>
                      <span className="line-clamp-2 text-[13px] text-muted">{a.cuerpo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {widgets.isLoading ? (
        <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : (
        porPilar.map(({ p, ws }) => (
          <section key={p}>
            <div className="mb-4 mt-8 flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', PILLAR_CLASSES[p]!.dot)} />
              <h2 className="text-[20px] font-medium">{PILLARS[p].label}</h2>
            </div>
            <SeccionPilar ws={ws} />
          </section>
        ))
      )}
    </div>
  );
}
