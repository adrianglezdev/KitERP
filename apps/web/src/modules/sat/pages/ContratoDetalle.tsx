import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileSignature, HardDrive, Pencil, Repeat } from 'lucide-react';
import { fmtDate, fmtDateTime, fmtMoney, optionLabel, satShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Button, Card, CardHeader, Checkbox, Dialog, EnumBadge, KeyValue, PageHeader, Spinner } from '@/components/ui';
import { ResourceFormDialog } from '@/components/resource';
import { CONTRATO_ESTADOS, ORDEN_ESTADOS, PERIODICIDADES } from '../lib';

export default function ContratoDetalle() {
  const { id } = useParams();
  const { data: c, isLoading } = useApi<any>(`/sat/contratos/${id}/ficha`);
  const [edit, setEdit] = useState(false);
  const [equipos, setEquipos] = useState(false);
  if (isLoading || !c) return <Spinner />;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/sat/contratos"
        crumbs={[{ label: 'Contratos', to: '/sat/contratos' }, { label: c.codigo }]}
        title={c.nombre}
        icon={FileSignature}
        subtitle={
          <span>
            {c.codigo} · {c.cliente && <Link to={`/terceros/${c.cliente.id}?tab=sat-sat`} className="font-medium text-fg hover:text-primary">{c.cliente.nombre}</Link>}
          </span>
        }
        badges={<EnumBadge options={CONTRATO_ESTADOS} value={c.estado} />}
        actions={
          c.puedeEditar && (
            <>
              <Button icon={HardDrive} onClick={() => setEquipos(true)}>
                Equipos incluidos
              </Button>
              <Button icon={Pencil} onClick={() => setEdit(true)}>
                Editar
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title={`Equipos incluidos (${c.equipos.length})`} icon={HardDrive} />
            <ul className="divide-y divide-line">
              {c.equipos.map((e: any) => (
                <li key={e.id}>
                  <Link to={`/sat/equipos/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    <span className="min-w-0 flex-1 truncate font-medium">{e.nombre}</span>
                    <span className="text-[12.5px] text-muted">{[e.marca, e.modelo, e.ubicacion].filter(Boolean).join(' · ')}</span>
                  </Link>
                </li>
              ))}
              {!c.equipos.length && <li className="px-4 py-5 text-center text-[13px] text-muted">Sin equipos asociados.</li>}
            </ul>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Visitas" />
            <ul className="divide-y divide-line">
              {c.visitas.map((v: any) => (
                <li key={v.id}>
                  <Link to={`/sat/ordenes/${v.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    <span className="w-24 font-medium">{v.codigo}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                      {v.visitaFecha ? `Visita del ${fmtDate(v.visitaFecha)}` : v.planificadaInicio ? fmtDateTime(v.planificadaInicio) : 'Sin planificar'}
                      {v.tecnico ? ` · ${v.tecnico}` : ''}
                    </span>
                    <EnumBadge options={ORDEN_ESTADOS} value={v.estado} />
                  </Link>
                </li>
              ))}
              {!c.visitas.length && <li className="px-4 py-5 text-center text-[13px] text-muted">Las visitas se crean solas una semana antes de cada fecha prevista.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-4">
            <KeyValue
              cols={1}
              items={[
                { label: 'Vigencia', value: `${fmtDate(c.inicio)}${c.fin ? ` – ${fmtDate(c.fin)}` : ' · sin fin'}` },
                { label: 'Visitas', value: c.periodicidadMeses ? `Cada ${c.periodicidadMeses} meses` : optionLabel(PERIODICIDADES, c.periodicidad)?.label },
                { label: 'Próxima visita', value: c.proximaVisita ? fmtDate(c.proximaVisita) : null },
                { label: 'Técnico habitual', value: c.tecnico },
                { label: 'Tiempo de respuesta', value: c.slaRespuestaHoras ? `${c.slaRespuestaHoras} h` : null },
                { label: 'Cuota', value: c.cuota ? `${fmtMoney(c.cuota)} ${optionLabel(PERIODICIDADES, c.cuotaPeriodicidad)?.label?.toLowerCase() ?? ''}` : 'Sin cuota' },
              ]}
            />
          </Card>
          {c.recurrente && (
            <Alert tone="violet" icon={Repeat} title="Facturación recurrente">
              Próxima factura el {fmtDate(c.recurrente.proximaFecha)}
              {!c.recurrente.activo && ' (pausada)'}.{' '}
              <Link to="/facturas/recurrentes" className="font-semibold underline">
                Ver cuotas
              </Link>
            </Alert>
          )}
        </div>
      </div>
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={satShared.contratoResource} endpoint="/sat/contratos" record={c} />
      {equipos && <EquiposDialog contrato={c} onClose={() => setEquipos(false)} />}
    </div>
  );
}

function EquiposDialog({ contrato, onClose }: { contrato: any; onClose: () => void }) {
  const { data } = useApi<{ items: any[] }>(`/sat/equipos?f.terceroId=${contrato.terceroId}&pageSize=200`);
  const [sel, setSel] = useState<string[]>(contrato.equipos.map((e: any) => e.id));
  const guardar = useMut(() => api.put(`/sat/contratos/${contrato.id}/equipos`, { equipoIds: sel }), { ok: 'Equipos actualizados', invalidate: ['/sat'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Equipos incluidos en el contrato" footer={<Button variant="primary" loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>Guardar</Button>}>
      <div className="space-y-2">
        {data?.items.map((e) => (
          <Checkbox key={e.id} checked={sel.includes(e.id)} onChange={(v) => setSel(v ? [...sel, e.id] : sel.filter((x) => x !== e.id))} label={e.nombre} description={[e.marca, e.modelo, e.ubicacion].filter(Boolean).join(' · ')} />
        ))}
        {!data?.items.length && <p className="text-[13px] text-muted">Este cliente no tiene equipos registrados.</p>}
      </div>
    </Dialog>
  );
}

