import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, PageHeader, RefSelect, Segmented, Select, Spinner, Textarea, Dialog } from '@/components/ui';

export default function Tareas() {
  const [ver, setVer] = useState<'mias' | 'creadas'>('mias');
  const [abiertas, setAbiertas] = useState(true);
  const url = `/tareas?ver=${ver}${abiertas ? '&estado=abiertas' : ''}`;
  const { data, isLoading } = useApi<any[]>(url);
  const [nueva, setNueva] = useState(false);
  const [f, setF] = useState({ titulo: '', descripcion: '', asignadoA: null as string | null, vence: '', prioridad: 'normal' });
  const crear = useMut(() => api.post('/tareas', { ...f, vence: f.vence || null }), {
    ok: 'Tarea creada',
    invalidate: ['/tareas', '/panel'],
    onSuccess: () => {
      setNueva(false);
      setF({ titulo: '', descripcion: '', asignadoA: null, vence: '', prioridad: 'normal' });
    },
  });
  const toggle = useMut((t: any) => api.patch(`/tareas/${t.id}`, { estado: t.estado === 'hecha' ? 'pendiente' : 'hecha' }), { invalidate: ['/tareas', '/panel'] });
  const borrar = useMut((id: string) => api.del(`/tareas/${id}`), { invalidate: ['/tareas'] });
  const hoy = new Date().toISOString().slice(0, 10);
  const enlace = (t: any) => (t.entidad === 'tercero' ? `/terceros/${t.entidadId}` : t.entidad === 'persona' ? `/personas/${t.entidadId}` : t.entidad === 'documento' ? `/documentos/${t.entidadId}` : null);

  return (
    <>
      <PageHeader
        title="Tareas"
        icon={ClipboardList}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setNueva(true)}>
            Nueva tarea
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={ver} onChange={setVer} options={[{ value: 'mias', label: 'Para mí' }, { value: 'creadas', label: 'Que he pedido' }]} />
        <Segmented value={abiertas ? 'a' : 't'} onChange={(v) => setAbiertas(v === 'a')} options={[{ value: 'a', label: 'Pendientes' }, { value: 't', label: 'Todas' }]} />
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={ClipboardList} title="No hay tareas">Las tareas pueden venir de un compañero, de una incorporación o de una ficha.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.map((t) => {
              const tarde = t.vence && t.vence < hoy && t.estado !== 'hecha';
              const link = enlace(t);
              return (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <button type="button" className="mt-0.5" onClick={() => toggle.mutate(t)} aria-label={t.estado === 'hecha' ? 'Marcar pendiente' : 'Marcar hecha'}>
                    {t.estado === 'hecha' ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <Circle className="h-5 w-5 text-muted hover:text-primary" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[14px] font-medium', t.estado === 'hecha' && 'text-muted line-through')}>{t.titulo}</p>
                    {t.descripcion && <p className="text-[12.5px] text-muted">{t.descripcion}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      {t.asignado && ver === 'creadas' && <span>Para {t.asignado}</span>}
                      {t.prioridad === 'alta' && <Badge tone="red">Alta</Badge>}
                      {t.vence && <Badge tone={tarde ? 'red' : 'gray'}>{tarde ? 'Vencida el ' : 'Vence el '}{fmtDate(t.vence)}</Badge>}
                      {link && (
                        <Link to={link} className="text-primary hover:underline">
                          Ver ficha
                        </Link>
                      )}
                    </div>
                  </div>
                  {ver === 'creadas' && <IconButton icon={Trash2} label="Borrar" size="sm" onClick={() => borrar.mutate(t.id)} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Dialog
        open={nueva}
        onOpenChange={setNueva}
        title="Nueva tarea"
        footer={
          <Button variant="primary" disabled={!f.titulo.trim()} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>
            Crear
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Qué hay que hacer" required>
            <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} autoFocus />
          </Field>
          <Field label="Detalles">
            <Textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={2} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Para">
              <RefSelect target="personas" value={f.asignadoA} onChange={(v) => setF({ ...f, asignadoA: v })} placeholder="Para mí" />
            </Field>
            <Field label="Vence">
              <Input type="date" value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} />
            </Field>
            <Field label="Prioridad">
              <Select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })} options={[{ value: 'baja', label: 'Baja' }, { value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta' }]} />
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}
