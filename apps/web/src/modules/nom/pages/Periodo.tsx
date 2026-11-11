import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarRange, Clock, Download, Eye, Lock, Trash2, Upload } from 'lucide-react';
import { fmtDate, fmtMoney, nomShared } from '@kite/shared';
import { api, download } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Card, CardHeader, DataTable, Dialog, EnumBadge, Field, IconButton, PageHeader, Select, Spinner, Tabs, Textarea, useConfirm, useTab } from '@/components/ui';
import { FileDrop, NumberInput } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';
import { ResourceList } from '@/components/resource';
import { PERIODO_ESTADOS, RECIBO_TIPOS, abrirRecibo } from '../comun';

export default function Periodo() {
  const { id } = useParams();
  const { has } = useSession();
  const { data: p, isLoading } = useApi<any>(`/nom/periodos/${id}`);
  const tab = useTab('personas');
  const [cerrar, setCerrar] = useState(false);
  const [tipo, setTipo] = useState('nomina');
  const inv = ['/nom'];
  const horas = useMut(() => api.post<any>(`/nom/periodos/${id}/importar-horas`, {}), { ok: (r) => `${r.variables} variables de horas importadas`, invalidate: inv });
  const subir = useMut((archivoIds: string[]) => api.post<any>(`/nom/periodos/${id}/recibos`, { archivoIds, tipo }), {
    ok: (r) => `${r.creados.length} recibos: ${r.asignados} repartidos${r.sinAsignar ? `, ${r.sinAsignar} sin asignar` : ''}`,
    invalidate: inv,
  });
  if (isLoading || !p) return <Spinner />;
  const abierto = p.estado === 'abierto';
  const sinRecibo = p.personas.filter((x: any) => !x.recibo).length;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/nominas/periodos"
        crumbs={[{ label: 'Nóminas', to: '/nominas/periodos' }, { label: p.nombre }]}
        title={p.nombre}
        icon={CalendarRange}
        badges={<EnumBadge options={PERIODO_ESTADOS} value={p.estado} />}
        actions={
          <>
            {abierto && has('hor') && (
              <Button icon={Clock} loading={horas.isPending} onClick={() => horas.mutate(undefined)}>
                Traer horas extra
              </Button>
            )}
            <Button icon={Download} onClick={() => download(`/nom/periodos/${id}/excel`, `nomina-${p.anio}-${p.mes}.xlsx`)}>
              Excel para la gestoría
            </Button>
            {abierto && (
              <Button variant="primary" icon={Lock} onClick={() => setCerrar(true)}>
                Cerrar mes
              </Button>
            )}
          </>
        }
      />
      {p.totales && (
        <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-5">
          {[
            ['Bruto', p.totales.bruto],
            ['SS empresa', p.totales.ssEmpresa],
            ['SS trabajador', p.totales.ssTrabajador],
            ['IRPF', p.totales.irpf],
            ['Neto', p.totales.neto],
          ].map(([k, v]) => (
            <Card key={k as string} className="p-3">
              <p className="text-muted">{k}</p>
              <p className="font-display text-[17px] font-bold">{fmtMoney(v as number)}</p>
            </Card>
          ))}
        </div>
      )}
      <Tabs tabs={[{ id: 'personas', label: 'Plantilla', count: p.personas.length }, { id: 'variables', label: 'Variables' }, { id: 'recibos', label: 'Recibos', count: p.sinAsignar.length || undefined }]} />
      {tab === 'personas' && (
        <Card className="overflow-hidden">
          <DataTable
            rows={p.personas.map((x: any) => ({ ...x, id: x.personaId }))}
            columns={[
              { key: 'nombre', header: 'Persona', cell: (x: any) => <span className="font-medium">{x.nombre}</span> },
              { key: 'dep', header: 'Departamento', cell: (x: any) => x.departamento, hideBelow: 'md' },
              { key: 'vars', header: 'Variables', cell: (x: any) => (x.variables.length ? x.variables.map((v: any) => nomShared.VARIABLE_CONCEPTOS.find((c) => c.value === v.concepto)?.label).join(', ') : '—'), hideBelow: 'lg' },
              { key: 'total', header: 'Importe variables', align: 'right', cell: (x: any) => (x.total ? fmtMoney(x.total) : '—') },
              {
                key: 'recibo',
                header: 'Recibo',
                cell: (x: any) =>
                  x.recibo ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button type="button" className="text-primary hover:underline" onClick={() => abrirRecibo(x.recibo.id)}>
                        Ver
                      </button>
                      {x.recibo.leidoEn ? <Badge tone="green">Leído {fmtDate(x.recibo.leidoEn)}</Badge> : <Badge tone="gray">Sin leer</Badge>}
                    </span>
                  ) : (
                    <span className="text-muted">Pendiente</span>
                  ),
              },
            ]}
            mobileTitle={(x: any) => x.nombre}
            mobileSubtitle={(x: any) => (x.recibo ? (x.recibo.leidoEn ? 'Recibo leído' : 'Recibo sin leer') : 'Sin recibo')}
            mobileRight={(x: any) => (x.total ? fmtMoney(x.total) : '')}
          />
        </Card>
      )}
      {tab === 'variables' && (
        <>
          {!abierto && <Alert tone="blue">El mes está cerrado: las variables ya no se pueden cambiar.</Alert>}
          <ResourceList def={nomShared.variableResource} endpoint="/nom/variables" embedded fixed={{ periodoId: p.id }} initial={{ periodoId: p.id }} hideInForm={['periodoId', 'origen']} createPerm={abierto ? 'nom.gestionar' : '__nadie'} editPerm={abierto ? 'nom.gestionar' : '__nadie'} />
        </>
      )}
      {tab === 'recibos' && (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <CardHeader title="Subir recibos" icon={Upload} className="!p-0" />
            <p className="text-[13px] text-muted">Sube el PDF de la gestoría (uno con todos los recibos o uno por persona). Se reparte a cada trabajador por su DNI. {sinRecibo > 0 && `Faltan ${sinRecibo} personas por recibir el suyo.`}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select className="sm:w-48" value={tipo} onChange={(e) => setTipo(e.target.value)} options={RECIBO_TIPOS} />
              <div className="flex-1">
                <FileDrop accept="application/pdf" compact label="PDF de los recibos" onUploaded={(f) => subir.mutate(f.map((x) => x.id))} />
              </div>
            </div>
          </Card>
          {p.sinAsignar.length > 0 && <SinAsignar recibos={p.sinAsignar} />}
        </div>
      )}
      {cerrar && <CerrarDialog id={p.id} onClose={() => setCerrar(false)} />}
    </div>
  );
}

function SinAsignar({ recibos }: { recibos: any[] }) {
  const confirm = useConfirm();
  const asignar = useMut(({ id, personaId }: { id: string; personaId: string | null }) => api.patch(`/nom/recibos/${id}`, { personaId }), { ok: 'Recibo asignado', invalidate: ['/nom'] });
  const borrar = useMut((id: string) => api.del(`/nom/recibos/${id}`), { ok: 'Recibo borrado', invalidate: ['/nom'] });
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Recibos sin asignar" subtitle="No se ha encontrado el DNI de ninguna persona activa. Elige a quién corresponde." />
      <ul className="divide-y divide-line">
        {recibos.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
            <a href={r.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px] text-primary">
              <Eye className="h-4 w-4" /> <span className="truncate">{r.titulo ?? 'Recibo'}</span>
              {r.dniDetectado && <span className="text-muted">· DNI {r.dniDetectado}</span>}
            </a>
            <RefSelect className="sm:w-64" target="personas" value={null} onChange={(pid) => pid && asignar.mutate({ id: r.id, personaId: pid })} placeholder="Asignar a…" />
            <IconButton icon={Trash2} label="Borrar" size="sm" onClick={async () => (await confirm({ title: 'Borrar el recibo', danger: true, confirm: 'Borrar' })) && borrar.mutate(r.id)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CerrarDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [t, setT] = useState({ bruto: null as number | null, ssEmpresa: null as number | null, ssTrabajador: null as number | null, irpf: null as number | null, neto: null as number | null });
  const [notas, setNotas] = useState('');
  const neto = (t.bruto ?? 0) - (t.ssTrabajador ?? 0) - (t.irpf ?? 0);
  const m = useMut(() => api.post(`/nom/periodos/${id}/cerrar`, { totales: { bruto: t.bruto ?? 0, ssEmpresa: t.ssEmpresa ?? 0, ssTrabajador: t.ssTrabajador ?? 0, irpf: t.irpf ?? 0, neto: t.neto ?? neto }, notas: notas || null }), { ok: 'Mes cerrado y contabilizado', invalidate: ['/nom'], onSuccess: onClose });
  const campo = (k: keyof typeof t, label: string) => (
    <Field label={label}>
      <NumberInput value={t[k]} onChange={(n) => setT({ ...t, [k]: n })} suffix="€" />
    </Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Cerrar el mes" footer={<Button variant="primary" icon={Lock} loading={m.isPending} onClick={() => m.mutate(undefined)}>Cerrar y contabilizar</Button>}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Copia los totales del resumen de la gestoría. Se genera el asiento de nóminas y los pagos pendientes en tesorería.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('bruto', 'Total devengado (bruto)')}
          {campo('ssEmpresa', 'Seguridad Social empresa')}
          {campo('ssTrabajador', 'Seguridad Social trabajadores')}
          {campo('irpf', 'Retenciones IRPF')}
          {campo('neto', 'Líquido a percibir')}
        </div>
        {t.bruto ? <p className="text-[12.5px] text-muted">Neto esperado: {fmtMoney(neto)}</p> : null}
        <Field label="Notas">
          <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

