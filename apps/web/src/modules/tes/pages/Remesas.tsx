import { useMemo, useState } from 'react';
import { CheckCircle2, Download, Layers, Plus, Send, X } from 'lucide-react';
import { fmtDate, fmtMoney } from '@kite/shared';
import { api, download } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, Checkbox, DataTable, Dialog, EnumBadge, Field, IconButton, Input, PageHeader, Segmented, Select, Sheet, Spinner, useConfirm } from '@/components/ui';
import { REMESA_ESTADOS, REMESA_TIPOS, VENC_ESTADOS, hoy, useCuentas } from '../comun';

/** Remesas SEPA: recibos domiciliados a clientes (pain.008) y transferencias a proveedores (pain.001). */
export default function Remesas() {
  const { can } = useSession();
  const { data, isLoading } = useApi<any[]>('/tes/remesas');
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Remesas bancarias"
        icon={Layers}
        subtitle="Genera el fichero SEPA, súbelo a la banca online y ciérrala cuando el banco la abone o la cargue."
        actions={
          can('tes.gestionar') && (
            <Button variant="primary" icon={Plus} onClick={() => setNueva(true)}>
              Nueva remesa
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          rows={data ?? []}
          loading={isLoading}
          onRowClick={(r: any) => setAbierta(r.id)}
          empty="Aún no has generado remesas."
          columns={[
            { key: 'codigo', header: 'Remesa', cell: (r: any) => <span className="font-medium">{r.codigo}</span> },
            { key: 'tipo', header: 'Tipo', cell: (r: any) => <EnumBadge options={REMESA_TIPOS} value={r.tipo} dot={false} />, hideBelow: 'md' },
            { key: 'cuenta', header: 'Cuenta', cell: (r: any) => r.cuenta, hideBelow: 'lg' },
            { key: 'fecha', header: 'Cargo', cell: (r: any) => fmtDate(r.fechaCargo) },
            { key: 'estado', header: 'Estado', cell: (r: any) => <EnumBadge options={REMESA_ESTADOS} value={r.estado} /> },
            { key: 'n', header: 'Recibos', align: 'right', cell: (r: any) => r.numOperaciones, hideBelow: 'md' },
            { key: 'total', header: 'Importe', align: 'right', cell: (r: any) => <b>{fmtMoney(r.total)}</b> },
          ]}
          mobileTitle={(r: any) => r.codigo}
          mobileSubtitle={(r: any) => `${fmtDate(r.fechaCargo)} · ${r.numOperaciones} recibos`}
          mobileRight={(r: any) => <b>{fmtMoney(r.total)}</b>}
        />
      </Card>
      {nueva && <NuevaRemesa onClose={() => setNueva(false)} onCreada={(id) => { setNueva(false); setAbierta(id); }} />}
      {abierta && <RemesaSheet id={abierta} onClose={() => setAbierta(null)} />}
    </>
  );
}

function NuevaRemesa({ onClose, onCreada }: { onClose: () => void; onCreada: (id: string) => void }) {
  const cuentas = useCuentas().filter((c) => c.tipo === 'banco');
  const [tipo, setTipo] = useState<'cobro' | 'pago'>('cobro');
  const [cuentaId, setCuentaId] = useState('');
  const manana = new Date(Date.now() + 2 * 86400_000).toLocaleDateString('sv-SE');
  const [fechaCargo, setFechaCargo] = useState(manana);
  const cand = useApi<any[]>(`/tes/remesas/candidatos?tipo=${tipo}`);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const validos = useMemo(() => (cand.data ?? []).filter((v) => !v.motivo), [cand.data]);
  const total = (cand.data ?? []).filter((v) => sel.has(v.id)).reduce((s, v) => s + v.pendiente, 0);
  const crear = useMut(() => api.post<any>('/tes/remesas', { tipo, cuentaId: cuentaId || cuentas.find((c) => c.porDefecto)?.id || cuentas[0]?.id, fechaCargo, vencimientoIds: [...sel] }), {
    ok: 'Remesa generada',
    invalidate: ['/tes'],
    onSuccess: (r) => onCreada(r.id),
  });
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="Nueva remesa"
      footer={
        <Button variant="primary" disabled={!sel.size} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>
          Generar remesa de {fmtMoney(total)}
        </Button>
      }
    >
      <div className="space-y-3">
        <Segmented value={tipo} onChange={(v) => { setTipo(v); setSel(new Set()); }} options={REMESA_TIPOS.map((t) => ({ value: t.value as 'cobro' | 'pago', label: t.label }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cuenta bancaria">
            <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} options={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} placeholder="Cuenta por defecto" />
          </Field>
          <Field label={tipo === 'cobro' ? 'Fecha de cargo al cliente' : 'Fecha de ejecución'}>
            <Input type="date" min={hoy()} value={fechaCargo} onChange={(e) => setFechaCargo(e.target.value)} />
          </Field>
        </div>
        {cand.isLoading ? (
          <Spinner />
        ) : !cand.data?.length ? (
          <Alert tone="blue">No hay {tipo === 'cobro' ? 'recibos domiciliados' : 'pagos'} pendientes de remesar.</Alert>
        ) : (
          <>
            <Checkbox checked={validos.length > 0 && validos.every((v) => sel.has(v.id))} onChange={(on) => setSel(on ? new Set(validos.map((v) => v.id)) : new Set())} label={`Todos (${validos.length})`} />
            <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line">
              {cand.data.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                  <Checkbox checked={sel.has(v.id)} disabled={!!v.motivo} onChange={(on) => setSel((s) => { const n = new Set(s); on ? n.add(v.id) : n.delete(v.id); return n; })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{v.tercero}</span>
                    <span className="text-[12px] text-muted">
                      {v.documento ?? v.concepto} · vence {fmtDate(v.fecha)}
                      {v.motivo && <span className="text-warn"> · {v.motivo}</span>}
                    </span>
                  </span>
                  <span className="tabular-nums">{fmtMoney(v.pendiente)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}

function RemesaSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useSession();
  const gestiona = can('tes.gestionar');
  const confirm = useConfirm();
  const { data: r, isLoading } = useApi<any>(`/tes/remesas/${id}`);
  const accion = useMut(({ url, body }: { url: string; body?: unknown }) => api.post(url, body ?? {}), { ok: 'Hecho', invalidate: ['/tes', '/documentos'] });
  const quitar = useMut((vid: string) => api.del(`/tes/remesas/${id}/vencimientos/${vid}`), { ok: 'Recibo quitado de la remesa', invalidate: ['/tes'] });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={r ? `${r.codigo} · ${fmtMoney(r.total)}` : 'Remesa'} width="max-w-xl">
      {isLoading || !r ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <EnumBadge options={REMESA_ESTADOS} value={r.estado} />
            <span className="text-muted">
              {r.cuenta} · cargo {fmtDate(r.fechaCargo)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={() => download(`/tes/remesas/${id}/xml`, `${r.codigo}.xml`)}>
              Fichero SEPA
            </Button>
            {gestiona && r.estado === 'generada' && (
              <Button icon={Send} onClick={() => accion.mutate({ url: `/tes/remesas/${id}/enviada` })}>
                Marcar enviada
              </Button>
            )}
            {gestiona && r.estado !== 'cobrada' && (
              <Button
                variant="primary"
                icon={CheckCircle2}
                onClick={async () => (await confirm({ title: 'Cerrar la remesa', message: r.tipo === 'cobro' ? 'Se dan por cobrados los recibos que sigan en ella. Las devoluciones se registran después en cada recibo.' : 'Se dan por pagadas las transferencias.', confirm: 'Cerrar' })) && accion.mutate({ url: `/tes/remesas/${id}/cerrar` })}
              >
                Cerrar remesa
              </Button>
            )}
          </div>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {r.vencimientos.map((v: any) => (
              <li key={v.id} className="flex items-center gap-2 px-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{v.tercero}</span>
                  <span className="text-[12px] text-muted">{v.documento ?? v.concepto}</span>
                </span>
                <EnumBadge options={VENC_ESTADOS} value={v.estado} />
                <span className="tabular-nums">{fmtMoney(v.importe)}</span>
                {gestiona && r.estado === 'generada' && v.remesaId === id && <IconButton icon={X} label="Quitar de la remesa" size="sm" onClick={() => quitar.mutate(v.id)} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
