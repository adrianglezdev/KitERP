import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileInput, KanbanSquare, Plus } from 'lucide-react';
import { fmtDate, pryShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useDebounced, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, Dialog, EmptyState, EnumBadge, Field, Input, PageHeader, Pagination, ProgressBar, SearchInput, Segmented, Spinner, Switch } from '@/components/ui';
import { RefSelect } from '@/components/form/RefSelect';
import { ResourceFormDialog } from '@/components/resource';

const { PROYECTO_ESTADOS, proyectoResource } = pryShared;

/** Proyectos y obras: tarjetas con avance, horas y responsable. */
export default function Proyectos() {
  const { can } = useSession();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [estado, setEstado] = useState('planificado,en_curso,pausado');
  const [mios, setMios] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [nuevo, setNuevo] = useState(sp.get('nuevo') === '1');
  const [desde, setDesde] = useState(false);
  const { data, isLoading } = useApi<any>(`/pry/proyectos?page=${page}&pageSize=24${estado ? `&estado=${estado}` : ''}${mios ? '&mios=1' : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  return (
    <>
      <PageHeader
        title="Proyectos"
        icon={KanbanSquare}
        subtitle="Tareas, horas, material y facturación por hitos. La rentabilidad se calcula sola."
        actions={
          can('pry.editar') && (
            <>
              <Button icon={FileInput} onClick={() => setDesde(true)}>
                Desde presupuesto
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
                Nuevo proyecto
              </Button>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented
          value={estado}
          onChange={(v) => { setEstado(v); setPage(1); }}
          options={[
            { value: 'planificado,en_curso,pausado', label: 'Activos' },
            { value: 'terminado', label: 'Terminados' },
            { value: 'cancelado', label: 'Cancelados' },
            { value: '', label: 'Todos' },
          ]}
        />
        <Switch checked={mios} onChange={setMios} label="Solo en los que participo" />
        <SearchInput value={q} onChange={setQ} placeholder="Código, nombre o cliente" className="sm:ml-auto sm:w-64" />
      </div>
      {isLoading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={KanbanSquare} title="No hay proyectos" />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((p: any) => (
              <Link key={p.id} to={`/proyectos/${p.id}`} className="group block">
                <Card className="h-full border-l-4 p-4 transition group-hover:shadow-pop" style={{ borderLeftColor: p.color ?? '#35AE29' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] text-muted">{p.codigo}</p>
                      <p className="truncate font-semibold">{p.nombre}</p>
                      <p className="truncate text-[12.5px] text-muted">{p.cliente ?? 'Interno'}</p>
                    </div>
                    <EnumBadge options={PROYECTO_ESTADOS} value={p.estado} />
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={p.avance} tone={p.avance >= 100 ? 'green' : 'violet'} />
                    <p className="mt-1 flex justify-between text-[12px] text-muted">
                      <span>{p.avance}% de tareas</span>
                      <span>{Number(p.horas || 0).toLocaleString('es-ES')} h</span>
                    </p>
                  </div>
                  <p className="mt-2 text-[12px] text-muted">
                    {p.responsable ?? 'Sin responsable'}
                    {p.fechaFin && ` · fin ${fmtDate(p.fechaFin)}`}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageSize={24} total={data.total} onPage={setPage} />
        </>
      )}
      <ResourceFormDialog
        open={nuevo}
        onOpenChange={(o) => {
          setNuevo(o);
          if (!o && sp.get('nuevo')) setSp({}, { replace: true });
        }}
        def={proyectoResource}
        endpoint="/pry/proyectos"
        onSaved={(r) => nav(`/proyectos/${r.id}`)}
      />
      {desde && <DesdePresupuesto onClose={() => setDesde(false)} />}
    </>
  );
}

function DesdePresupuesto({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [presupuestoId, setPresupuestoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [responsableId, setResponsableId] = useState<string | null>(null);
  const m = useMut(() => api.post<any>('/pry/proyectos/desde-presupuesto', { presupuestoId, nombre: nombre || null, responsableId }), { ok: (r) => `Proyecto ${r.codigo} creado con ${r.partidas} partidas`, invalidate: ['/pry'], onSuccess: (r) => nav(`/proyectos/${r.id}`) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Proyecto desde un presupuesto" footer={<Button variant="primary" disabled={!presupuestoId} loading={m.isPending} onClick={() => m.mutate(undefined)}>Crear proyecto</Button>}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Cada línea del presupuesto se convierte en una partida con su venta y coste previstos, y el cliente queda enlazado.</p>
        <Field label="Presupuesto aceptado">
          <RefSelect target="documentos" filter={{ tipo: 'presupuesto' }} value={presupuestoId} onChange={setPresupuestoId} />
        </Field>
        <Field label="Nombre del proyecto" help="Si lo dejas vacío se usa el del presupuesto">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Field>
        <Field label="Responsable">
          <RefSelect target="personas" value={responsableId} onChange={setResponsableId} />
        </Field>
      </div>
    </Dialog>
  );
}
