import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { fmtDate, pryShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, CardHeader, EnumBadge, Field, IconButton, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { NumberInput } from '@/components/form/inputs';

/** Imputar horas a proyectos desde el móvil o el ordenador, y ver las tareas que tengo asignadas. */
export default function MisHoras() {
  const { data, isLoading } = useApi<any>('/pry/mis-horas');
  const hoy = new Date().toLocaleDateString('sv-SE');
  const [f, setF] = useState({ proyectoId: '', tareaId: '', fecha: hoy, horas: null as number | null, descripcion: '' });
  const guardar = useMut(() => api.post('/pry/imputaciones', { ...f, tareaId: f.tareaId || null, descripcion: f.descripcion || null }), {
    ok: 'Horas imputadas',
    invalidate: ['/pry'],
    onSuccess: () => setF((p) => ({ ...p, horas: null, descripcion: '', tareaId: '' })),
  });
  const del = useMut((id: string) => api.del(`/pry/imputaciones/${id}`), { ok: 'Borrada', invalidate: ['/pry'] });
  if (isLoading || !data) return <Spinner />;
  const tareas = (data.tareas ?? []).filter((t: any) => !f.proyectoId || t.proyectoId === f.proyectoId);
  const dias = Object.entries(data.porDia ?? {}) as [string, number][];
  return (
    <>
      <PageHeader title="Mis horas" icon={Clock} subtitle={`Últimos 14 días: ${data.total.toLocaleString('es-ES')} h imputadas.`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Proyecto" required>
                <Select value={f.proyectoId} onChange={(e) => setF({ ...f, proyectoId: e.target.value, tareaId: '' })} options={(data.proyectos ?? []).map((p: any) => ({ value: p.id, label: `${p.codigo} · ${p.nombre}` }))} placeholder="Elige…" />
              </Field>
              <Field label="Tarea">
                <Select value={f.tareaId} onChange={(e) => setF({ ...f, tareaId: e.target.value })} options={tareas.map((t: any) => ({ value: t.id, label: t.titulo }))} placeholder="Sin tarea concreta" />
              </Field>
              <Field label="Fecha">
                <Input type="date" max={hoy} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
              </Field>
              <Field label="Horas" required>
                <NumberInput value={f.horas} onChange={(n) => setF({ ...f, horas: n })} decimals={2} suffix="h" />
              </Field>
            </div>
            <Field label="Qué has hecho">
              <Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {[0.5, 1, 2, 4, 8].map((h) => (
                <button key={h} type="button" onClick={() => setF({ ...f, horas: h })} className={cn('rounded-lg px-2.5 py-1 text-[12.5px] ring-1 ring-line', f.horas === h && 'bg-primary text-white ring-primary')}>
                  {h} h
                </button>
              ))}
              <Button variant="primary" icon={Plus} className="ml-auto" disabled={!f.proyectoId || !f.horas} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
                Imputar
              </Button>
            </div>
          </Card>
          {dias.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {dias.map(([d, h]) => (
                <div key={d} className="min-w-[52px] rounded-xl bg-surface px-2 py-1.5 text-center ring-1 ring-line">
                  <p className="text-[11px] text-muted">{fmtDate(d).slice(0, 5)}</p>
                  <p className="text-[13px] font-semibold">{h}</p>
                </div>
              ))}
            </div>
          )}
          <Card className="overflow-hidden">
            <CardHeader title="Imputaciones" />
            <ul className="divide-y divide-line">
              {data.items.map((i: any) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: i.color ?? '#35AE29' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {i.codigo} · {i.proyecto}
                    </span>
                    <span className="text-[12px] text-muted">
                      {fmtDate(i.fecha)}
                      {i.tarea && ` · ${i.tarea}`}
                      {i.descripcion && ` · ${i.descripcion}`}
                    </span>
                  </span>
                  <b>{Number(i.horas)} h</b>
                  <IconButton icon={Trash2} label="Borrar" size="sm" onClick={() => del.mutate(i.id)} />
                </li>
              ))}
              {!data.items.length && <li className="px-4 py-4 text-center text-[13px] text-muted">Aún no has imputado horas.</li>}
            </ul>
          </Card>
        </div>
        <Card className="h-fit overflow-hidden">
          <CardHeader title="Mis tareas" />
          <ul className="divide-y divide-line">
            {(data.tareas ?? []).map((t: any) => {
              const pr = data.proyectos.find((p: any) => p.id === t.proyectoId);
              return (
                <li key={t.id}>
                  <Link to={`/proyectos/${t.proyectoId}`} className="block px-4 py-2.5 hover:bg-sunken">
                    <span className="block truncate text-[13.5px] font-medium">{t.titulo}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      <EnumBadge options={pryShared.TAREA_ESTADOS} value={t.estado} /> {pr?.codigo}
                      {t.fechaFin && ` · ${fmtDate(t.fechaFin)}`}
                    </span>
                  </Link>
                </li>
              );
            })}
            {!data.tareas?.length && <li className="px-4 py-4 text-center text-[13px] text-muted">No tienes tareas pendientes.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
