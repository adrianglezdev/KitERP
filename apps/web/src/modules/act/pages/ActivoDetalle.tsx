import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, Check, Fuel, Pencil, Plus, Truck, UserCheck, UserX, Wrench, X } from 'lucide-react';
import { fmtDate, fmtMoney, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, CardHeader, DataTable, Dialog, EnumBadge, Field, IconButton, Input, KeyValue, PageHeader, Spinner, Stat, Tabs, Textarea, useConfirm, useTab } from '@/components/ui';
import { NumberInput, SignaturePad } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';
import { ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';
import { ACTIVO_ESTADOS, ACTIVO_TIPOS, CompletarDialog, DiasBadge, REGISTRO_TIPOS, VENCIMIENTO_ESTADOS, VENCIMIENTO_TIPOS, activoResource, registroResource, vencimientoResource } from '../comun';

export default function ActivoDetalle() {
  const { id } = useParams();
  const { can, has } = useSession();
  const gestiona = can('act.gestionar');
  const { data: a, isLoading } = useApi<any>(`/act/activos/${id}`);
  const res = useApi<any>(`/act/activos/${id}/resumen`);
  const tab = useTab('vencimientos');
  const [edit, setEdit] = useState(false);
  const [asignar, setAsignar] = useState<'asignar' | 'devolver' | null>(null);
  if (isLoading || !a) return <Spinner />;
  const r = res.data;
  const refs = a._refs ?? {};
  return (
    <div className="space-y-5">
      <PageHeader
        back="/activos"
        crumbs={[{ label: 'Activos', to: '/activos' }, { label: a.codigo }]}
        title={a.nombre}
        icon={Truck}
        subtitle={[a.codigo, a.matricula, [a.marca, a.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
        badges={
          <>
            <EnumBadge options={ACTIVO_TIPOS} value={a.tipo} dot={false} />
            <EnumBadge options={ACTIVO_ESTADOS} value={a.estado} />
          </>
        }
        actions={
          gestiona && (
            <>
              {a.asignadoId ? (
                <Button icon={UserX} onClick={() => setAsignar('devolver')}>
                  Recoger
                </Button>
              ) : (
                <Button icon={UserCheck} onClick={() => setAsignar('asignar')}>
                  Entregar a…
                </Button>
              )}
              <Button icon={Pencil} onClick={() => setEdit(true)}>
                Editar
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Asignado a" value={a.asignadoId ? <Link to={`/personas/${a.asignadoId}`} className="hover:text-primary">{refs.personas?.[a.asignadoId] ?? '—'}</Link> : 'Nadie'} tone="violet" />
        <Stat label="Coste último año" value={r ? fmtMoney(r.costes.ultimoAnio) : '…'} tone="yellow" />
        {a.tipo === 'vehiculo' ? (
          <Stat label="Coste por km" value={r?.costes.costeKm != null ? `${r.costes.costeKm.toLocaleString('es-ES')} €` : '—'} hint={r?.costes.consumo100 ? `${r.costes.consumo100} l/100 km` : undefined} tone="green" />
        ) : (
          <Stat label="Coste total" value={r ? fmtMoney(r.costes.total) : '…'} tone="green" />
        )}
        <Stat label="Valor neto contable" value={r?.amortizacion ? fmtMoney(r.amortizacion.valorNeto) : a.valorCompra ? fmtMoney(a.valorCompra) : '—'} hint={r?.amortizacion ? `${r.amortizacion.cuotas} cuotas` : undefined} tone="violet" />
      </div>
      <Tabs
        tabs={[
          { id: 'vencimientos', label: 'Vencimientos' },
          { id: 'registros', label: 'Mantenimientos y gastos' },
          { id: 'asignaciones', label: 'Entregas' },
          { id: 'datos', label: 'Datos' },
          { id: 'archivos', label: 'Archivos' },
        ]}
      />
      {tab === 'vencimientos' && <Vencimientos activo={a} gestiona={gestiona} />}
      {tab === 'registros' && <Registros activo={a} />}
      {tab === 'asignaciones' && <Asignaciones activo={a} />}
      {tab === 'datos' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-4">
            <KeyValue
              items={[
                { label: 'Nº serie / bastidor', value: a.numeroSerie },
                { label: 'Kilómetros', value: a.km ? a.km.toLocaleString('es-ES') : null },
                { label: 'Centro', value: refs.centros?.[a.centroId] },
                { label: 'Proyecto', value: a.proyectoId && has('pry') ? <Link to={`/proyectos/${a.proyectoId}`} className="text-primary hover:underline">{refs.proyectos?.[a.proyectoId] ?? 'Ver'}</Link> : null },
                { label: 'Proveedor', value: refs.proveedores?.[a.proveedorId] },
                { label: 'Compra', value: a.fechaCompra ? `${fmtDate(a.fechaCompra)}${a.valorCompra ? ` · ${fmtMoney(a.valorCompra)}` : ''}` : null },
                { label: 'Notas', value: a.notas, span: 2 },
              ]}
            />
          </Card>
          {r?.amortizacion && (
            <Card className="p-4">
              <CardHeader title="Amortización" className="!px-0 !pt-0" />
              <KeyValue
                items={[
                  { label: 'Base amortizable', value: fmtMoney(r.amortizacion.base) },
                  { label: 'Cuota mensual', value: fmtMoney(r.amortizacion.cuota) },
                  { label: 'Amortizado', value: fmtMoney(r.amortizacion.amortizado) },
                  { label: 'Pendiente', value: fmtMoney(r.amortizacion.pendiente) },
                  { label: 'Último periodo', value: r.amortizacion.ultimoPeriodo },
                  { label: 'Cuentas', value: `${a.cuentaActivo ?? '—'} / ${a.cuentaAmortizacion} / ${a.cuentaGasto}` },
                ]}
              />
            </Card>
          )}
        </div>
      )}
      {tab === 'archivos' && <EntityTabsView entidad="activo" id={a.id} record={a} tabs={[]} common={['adjuntos', 'comentarios', 'actividad']} />}
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={activoResource} endpoint="/act/activos" record={a} />
      {asignar && <AsignarDialog activo={a} modo={asignar} onClose={() => setAsignar(null)} />}
    </div>
  );
}

function Vencimientos({ activo, gestiona }: { activo: any; gestiona: boolean }) {
  const { data } = useApi<any[]>(`/act/vencimientos?activoId=${activo.id}&estado=pendiente,hecho`);
  const [nuevo, setNuevo] = useState(false);
  const [completar, setCompletar] = useState<any | null>(null);
  const confirm = useConfirm();
  const cancelar = useMut((vid: string) => api.post(`/act/vencimientos/${vid}/cancelar`, {}), { ok: 'Cancelado', invalidate: ['/act'] });
  return (
    <Card className="overflow-hidden">
      <CardHeader title="ITV, seguros, revisiones…" icon={CalendarClock} actions={gestiona && <Button size="sm" icon={Plus} onClick={() => setNuevo(true)}>Añadir</Button>} />
      <ul className="divide-y divide-line">
        {(data ?? []).map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13.5px]">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{v.descripcion || optionLabel(VENCIMIENTO_TIPOS, v.tipo)?.label}</span>
              <span className="text-[12px] text-muted">
                {fmtDate(v.fecha)}
                {v.periodicidadMeses ? ` · cada ${v.periodicidadMeses} meses` : ''}
              </span>
            </span>
            <DiasBadge v={v} />
            {v.estado !== 'pendiente' && <EnumBadge options={VENCIMIENTO_ESTADOS} value={v.estado} />}
            {gestiona && v.estado === 'pendiente' && (
              <>
                <Button size="sm" variant="primary" icon={Check} onClick={() => setCompletar({ ...v, activo: activo.nombre })}>
                  Hecho
                </Button>
                <IconButton icon={X} label="Cancelar" size="sm" onClick={async () => (await confirm({ title: 'Cancelar el vencimiento', confirm: 'Cancelar vencimiento', danger: true })) && cancelar.mutate(v.id)} />
              </>
            )}
          </li>
        ))}
        {!data?.length && <li className="px-4 py-4 text-center text-[13px] text-muted">Sin vencimientos. Añade la ITV o el seguro para que avise a tiempo.</li>}
      </ul>
      <ResourceFormDialog open={nuevo} onOpenChange={setNuevo} def={vencimientoResource} endpoint="/act/vencimientos" initial={{ activoId: activo.id }} hide={['activoId']} />
      {completar && <CompletarDialog v={completar} onClose={() => setCompletar(null)} />}
    </Card>
  );
}

function Registros({ activo }: { activo: any }) {
  const { data, isLoading } = useApi<any[]>(`/act/activos/${activo.id}/registros`);
  const [nuevo, setNuevo] = useState(false);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Mantenimientos, combustible y gastos" icon={Wrench} actions={<Button size="sm" icon={activo.tipo === 'vehiculo' ? Fuel : Plus} onClick={() => setNuevo(true)}>Registrar</Button>} />
      <DataTable
        dense
        loading={isLoading}
        rows={data ?? []}
        empty="Sin registros."
        columns={[
          { key: 'fecha', header: 'Fecha', cell: (r: any) => fmtDate(r.fecha), width: '100px' },
          { key: 'tipo', header: 'Tipo', cell: (r: any) => <EnumBadge options={REGISTRO_TIPOS} value={r.tipo} dot={false} /> },
          { key: 'desc', header: 'Descripción', cell: (r: any) => <span className="line-clamp-1">{r.descripcion ?? r.proveedor ?? ''}</span>, hideBelow: 'md' },
          { key: 'km', header: 'Km', align: 'right', cell: (r: any) => (r.km ? r.km.toLocaleString('es-ES') : ''), hideBelow: 'md' },
          { key: 'litros', header: 'Litros', align: 'right', cell: (r: any) => (r.litros ? Number(r.litros) : ''), hideBelow: 'lg' },
          { key: 'coste', header: 'Coste', align: 'right', cell: (r: any) => (r.coste ? fmtMoney(r.coste) : '') },
          { key: 'f', header: '', width: '60px', cell: (r: any) => (r.archivoUrl ? <a href={r.archivoUrl} target="_blank" rel="noreferrer" className="text-[12px] text-primary">Factura</a> : null) },
        ]}
        mobileTitle={(r: any) => optionLabel(REGISTRO_TIPOS, r.tipo)?.label}
        mobileSubtitle={(r: any) => `${fmtDate(r.fecha)}${r.km ? ` · ${r.km} km` : ''}`}
        mobileRight={(r: any) => (r.coste ? fmtMoney(r.coste) : '')}
      />
      <ResourceFormDialog
        open={nuevo}
        onOpenChange={setNuevo}
        def={registroResource}
        endpoint={`/act/activos/${activo.id}/registros`}
        initial={{ activoId: activo.id, tipo: activo.tipo === 'vehiculo' ? 'combustible' : 'preventivo' }}
        hide={['activoId']}
      />
    </Card>
  );
}

function Asignaciones({ activo }: { activo: any }) {
  const { data } = useApi<any[]>(`/act/activos/${activo.id}/asignaciones`);
  const verFirma = async (aid: string, cual: string) => {
    const r = await api.get<{ firma: string | null }>(`/act/asignaciones/${aid}/firma/${cual}`);
    if (r.firma) {
      const w = window.open();
      w?.document.write(`<img src="${r.firma}" style="max-width:100%">`);
    }
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Historial de entregas" icon={UserCheck} subtitle="Quién lo ha tenido, cuándo, con qué kilómetros y su firma." />
      <ul className="divide-y divide-line">
        {(data ?? []).map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13.5px]">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{x.persona}</span>
              <span className="text-[12px] text-muted">
                {fmtDate(x.desde)}
                {x.kmEntrega != null && ` (${x.kmEntrega} km)`} → {x.hasta ? `${fmtDate(x.hasta)}${x.kmDevolucion != null ? ` (${x.kmDevolucion} km)` : ''}` : 'actualmente'}
              </span>
            </span>
            {x.firmaEntrega && (
              <button type="button" className="text-[12px] font-semibold text-primary" onClick={() => verFirma(x.id, 'entrega')}>
                Firma entrega
              </button>
            )}
            {x.firmaDevolucion && (
              <button type="button" className="text-[12px] font-semibold text-primary" onClick={() => verFirma(x.id, 'devolucion')}>
                Firma devolución
              </button>
            )}
            {!x.hasta && <Badge tone="green">Actual</Badge>}
          </li>
        ))}
        {!data?.length && <li className="px-4 py-4 text-center text-[13px] text-muted">Nunca se ha entregado a nadie.</li>}
      </ul>
    </Card>
  );
}

function AsignarDialog({ activo, modo, onClose }: { activo: any; modo: 'asignar' | 'devolver'; onClose: () => void }) {
  const [f, setF] = useState({ personaId: null as string | null, fecha: new Date().toLocaleDateString('sv-SE'), km: (activo.km ?? null) as number | null, notas: '', firma: null as string | null });
  const m = useMut(() => api.post(`/act/activos/${activo.id}/${modo}`, { ...f, notas: f.notas || null }), { ok: modo === 'asignar' ? 'Entregado' : 'Recogido', invalidate: ['/act'], onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={modo === 'asignar' ? `Entregar ${activo.nombre}` : `Recoger ${activo.nombre}`}
      footer={<Button variant="primary" disabled={modo === 'asignar' && !f.personaId} loading={m.isPending} onClick={() => m.mutate(undefined)}>Confirmar</Button>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {modo === 'asignar' && (
            <Field label="Persona" required className="sm:col-span-2">
              <RefSelect target="personas" value={f.personaId} onChange={(id) => setF({ ...f, personaId: id })} />
            </Field>
          )}
          <Field label="Fecha">
            <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Field>
          {activo.tipo === 'vehiculo' && (
            <Field label="Kilómetros">
              <NumberInput value={f.km} onChange={(n) => setF({ ...f, km: n })} decimals={0} />
            </Field>
          )}
        </div>
        <Field label="Estado y observaciones">
          <Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Golpes, accesorios que lleva…" />
        </Field>
        <div>
          <p className="label mb-1">Firma de {modo === 'asignar' ? 'quien lo recibe' : 'quien lo devuelve'} (opcional)</p>
          <SignaturePad onChange={(d) => setF((p) => ({ ...p, firma: d }))} height={150} />
        </div>
      </div>
    </Dialog>
  );
}
