import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileSignature, Pencil, Target, Trophy, XCircle } from 'lucide-react';
import { fmtDate, fmtMoney, opoShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { ResourceDetails, ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';
import { PerdidaDialog } from './Tablero';

export default function Oportunidad() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, has } = useSession();
  const { data: o, isLoading } = useApi<any>(`/opo/oportunidades/${id}`);
  const etapas = useApi<any[]>('/opo/etapas');
  const [edit, setEdit] = useState(false);
  const [perder, setPerder] = useState(false);
  const mover = useMut((p: { etapaId: string; motivoPerdida?: string; comentario?: string }) => api.post(`/opo/oportunidades/${id}/etapa`, p), { ok: 'Etapa actualizada', invalidate: ['/opo'] });
  const presupuesto = useMut(() => api.post<{ id: string }>(`/opo/oportunidades/${id}/presupuesto`), { ok: 'Presupuesto creado', invalidate: ['/opo', '/documentos'], onSuccess: (r) => nav(`/documentos/${r.id}/editar`) });
  if (isLoading || !o) return <Spinner />;
  const etapa = etapas.data?.find((e) => e.id === o.etapaId);
  const ganada = etapas.data?.find((e) => e.tipo === 'ganada');
  const perdida = etapas.data?.find((e) => e.tipo === 'perdida');
  const editable = can('opo.editar') && o._puedeEditar !== false;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/oportunidades"
        crumbs={[{ label: 'Oportunidades', to: '/oportunidades' }, { label: o.titulo }]}
        title={o.titulo}
        subtitle={
          <Link to={`/terceros/${o.terceroId}`} className="font-medium text-fg hover:text-primary">
            {o._refs?.terceros?.[o.terceroId]}
          </Link>
        }
        badges={etapa && <Badge tone={etapa.tipo === 'ganada' ? 'green' : etapa.tipo === 'perdida' ? 'red' : 'violet'} dot>{etapa.nombre}</Badge>}
        actions={
          editable && (
            <>
              {has('pre') && can('pre.editar') && !o.presupuestoId && (
                <Button variant="primary" icon={FileSignature} loading={presupuesto.isPending} onClick={() => presupuesto.mutate(undefined)}>
                  Crear presupuesto
                </Button>
              )}
              {etapa?.tipo === 'abierta' && ganada && (
                <Button variant="success" icon={Trophy} onClick={() => mover.mutate({ etapaId: ganada.id })}>
                  Ganada
                </Button>
              )}
              {etapa?.tipo === 'abierta' && perdida && (
                <Button icon={XCircle} onClick={() => setPerder(true)}>
                  Perdida
                </Button>
              )}
              <Button icon={Pencil} onClick={() => setEdit(true)}>
                Editar
              </Button>
            </>
          )
        }
      />
      {o.presupuestoId && (
        <Alert tone="violet" icon={FileSignature}>
          Tiene un presupuesto asociado.{' '}
          <Link to={`/documentos/${o.presupuestoId}`} className="font-semibold underline">
            Abrir presupuesto
          </Link>
        </Alert>
      )}
      {o.motivoPerdida && <Alert tone="red" title="Perdida">{opoShared.MOTIVOS_PERDIDA.find((m) => m.value === o.motivoPerdida)?.label}{o.comentarioPerdida ? ` · ${o.comentarioPerdida}` : ''}</Alert>}

      {etapas.data && editable && etapa?.tipo === 'abierta' && (
        <div className="scroll-thin flex gap-1 overflow-x-auto">
          {etapas.data
            .filter((e) => e.tipo === 'abierta')
            .map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => e.id !== o.etapaId && mover.mutate({ etapaId: e.id })}
                className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold transition ${e.orden <= (etapa?.orden ?? 0) ? 'bg-primary text-primary-fg' : 'bg-sunken text-muted hover:text-fg'}`}
              >
                {e.nombre}
              </button>
            ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <EntityTabsView
            entidad="oportunidad"
            id={o.id}
            record={o}
            tabs={[{ id: 'datos', label: 'Datos', icon: Target, content: <ResourceDetails def={opoShared.oportunidadResource} record={o} /> }]}
          />
        </div>
        <Card className="h-fit p-4">
          <p className="text-[12.5px] text-muted">Importe estimado</p>
          <p className="tabular font-display text-[26px] font-semibold">{o.importe ? fmtMoney(o.importe) : '—'}</p>
          <p className="mt-2 text-[13px] text-muted">
            Probabilidad {o.probabilidad ?? etapa?.probabilidad ?? 0} % · cierre previsto {o.cierrePrevisto ? fmtDate(o.cierrePrevisto) : 'sin fecha'}
          </p>
        </Card>
      </div>
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={opoShared.oportunidadResource} endpoint="/opo/oportunidades" record={o} />
      <PerdidaDialog
        open={perder}
        onClose={() => setPerder(false)}
        onConfirm={(m, c) => {
          setPerder(false);
          if (perdida) mover.mutate({ etapaId: perdida.id, motivoPerdida: m, comentario: c });
        }}
      />
    </div>
  );
}
