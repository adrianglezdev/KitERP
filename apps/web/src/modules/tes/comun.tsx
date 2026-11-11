import { useState } from 'react';
import { Ban, Check, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { fmtDate, fmtMoney, optionLabel, tesShared } from '@kite/shared';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Dialog, EnumBadge, Field, IconButton, Input, KeyValue, Select, Sheet, Spinner, useConfirm } from '@/components/ui';
import { NumberInput } from '@/components/form/inputs';

export const { VENC_ESTADOS, MEDIOS_PAGO, CIRCUITOS, REMESA_ESTADOS, REMESA_TIPOS, MOV_ESTADOS } = tesShared;
export const hoy = () => new Date().toLocaleDateString('sv-SE');
const MEDIOS_MANUALES = MEDIOS_PAGO.filter((m) => ['transferencia', 'recibo', 'efectivo', 'tarjeta', 'pagare'].includes(m.value));

/** Cuentas activas para elegir dónde entra o sale el dinero. */
export function useCuentas() {
  const { data } = useApi<any[]>('/tes/saldos');
  return (data ?? []).filter((c) => c.activo);
}

export function CuentaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cuentas = useCuentas();
  return <Select value={value} onChange={(e) => onChange(e.target.value)} options={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} placeholder="Cuenta por defecto" />;
}

/** Registrar el cobro o pago de uno o varios vencimientos (importe completo pendiente). */
export function RegistrarLoteDialog({ ids, circuito, total, onClose }: { ids: string[]; circuito: string; total: number; onClose: () => void }) {
  const [f, setF] = useState({ fecha: hoy(), cuentaId: '', medio: 'transferencia' });
  const m = useMut(() => api.post('/tes/vencimientos/registrar-lote', { ids, ...f, cuentaId: f.cuentaId || null }), {
    ok: (r: any) => `${r.registrados} ${circuito === 'cobro' ? 'cobros' : 'pagos'} registrados · ${fmtMoney(r.total)}`,
    invalidate: ['/tes', '/documentos'],
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Registrar ${circuito === 'cobro' ? 'cobro' : 'pago'} de ${ids.length} vencimientos`}
      footer={
        <Button variant="primary" icon={Check} loading={m.isPending} onClick={() => m.mutate(undefined)}>
          Registrar {fmtMoney(total)}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha">
          <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </Field>
        <Field label="Cuenta">
          <CuentaSelect value={f.cuentaId} onChange={(v) => setF({ ...f, cuentaId: v })} />
        </Field>
        <Field label="Medio">
          <Select value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value })} options={MEDIOS_MANUALES} />
        </Field>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">Se genera el asiento contable de cada uno. Los recibos que están en una remesa se cobran al cerrarla.</p>
    </Dialog>
  );
}

/** Ficha de un vencimiento con su historial de cobros/pagos y acciones. */
export function VencimientoSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useSession();
  const gestiona = can('tes.gestionar');
  const { data: v, isLoading } = useApi<any>(`/tes/vencimientos/${id}`);
  const confirm = useConfirm();
  const [pago, setPago] = useState<{ importe: number | null; fecha: string; cuentaId: string; medio: string } | null>(null);
  const inv = ['/tes', '/documentos'];
  const accion = useMut(({ url, body }: { url: string; body?: unknown }) => api.post(url, body ?? {}), { ok: 'Hecho', invalidate: inv, onSuccess: () => setPago(null) });
  const borrar = useMut(() => api.del(`/tes/vencimientos/${id}`), { ok: 'Vencimiento borrado', invalidate: inv, onSuccess: onClose });
  const esCobro = v?.circuito === 'cobro';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={v ? `${esCobro ? 'Cobro' : 'Pago'} · ${fmtMoney(v.importe)}` : 'Vencimiento'} width="max-w-lg">
      {isLoading || !v ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <EnumBadge options={VENC_ESTADOS} value={v.estado} />
            {v.pendiente > 0 && <Badge tone="orange">Pendiente {fmtMoney(v.pendiente)}</Badge>}
          </div>
          <KeyValue
            items={[
              { label: esCobro ? 'Cliente' : 'Proveedor', value: v.terceroId ? <Link to={`/terceros/${v.terceroId}?tab=tes-tes`} className="text-primary hover:underline">{v.tercero}</Link> : v.tercero },
              { label: 'Vence', value: fmtDate(v.fecha) },
              { label: 'Concepto', value: v.concepto, span: 2 },
              { label: 'Factura', value: v.documentoId ? <Link to={`/documentos/${v.documentoId}`} className="text-primary hover:underline">{v.documento}</Link> : null },
              { label: 'Forma de pago', value: v.formaPagoTipo },
              { label: 'Notas', value: v.notas, span: 2 },
            ]}
          />
          <div>
            <p className="label mb-1">{esCobro ? 'Cobros' : 'Pagos'} registrados</p>
            {!v.pagos.length ? (
              <p className="text-[13px] text-muted">Ninguno todavía.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {v.pagos.map((p: any) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1">
                      {fmtDate(p.fecha)} · {optionLabel(MEDIOS_PAGO, p.medio)?.label}
                      {p.cuenta && <span className="text-muted"> · {p.cuenta}</span>}
                      {p.notas && <span className="block truncate text-[12px] text-muted">{p.notas}</span>}
                    </span>
                    {p.conciliado && <Badge tone="green">Conciliado</Badge>}
                    <span className={p.importe < 0 ? 'text-bad' : 'font-medium'}>{fmtMoney(p.importe)}</span>
                    {gestiona && p.importe > 0 && !p.conciliado && (
                      <IconButton
                        icon={Undo2}
                        label="Anular"
                        size="sm"
                        onClick={async () => (await confirm({ title: 'Anular este movimiento', message: 'Se registra el movimiento contrario y su asiento. El historial se conserva.', confirm: 'Anular', danger: true })) && accion.mutate({ url: `/tes/pagos/${p.id}/anular` })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {gestiona && pago && (
            <div className="space-y-3 rounded-xl bg-sunken p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Importe">
                  <NumberInput value={pago.importe} onChange={(n) => setPago({ ...pago, importe: n })} suffix="€" />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} />
                </Field>
                <Field label="Cuenta">
                  <CuentaSelect value={pago.cuentaId} onChange={(c) => setPago({ ...pago, cuentaId: c })} />
                </Field>
                <Field label="Medio">
                  <Select value={pago.medio} onChange={(e) => setPago({ ...pago, medio: e.target.value })} options={MEDIOS_MANUALES} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPago(null)}>
                  Cancelar
                </Button>
                <Button variant="primary" loading={accion.isPending} onClick={() => accion.mutate({ url: `/tes/vencimientos/${id}/pagos`, body: { ...pago, cuentaId: pago.cuentaId || null } })}>
                  Registrar
                </Button>
              </div>
            </div>
          )}
          {gestiona && !pago && (
            <div className="flex flex-wrap gap-2">
              {v.pendiente > 0 && v.estado !== 'remesado' && (
                <Button variant="primary" icon={Check} onClick={() => setPago({ importe: v.pendiente, fecha: hoy(), cuentaId: '', medio: 'transferencia' })}>
                  Registrar {esCobro ? 'cobro' : 'pago'}
                </Button>
              )}
              {esCobro && v.estado === 'pagado' && v.formaPagoTipo === 'domiciliacion' && (
                <Button
                  icon={RotateCcw}
                  onClick={async () => {
                    const motivo = await confirm({ title: 'Recibo devuelto por el banco', message: 'Se anula el cobro y el vencimiento vuelve a estar pendiente.', confirm: 'Registrar devolución', danger: true, input: { label: 'Motivo (opcional)' } });
                    if (motivo !== false) accion.mutate({ url: `/tes/vencimientos/${id}/devolver`, body: { motivo: typeof motivo === 'string' && motivo ? motivo : null } });
                  }}
                >
                  Devuelto
                </Button>
              )}
              {v.pendiente > 0 && (
                <Button icon={Ban} onClick={() => accion.mutate({ url: `/tes/vencimientos/${id}/impagado`, body: { activo: v.estado !== 'impagado' } })}>
                  {v.estado === 'impagado' ? 'Quitar impagado' : 'Marcar impagado'}
                </Button>
              )}
              {!v.documentoId && !v.pagos.length && (
                <IconButton icon={Trash2} label="Borrar" onClick={async () => (await confirm({ title: 'Borrar el vencimiento', confirm: 'Borrar', danger: true })) && borrar.mutate(undefined)} />
              )}
            </div>
          )}
          {v.estado === 'remesado' && <Alert tone="blue">Está incluido en una remesa: se dará por cobrado al cerrarla.</Alert>}
        </div>
      )}
    </Sheet>
  );
}
