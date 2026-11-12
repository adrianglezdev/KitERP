import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, MapPin, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Avatar, Button, Card, CardHeader, Dialog, EnumBadge, Field, IconButton, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { ORDEN_ESTADOS, PRIORIDADES, diaLargo, hora, hoyISO, sumarDias } from '../lib';

interface Orden {
  id: string;
  codigo: string;
  estado: string;
  tipo: string;
  prioridad: string;
  tecnicoId: string | null;
  planificadaInicio: string | null;
  planificadaFin: string | null;
  descripcion: string | null;
  cliente: string;
  localidad: string | null;
}

/** Planificación diaria: una columna por técnico con sus órdenes y la lista de órdenes sin planificar. */
export default function Planificacion() {
  const [dia, setDia] = useState(hoyISO());
  const { data, isLoading } = useApi<{ tecnicos: { id: string; nombre: string; telefono: string | null }[]; ordenes: Orden[]; pendientes: Orden[] }>(`/sat/planificacion?desde=${dia}&hasta=${dia}`, { placeholderData: (p: any) => p });
  const [asignar, setAsignar] = useState<Orden | null>(null);
  const generar = useMut(() => api.post<{ generadas: number }>('/sat/contratos/generar-visitas'), { ok: (r) => (r.generadas ? `${r.generadas} visitas preventivas creadas` : 'No hay visitas preventivas pendientes'), invalidate: ['/sat'] });
  return (
    <>
      <PageHeader
        title="Planificación"
        icon={CalendarClock}
        subtitle="Asigna las órdenes pendientes a un técnico y una hora. El técnico lo ve al momento en su móvil."
        actions={
          <Button icon={Zap} loading={generar.isPending} onClick={() => generar.mutate(undefined)}>
            Generar visitas de contratos
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <IconButton icon={ChevronLeft} label="Día anterior" variant="secondary" onClick={() => setDia(sumarDias(dia, -1))} />
        <span className="w-56 text-center text-[15px] font-semibold capitalize">{diaLargo(dia)}</span>
        <IconButton icon={ChevronRight} label="Día siguiente" variant="secondary" onClick={() => setDia(sumarDias(dia, 1))} />
        <Button size="sm" variant="ghost" onClick={() => setDia(hoyISO())}>
          Hoy
        </Button>
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
            {data.tecnicos.map((t) => {
              const suyas = data.ordenes.filter((o) => o.tecnicoId === t.id);
              return (
                <div key={t.id} className="w-[260px] shrink-0 rounded-xl bg-sunken/70 p-2">
                  <div className="flex items-center gap-2 px-1 pb-2">
                    <Avatar name={t.nombre} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{t.nombre}</span>
                    <span className="text-[12px] text-muted">{suyas.length}</span>
                  </div>
                  <div className="space-y-2">
                    {suyas.map((o) => (
                      <OrdenCard key={o.id} o={o} onClick={() => setAsignar(o)} />
                    ))}
                    {!suyas.length && <p className="px-1 py-6 text-center text-[12px] text-muted">Libre</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <Card className="h-fit overflow-hidden">
            <CardHeader title="Sin planificar" subtitle={`${data.pendientes.length} órdenes, las urgentes primero`} />
            <div className="space-y-2 p-2">
              {data.pendientes.map((o) => (
                <OrdenCard key={o.id} o={o} onClick={() => setAsignar(o)} />
              ))}
              {!data.pendientes.length && <p className="py-6 text-center text-[13px] text-muted">Todo planificado.</p>}
            </div>
          </Card>
        </div>
      )}
      {asignar && <AsignarDialog o={asignar} dia={dia} tecnicos={data?.tecnicos ?? []} onClose={() => setAsignar(null)} />}
    </>
  );
}

function OrdenCard({ o, onClick }: { o: Orden; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('block w-full rounded-2xl bg-surface p-2.5 text-left shadow-card hover:bg-sunken/60', o.prioridad === 'urgente' && 'ring-2 ring-inset ring-earth/70')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">{o.planificadaInicio ? hora(o.planificadaInicio) : o.codigo}</span>
        <EnumBadge options={ORDEN_ESTADOS} value={o.estado} dot={false} />
      </div>
      <p className="mt-0.5 truncate text-[13px] font-medium">{o.cliente}</p>
      {o.descripcion && <p className="line-clamp-2 text-[12px] text-muted">{o.descripcion}</p>}
      <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
        {o.localidad && (
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {o.localidad}
          </span>
        )}
        <EnumBadge options={PRIORIDADES} value={o.prioridad} dot={false} />
      </div>
    </button>
  );
}

function AsignarDialog({ o, dia, tecnicos, onClose }: { o: Orden; dia: string; tecnicos: { id: string; nombre: string }[]; onClose: () => void }) {
  const ini = o.planificadaInicio ? new Date(o.planificadaInicio) : null;
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ tecnicoId: o.tecnicoId ?? '', inicio: ini ? local(ini) : `${dia}T09:00`, fin: o.planificadaFin ? local(new Date(o.planificadaFin)) : '' });
  const guardar = useMut(() => api.post(`/sat/ordenes/${o.id}/planificar`, { tecnicoId: f.tecnicoId || null, inicio: f.inicio || null, fin: f.fin || null }), { ok: 'Orden planificada', invalidate: ['/sat'], onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`${o.codigo} · ${o.cliente}`}
      description={o.descripcion ?? undefined}
      footer={
        <>
          <Link to={`/sat/ordenes/${o.id}`} className="mr-auto text-[13px] font-medium text-primary hover:underline">
            Abrir la orden
          </Link>
          <Button variant="primary" loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Técnico">
          <Select value={f.tecnicoId} onChange={(e) => setF({ ...f, tecnicoId: e.target.value })} options={tecnicos.map((t) => ({ value: t.id, label: t.nombre }))} placeholder="Sin asignar" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Inicio">
            <Input type="datetime-local" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} />
          </Field>
          <Field label="Fin (opcional)">
            <Input type="datetime-local" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
