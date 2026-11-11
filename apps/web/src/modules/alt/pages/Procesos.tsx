import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Lock, LogIn, LogOut, Route } from 'lucide-react';
import { altShared, fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, Checkbox, DataTable, Dialog, EnumBadge, Field, Input, PageHeader, ProgressBar, Segmented, Select, Sheet, Spinner, Textarea, useConfirm } from '@/components/ui';
import { RefSelect } from '@/components/form/RefSelect';

const { PROCESO_TIPOS, PROCESO_ESTADOS } = altShared;
const ESTADO_TAREA = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'hecha', label: 'Hecha' },
];

/** Incorporaciones y salidas: cada una con su lista de tareas repartidas entre departamentos. */
export default function Procesos() {
  const { can } = useSession();
  const [estado, setEstado] = useState('en_curso');
  const { data, isLoading } = useApi<any[]>(`/alt/procesos${estado ? `?estado=${estado}` : ''}`);
  const [nuevo, setNuevo] = useState<'alta' | 'baja' | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Altas y bajas"
        icon={Route}
        subtitle="Nadie se olvida de nada: alta en la Seguridad Social, equipo, accesos, formación, devolución de material…"
        actions={
          can('alt.gestionar') && (
            <>
              <Button icon={LogOut} onClick={() => setNuevo('baja')}>
                Salida
              </Button>
              <Button variant="primary" icon={LogIn} onClick={() => setNuevo('alta')}>
                Incorporación
              </Button>
            </>
          )
        }
      />
      <Segmented className="mb-3" value={estado} onChange={setEstado} options={[{ value: 'en_curso', label: 'En curso' }, { value: 'completado', label: 'Completados' }, { value: '', label: 'Todos' }]} />
      <Card className="overflow-hidden">
        <DataTable
          rows={data ?? []}
          loading={isLoading}
          onRowClick={(p: any) => setAbierto(p.id)}
          empty="No hay procesos."
          columns={[
            { key: 'tipo', header: 'Tipo', cell: (p: any) => <EnumBadge options={PROCESO_TIPOS} value={p.tipo} /> },
            { key: 'persona', header: 'Persona', cell: (p: any) => <span className="font-medium">{p.persona}</span> },
            { key: 'puesto', header: 'Puesto', cell: (p: any) => p.puesto, hideBelow: 'md' },
            { key: 'fecha', header: 'Fecha', cell: (p: any) => fmtDate(p.fecha) },
            { key: 'avance', header: 'Avance', cell: (p: any) => (
                <span className="flex w-32 items-center gap-2">
                  <ProgressBar value={p.total ? (p.hechas / p.total) * 100 : 0} tone={p.hechas === p.total ? 'green' : 'violet'} />
                  <span className="text-[12px] text-muted">{p.hechas}/{p.total}</span>
                </span>
              ) },
            { key: 'estado', header: 'Estado', cell: (p: any) => <EnumBadge options={PROCESO_ESTADOS} value={p.estado} />, hideBelow: 'lg' },
          ]}
          mobileTitle={(p: any) => p.persona}
          mobileSubtitle={(p: any) => `${p.tipo === 'alta' ? 'Incorporación' : 'Salida'} · ${fmtDate(p.fecha)}`}
          mobileRight={(p: any) => `${p.hechas}/${p.total}`}
        />
      </Card>
      {nuevo === 'alta' && <AltaDialog onClose={() => setNuevo(null)} />}
      {nuevo === 'baja' && <BajaDialog onClose={() => setNuevo(null)} />}
      {abierto && <ProcesoSheet id={abierto} onClose={() => setAbierto(null)} />}
    </>
  );
}

function AltaDialog({ onClose }: { onClose: () => void }) {
  const plantillas = useApi<any[]>('/alt/plantillas?tipo=alta');
  const [f, setF] = useState({ personaId: null as string | null, fecha: new Date().toLocaleDateString('sv-SE'), plantillaId: '', notas: '' });
  const m = useMut(() => api.post('/alt/altas', { ...f, plantillaId: f.plantillaId || null, notas: f.notas || null }), { ok: 'Incorporación en marcha: tareas repartidas', invalidate: ['/alt'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nueva incorporación" footer={<Button variant="primary" disabled={!f.personaId} loading={m.isPending} onClick={() => m.mutate(undefined)}>Empezar</Button>}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">
          Primero crea la ficha de la persona en <Link to="/personas" className="font-semibold text-primary">Personas</Link> (o contrátala desde Selección).
        </p>
        <Field label="Persona" required>
          <RefSelect target="personas" value={f.personaId} onChange={(v) => setF({ ...f, personaId: v })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha de incorporación">
            <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Field>
          <Field label="Plantilla de tareas">
            <Select value={f.plantillaId} onChange={(e) => setF({ ...f, plantillaId: e.target.value })} options={(plantillas.data ?? []).map((p) => ({ value: p.id, label: p.nombre }))} placeholder="Sin plantilla" />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

function BajaDialog({ onClose }: { onClose: () => void }) {
  const plantillas = useApi<any[]>('/alt/plantillas?tipo=baja');
  const [f, setF] = useState({ personaId: null as string | null, fecha: new Date().toLocaleDateString('sv-SE'), plantillaId: '', motivo: '', bloquearAcceso: true, notas: '' });
  const prev = useApi<any>(f.personaId ? `/alt/bajas/preview?personaId=${f.personaId}` : null);
  const m = useMut(() => api.post('/alt/bajas', { ...f, plantillaId: f.plantillaId || null, motivo: f.motivo || null, notas: f.notas || null }), { ok: 'Salida en marcha', invalidate: ['/alt'], onSuccess: onClose });
  const p = prev.data;
  return (
    <Dialog open size="lg" onOpenChange={(o) => !o && onClose()} title="Nueva salida" footer={<Button variant="danger" disabled={!f.personaId} loading={m.isPending} onClick={() => m.mutate(undefined)}>Registrar salida</Button>}>
      <div className="space-y-3">
        <Field label="Persona" required>
          <RefSelect target="personas" value={f.personaId} onChange={(v) => setF({ ...f, personaId: v })} />
        </Field>
        {prev.isLoading && f.personaId && <Spinner />}
        {p && (
          <Alert tone="orange" icon={AlertTriangle} title="Antes de que se vaya">
            <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
              {p.activos?.length > 0 && <li>Tiene {p.activos.length} activos asignados: {p.activos.map((a: any) => a.nombre).join(', ')}.</li>}
              {p.tareasAbiertas?.length > 0 && <li>{p.tareasAbiertas.length} tareas abiertas a su nombre.</li>}
              {p.equipo?.length > 0 && <li>Es responsable de {p.equipo.length} personas: hay que reasignarlas.</li>}
              {p.ausenciasFuturas?.length > 0 && <li>{p.ausenciasFuturas.length} ausencias futuras que se anularán.</li>}
              {p.saldos?.length > 0 && <li>Vacaciones pendientes: {p.saldos.map((s: any) => `${s.disponible ?? s.pendiente ?? 0} días de ${s.tipo ?? s.nombre ?? ''}`).join(', ')} (para el finiquito).</li>}
              {!p.activos?.length && !p.tareasAbiertas?.length && !p.equipo?.length && <li>No tiene nada pendiente.</li>}
            </ul>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Último día">
            <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Field>
          <Field label="Plantilla de tareas">
            <Select value={f.plantillaId} onChange={(e) => setF({ ...f, plantillaId: e.target.value })} options={(plantillas.data ?? []).map((x) => ({ value: x.id, label: x.nombre }))} placeholder="Sin plantilla" />
          </Field>
        </div>
        <Field label="Motivo">
          <Input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Fin de contrato, baja voluntaria…" />
        </Field>
        <Checkbox checked={f.bloquearAcceso} onChange={(v) => setF({ ...f, bloquearAcceso: v })} label="Bloquear su acceso a KiteERP el último día" description="Mantiene su historial; solo deja de poder entrar." />
      </div>
    </Dialog>
  );
}

function ProcesoSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useSession();
  const gestiona = can('alt.gestionar');
  const confirm = useConfirm();
  const { data: p, isLoading } = useApi<any>(`/alt/procesos/${id}`);
  const tarea = useMut(({ tid, estado }: { tid: string; estado: string }) => api.post(`/alt/procesos/${id}/tareas/${tid}`, { estado }), { invalidate: ['/alt'] });
  const accion = useMut((a: string) => api.post(`/alt/procesos/${id}/${a}`, {}), { ok: 'Hecho', invalidate: ['/alt'] });
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={p ? `${p.tipo === 'alta' ? 'Incorporación' : 'Salida'} de ${p.persona?.nombre ?? ''}` : 'Proceso'}
      width="max-w-lg"
      footer={
        p &&
        gestiona &&
        p.estado === 'en_curso' && (
          <div className="flex w-full flex-wrap justify-end gap-2">
            {p.tipo === 'baja' && (
              <Button icon={Lock} onClick={async () => (await confirm({ title: 'Bloquear el acceso ahora', danger: true, confirm: 'Bloquear' })) && accion.mutate('bloquear')}>
                Bloquear acceso
              </Button>
            )}
            <Button onClick={async () => (await confirm({ title: 'Cancelar el proceso', danger: true, confirm: 'Cancelar proceso' })) && accion.mutate('cancelar')}>Cancelar</Button>
            <Button variant="primary" icon={Check} onClick={() => accion.mutate('completar')}>
              Completar
            </Button>
          </div>
        )
      }
    >
      {isLoading || !p ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            {fmtDate(p.fecha)} · <EnumBadge options={PROCESO_ESTADOS} value={p.estado} />
          </p>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {p.tareas.map((t: any) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1">
                  <span className={t.estado === 'hecha' ? 'text-muted line-through' : 'font-medium'}>{t.titulo}</span>
                  <span className="block text-[12px] text-muted">
                    {t.asignado ?? 'Sin asignar'}
                    {t.vence && ` · ${fmtDate(t.vence)}`}
                  </span>
                </span>
                {gestiona && t.tareaId ? <Select className="h-8 w-28 text-[12.5px]" value={t.estado ?? 'pendiente'} onChange={(e) => tarea.mutate({ tid: t.tareaId, estado: e.target.value })} options={ESTADO_TAREA} /> : <span className="text-[12px] text-muted">{t.estado}</span>}
              </li>
            ))}
            {!p.tareas.length && <li className="px-3 py-3 text-center text-[13px] text-muted">Sin tareas.</li>}
          </ul>
          {p.activos?.length > 0 && (
            <Alert tone="orange" title="Material que debe devolver">
              {p.activos.map((a: any) => (
                <Link key={a.id} to={`/activos/${a.id}`} className="mr-2 font-semibold underline">
                  {a.nombre}
                </Link>
              ))}
            </Alert>
          )}
        </div>
      )}
    </Sheet>
  );
}
