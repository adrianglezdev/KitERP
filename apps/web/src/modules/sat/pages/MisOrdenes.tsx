import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Car, ChevronLeft, ChevronRight, CloudOff, Navigation, Phone, Play, RefreshCw, Smartphone, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, api } from '@/lib/api';
import { invalidatePrefix, useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, EmptyState, EnumBadge, IconButton, PageHeader, Skeleton } from '@/components/ui';
import { diaLargo, encolarEstado, esErrorDeRed, estadosPendientes, guardarLocal, hora, hoyISO, leerLocal, ORDEN_ESTADOS, ORDEN_TIPOS, PRIORIDADES, sumarDias, telHref, useOnline, vaciarColaEstados } from '../lib';
import { partesGuardados, reenviarPartes } from '../parte';

/** "Mis órdenes de hoy": la pantalla del técnico en el móvil, en orden de ruta. */
export default function MisOrdenes() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const online = useOnline();
  const [fecha, setFecha] = useState(hoyISO());
  const url = `/sat/mis-ordenes?fecha=${fecha}`;
  const q = useApi<{ fecha: string; ordenes: any[] }>(url, { retry: 1, refetchInterval: 120_000 });
  const cache = `sat:mis-ordenes:${fecha}`;
  const datos = q.data ?? (q.isError ? leerLocal<{ fecha: string; ordenes: any[] }>(cache) : null);
  const [locales, setLocales] = useState<Record<string, string>>({});
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (q.data) guardarLocal(cache, q.data);
  }, [q.data, cache]);

  const contarPendientes = () => setPendientes(partesGuardados().filter((p) => p.pendienteEnvio).length + estadosPendientes().length);
  const sincronizar = async (manual = false) => {
    const n = (await vaciarColaEstados()) + (await reenviarPartes());
    contarPendientes();
    if (n) {
      toast.success(`${n} cambio${n === 1 ? '' : 's'} enviado${n === 1 ? '' : 's'}`);
      invalidatePrefix(qc, '/sat');
      setLocales({});
    } else if (manual) q.refetch();
  };
  useEffect(() => {
    sincronizar();
    const on = () => sincronizar();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function estado(o: any, nuevo: string) {
    try {
      await api.post(`/sat/ordenes/${o.id}/estado`, { estado: nuevo });
      invalidatePrefix(qc, '/sat');
      if (nuevo === 'en_curso') nav(`/sat/ordenes/${o.id}`);
    } catch (e) {
      if (!esErrorDeRed(e)) return toast.error(errorMessage(e));
      encolarEstado(o.id, nuevo);
      setLocales((l) => ({ ...l, [o.id]: nuevo }));
      contarPendientes();
      toast.warning('Sin conexión: se enviará al recuperar la cobertura');
    }
  }

  const ordenes = datos?.ordenes ?? [];
  const abiertas = ordenes.filter((o) => o.estado !== 'finalizada');
  const hechas = ordenes.filter((o) => o.estado === 'finalizada');
  const esHoy = fecha === hoyISO();

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24 md:pb-6">
      <PageHeader title={esHoy ? 'Mis órdenes de hoy' : 'Mis órdenes'} icon={Smartphone} subtitle={<span className="capitalize">{diaLargo(fecha)}</span>} />

      <div className="flex items-center gap-2">
        <IconButton icon={ChevronLeft} label="Día anterior" variant="secondary" className="h-11 w-11" onClick={() => setFecha((f) => sumarDias(f, -1))} />
        <Button className="h-11 flex-1" variant={esHoy ? 'soft' : 'secondary'} onClick={() => setFecha(hoyISO())}>
          Hoy
        </Button>
        <IconButton icon={ChevronRight} label="Día siguiente" variant="secondary" className="h-11 w-11" onClick={() => setFecha((f) => sumarDias(f, 1))} />
        <IconButton icon={RefreshCw} label="Actualizar" variant="secondary" className="h-11 w-11" onClick={() => sincronizar(true)} />
      </div>

      {!online && (
        <Alert tone="orange" icon={CloudOff} title="Sin conexión">
          Puedes seguir trabajando: los cambios se guardan en el móvil y se envían al volver la cobertura.
        </Alert>
      )}
      {q.isError && datos && <Alert tone="blue">Mostrando la última copia guardada.</Alert>}
      {pendientes > 0 && (
        <Alert tone="orange" icon={AlertTriangle} title={`${pendientes} cambio${pendientes === 1 ? '' : 's'} pendiente${pendientes === 1 ? '' : 's'} de enviar`}>
          <button type="button" className="font-medium text-primary underline" onClick={() => sincronizar(true)}>
            Reintentar ahora
          </button>
        </Alert>
      )}

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : !ordenes.length ? (
        <EmptyState icon={Wrench} title={esHoy ? 'No tienes órdenes para hoy' : 'Sin órdenes este día'}>
          {q.isError ? errorMessage(q.error) : 'Cuando te asignen trabajo aparecerá aquí.'}
        </EmptyState>
      ) : (
        <>
          <ol className="space-y-3">
            {abiertas.map((o, i) => (
              <OrdenTarjeta key={o.id} o={{ ...o, estado: locales[o.id] ?? o.estado }} n={i + 1} onEstado={(e) => estado(o, e)} />
            ))}
          </ol>
          {hechas.length > 0 && (
            <div>
              <p className="mb-2 text-[12.5px] font-bold text-muted">Finalizadas ({hechas.length})</p>
              <ul className="space-y-2">
                {hechas.map((o) => (
                  <li key={o.id}>
                    <Link to={`/sat/ordenes/${o.id}`} className="flex items-center gap-3 rounded-xl border border-line-strong/70 bg-surface px-4 py-3 opacity-80">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{o.cliente}</span>
                      <span className="text-[12.5px] text-muted">{hora(o.finalizadaEn)}</span>
                      <EnumBadge options={ORDEN_ESTADOS} value={o.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrdenTarjeta({ o, n, onEstado }: { o: any; n: number; onEstado: (estado: string) => void }) {
  const dir = o.direccion ?? {};
  const borrador = partesGuardados().find((p) => p.ordenId === o.id);
  return (
    <li className={cn('overflow-hidden rounded-2xl border bg-surface shadow-card', o.estado === 'en_curso' ? 'border-warn/60' : 'border-line')}>
      <Link to={`/sat/ordenes/${o.id}`} className="block space-y-1.5 px-4 pb-3 pt-3.5 active:bg-sunken">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold text-primary">{n}</span>
          <span className="font-semibold text-fg">{o.planificadaInicio ? `${hora(o.planificadaInicio)}–${hora(o.planificadaFin)}` : 'Sin hora'}</span>
          {o.atrasada && <Badge tone="red">Atrasada</Badge>}
          <span className="ml-auto">
            <EnumBadge options={ORDEN_ESTADOS} value={o.estado} />
          </span>
        </div>
        <p className="text-[17px] font-bold leading-snug">{o.cliente}</p>
        <p className="text-[14px] text-fg/80">{[dir.direccion, dir.localidad].filter(Boolean).join(', ') || 'Sin dirección'}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{ORDEN_TIPOS.find((t) => t.value === o.tipo)?.label}</Badge>
          {o.prioridad !== 'normal' && <EnumBadge options={PRIORIDADES} value={o.prioridad} />}
          {o.equipo && <span className="text-[12.5px] text-muted">{o.equipo}</span>}
          {borrador && <Badge tone={borrador.pendienteEnvio ? 'orange' : 'violet'}>{borrador.pendienteEnvio ? 'Parte sin enviar' : 'Parte empezado'}</Badge>}
        </div>
        {o.descripcion && <p className="line-clamp-2 text-[13px] text-muted">{o.descripcion}</p>}
      </Link>
      <div className="grid grid-cols-3 border-t border-line">
        <a href={telHref(o.telefono)} aria-disabled={!o.telefono} className={cn('flex h-14 items-center justify-center gap-1.5 text-[14px] font-semibold active:bg-sunken', !o.telefono && 'pointer-events-none opacity-40')}>
          <Phone className="h-5 w-5 text-primary" /> Llamar
        </a>
        <a href={o.mapsUrl ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!o.mapsUrl} className={cn('flex h-14 items-center justify-center gap-1.5 border-x border-line text-[14px] font-semibold active:bg-sunken', !o.mapsUrl && 'pointer-events-none opacity-40')}>
          <Navigation className="h-5 w-5 text-primary" /> Ir
        </a>
        {['pendiente', 'planificada'].includes(o.estado) ? (
          <button type="button" onClick={() => onEstado('en_ruta')} className="flex h-14 items-center justify-center gap-1.5 text-[14px] font-semibold text-primary active:bg-sunken">
            <Car className="h-5 w-5" /> En ruta
          </button>
        ) : o.estado === 'en_ruta' ? (
          <button type="button" onClick={() => onEstado('en_curso')} className="flex h-14 items-center justify-center gap-1.5 bg-primary text-[14px] font-semibold text-primary-fg active:bg-primary/90">
            <Play className="h-5 w-5" /> Empezar
          </button>
        ) : (
          <Link to={`/sat/ordenes/${o.id}#parte`} className="flex h-14 items-center justify-center gap-1.5 bg-sun text-[14px] font-bold text-sun-fg active:brightness-95">
            <Wrench className="h-5 w-5" /> Parte
          </Link>
        )}
      </div>
    </li>
  );
}
