import { useEffect, useState } from 'react';
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

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

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
    <div className="flex flex-col gap-3.5 rounded-2xl bg-deep p-5 text-deep-fg dark:bg-surface dark:text-fg dark:shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold opacity-70">{estado === 'trabajando' ? `Trabajando desde las ${hora(data?.desde ?? data?.ultimo?.momento)}` : estado === 'pausa' ? `En pausa desde las ${hora(data?.ultimo?.momento)}` : 'Fuera de la jornada'}</p>
        {turno?.horaInicio && (
          <span className="tabular shrink-0 rounded-pill bg-white/[0.12] px-2.5 py-0.5 text-[11.5px] font-bold dark:bg-sunken">
            {String(turno.horaInicio).slice(0, 5)} – {String(turno.horaFin).slice(0, 5)}
          </span>
        )}
      </div>
      <p className="tabular font-display text-[44px] font-semibold leading-none tracking-[-0.03em]">{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}</p>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.14] dark:bg-sunken">
          <div className="h-full rounded-full bg-sun transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[12.5px] font-semibold opacity-70">
          {fmtHours(trabajadas)}
          {previstas > 0 ? ` de ${fmtHours(previstas)}` : ''} esta semana
        </p>
      </div>
      <Link to="/fichar" className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-sun text-[14px] font-bold text-sun-fg transition hover:brightness-95">
        {estado === 'fuera' ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        {estado === 'fuera' ? 'Fichar entrada' : estado === 'pausa' ? 'Volver de la pausa' : 'Fichar salida'}
      </Link>
    </div>
  );
}

/** Indicadores de un pilar: primero las cifras, en una fila, y debajo listas y gráficos. */
function SeccionPilar({ p, ws }: { p: Pillar; ws: DashboardWidget[] }) {
  const cifras = ws.filter((w) => w.data.kind === 'stat');
  const resto = ws.filter((w) => w.data.kind !== 'stat');
  return (
    <div className="space-y-4">
      {cifras.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cifras.map((w, i) => (
            <WidgetCard key={w.id} w={{ ...w, size: 'sm' }} destacado={i === 0 && p !== 'personas'} />
          ))}
        </div>
      )}
      {resto.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resto.map((w) => (
            <WidgetCard key={w.id} w={w} />
          ))}
        </div>
      )}
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
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const sinLeer = (anuncios.data ?? []).filter((a) => !a.leido);
  const ficha = has('hor') && can('hor.fichar') && !!session?.user.personaId;
  const nAprob = aprob.data?.length ?? 0;

  useEffect(() => {
    document.title = `Inicio · ${appName()}`;
  }, []);

  // Los indicadores se agrupan por pilar, cada uno con su color
  const porPilar = (Object.keys(PILLARS) as Pillar[]).map((p) => ({ p, ws: (widgets.data ?? []).filter((w) => pilarDe(w.modulo) === p) })).filter((g) => g.ws.length);

  const resumen = [
    { n: nAprob, label: nAprob === 1 ? 'aprobación pendiente' : 'aprobaciones pendientes', to: '/bandeja', cls: 'bg-primary text-primary-fg' },
    { n: avisos.data?.sinLeer ?? 0, label: 'avisos sin leer', to: '/bandeja', cls: 'bg-earth text-earth-fg' },
    { n: sinLeer.length, label: sinLeer.length === 1 ? 'anuncio nuevo en el tablón' : 'anuncios nuevos en el tablón', to: '/tablon', cls: 'bg-sun text-sun-fg' },
  ].filter((r) => r.n > 0);

  return (
    <div className="space-y-4 pt-1">
      <div className={cn('grid gap-4', ficha && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
        <Card className="flex flex-col justify-between gap-5 p-6 sm:p-7">
          <div>
            <p className="text-[13px] font-bold text-muted first-letter:uppercase">{fecha}</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[36px]">
              {saludo()}, <span className="text-primary">{session?.user.nombre.split(' ')[0]}</span>
            </h1>
          </div>
          {resumen.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {resumen.map((r) => (
                <Link key={r.label} to={r.to} className="inline-flex items-center gap-2.5 rounded-pill bg-sunken py-1.5 pl-1.5 pr-3.5 text-[13px] font-bold transition hover:bg-line-strong/60">
                  <span className={cn('tabular flex h-7 min-w-7 items-center justify-center rounded-pill px-1.5 font-display text-[13px]', r.cls)}>{r.n}</span>
                  {r.label}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13.5px] font-medium text-muted">Todo al día: no tienes nada pendiente.</p>
          )}
        </Card>
        {ficha && <Jornada />}
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {tiles.slice(0, 6).map((t) => (
            <Link key={t.to} to={t.to} className="group flex flex-col items-start gap-3 rounded-2xl bg-surface p-3.5 shadow-card transition hover:bg-sunken/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary-soft text-primary">
                <t.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold leading-tight">{t.label}</span>
                {t.description && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{t.description}</span>}
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
                  <Link to="/bandeja" className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary">
                    Abrir bandeja <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <ul className="px-2 pb-2.5">
                {aprob.data!.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link to="/bandeja" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-sunken/70">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', PILLAR_CLASSES[pilarDe(a.modulo)]!.dot)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold">{a.titulo}</span>
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
                  <Link to="/tablon" className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary">
                    Abrir <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <ul className="px-2 pb-2.5">
                {sinLeer.slice(0, 3).map((a) => (
                  <li key={a.id}>
                    <Link to="/tablon" className="block rounded-2xl px-3 py-2.5 transition hover:bg-sunken/70">
                      <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
                        {a.fijado && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        <span className="truncate">{a.titulo}</span>
                      </span>
                      <span className="line-clamp-2 text-[12.5px] text-muted">{a.cuerpo}</span>
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
            <div className="mb-3.5 mt-8 flex items-center gap-2.5">
              <span className={cn('h-2 w-2 rounded-full', PILLAR_CLASSES[p]!.dot)} />
              <h2 className="text-[21px] font-semibold tracking-[-0.02em]">{PILLARS[p].label}</h2>
            </div>
            <SeccionPilar p={p} ws={ws} />
          </section>
        ))
      )}
    </div>
  );
}
