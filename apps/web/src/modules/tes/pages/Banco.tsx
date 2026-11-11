import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, EyeOff, Plus, Sparkles, Undo2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtMoney } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, Dialog, EmptyState, EnumBadge, Field, IconButton, Input, PageHeader, Pagination, Segmented, Select, Spinner } from '@/components/ui';
import { FileDrop, NumberInput } from '@/components/form/inputs';
import { MOV_ESTADOS, hoy, useCuentas } from '../comun';

/** Extracto bancario y conciliación: cada movimiento del banco se casa con su cobro, pago o remesa. */
export default function Banco() {
  const { can } = useSession();
  const gestiona = can('tes.gestionar');
  const cuentas = useCuentas();
  const [sp, setSp] = useSearchParams();
  const cuentaId = sp.get('cuenta') ?? '';
  const [estado, setEstado] = useState('pendiente');
  const [page, setPage] = useState(1);
  const [manual, setManual] = useState(false);
  const { data, isLoading } = useApi<any>(`/tes/movimientos?page=${page}&pageSize=25${cuentaId ? `&cuentaId=${cuentaId}` : ''}${estado ? `&estado=${estado}` : ''}`);
  const inv = ['/tes', '/documentos'];
  const importar = useMut((archivoId: string) => api.post<any>('/tes/movimientos/importar', { cuentaId, archivoId }), {
    ok: (r) => `${r.formato}: ${r.nuevos} movimientos nuevos${r.duplicados ? `, ${r.duplicados} ya estaban` : ''}`,
    invalidate: inv,
    onSuccess: (r) => r.avisos?.forEach((a: string) => toast.warning(a)),
  });
  const auto = useMut(() => api.post<any>('/tes/movimientos/autoconciliar', { cuentaId: cuentaId || null }), { ok: (r) => `${r.conciliados} de ${r.revisados} conciliados automáticamente`, invalidate: inv });
  const accion = useMut(({ url, body }: { url: string; body?: unknown }) => api.post(url, body ?? {}), { invalidate: inv });
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  return (
    <>
      <PageHeader
        title="Banco y conciliación"
        icon={Wand2}
        subtitle="Importa el extracto (Norma 43 o CSV) y confirma las sugerencias. Lo conciliado cuadra con la contabilidad."
        actions={
          gestiona && (
            <>
              <Button icon={Sparkles} loading={auto.isPending} onClick={() => auto.mutate(undefined)}>
                Conciliar lo evidente
              </Button>
              {cuenta && (
                <Button icon={Plus} onClick={() => setManual(true)}>
                  Movimiento
                </Button>
              )}
            </>
          )
        }
      />
      <div className="mb-4 grid gap-3 lg:grid-cols-[280px_1fr]">
        <Field label="Cuenta">
          <Select value={cuentaId} onChange={(e) => { setSp(e.target.value ? { cuenta: e.target.value } : {}); setPage(1); }} options={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} placeholder="Todas las cuentas" />
        </Field>
        {gestiona && (cuenta ? <FileDrop multiple={false} compact accept=".n43,.txt,.aeb,.csv,text/plain,text/csv" label={`Importar extracto de ${cuenta.nombre}`} onUploaded={(f) => f[0] && importar.mutate(f[0].id)} /> : <Alert tone="blue" className="self-end">Elige una cuenta para importar su extracto.</Alert>)}
      </div>
      {cuenta && cuenta.saldoExtracto !== null && (
        <p className="mb-3 text-[13px] text-muted">
          Saldo según el banco <b className="text-fg">{fmtMoney(cuenta.saldoExtracto)}</b> · según KiteERP <b className="text-fg">{fmtMoney(cuenta.saldo)}</b>
          {Math.abs(cuenta.saldoExtracto - cuenta.saldo) > 0.01 && <span className="text-warn"> · diferencia {fmtMoney(cuenta.saldoExtracto - cuenta.saldo)}</span>}
        </p>
      )}
      <Segmented className="mb-3" value={estado} onChange={(v) => { setEstado(v); setPage(1); }} options={[{ value: 'pendiente', label: 'Sin conciliar' }, { value: 'conciliado', label: 'Conciliados' }, { value: 'ignorado', label: 'Sin pareja' }, { value: '', label: 'Todos' }]} />
      {isLoading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={Check} title={estado === 'pendiente' ? 'Todo conciliado' : 'Sin movimientos'} />
        </Card>
      ) : (
        <div className="space-y-2">
          {data.items.map((m: any) => (
            <Card key={m.id} className="p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{m.concepto}</p>
                  <p className="text-[12px] text-muted">
                    {fmtDate(m.fecha)} · {m.cuenta}
                    {m.referencia && ` · ref. ${m.referencia}`}
                  </p>
                </div>
                <span className={cn('font-display text-[16px] font-bold tabular-nums', m.importe < 0 ? 'text-bad' : 'text-primary')}>{fmtMoney(m.importe)}</span>
                <EnumBadge options={MOV_ESTADOS} value={m.estado} />
                {gestiona && m.estado === 'pendiente' && <IconButton icon={EyeOff} label="Sin pareja (comisión, etc.)" size="sm" onClick={() => accion.mutate({ url: `/tes/movimientos/${m.id}/ignorar` })} />}
                {gestiona && m.estado !== 'pendiente' && <IconButton icon={Undo2} label="Deshacer" size="sm" onClick={() => accion.mutate({ url: `/tes/movimientos/${m.id}/deshacer` })} />}
              </div>
              {m.conciliadoCon?.length > 0 && (
                <p className="mt-1 text-[12.5px] text-muted">
                  Con: {m.conciliadoCon.map((c: any) => `${c.tercero ?? ''} ${c.concepto ?? ''} (${fmtMoney(c.importe)})`).join(' · ')}
                </p>
              )}
              {gestiona && m.sugerencias?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {m.sugerencias.slice(0, 3).map((s: any) => (
                    <li key={`${s.tipo}-${s.id}`} className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-1.5 text-[12.5px]">
                      <Badge tone={s.puntuacion >= 75 ? 'green' : 'gray'}>{s.puntuacion}%</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.titulo}</span>
                        <span className="text-muted">{s.detalle}</span>
                      </span>
                      <span className="tabular-nums">{fmtMoney(s.importe)}</span>
                      <Button size="sm" variant="primary" icon={Check} loading={accion.isPending} onClick={() => accion.mutate({ url: `/tes/movimientos/${m.id}/conciliar`, body: { tipo: s.tipo, id: s.id } })}>
                        Casar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />
        </div>
      )}
      {manual && cuenta && <MovimientoManual cuenta={cuenta} onClose={() => setManual(false)} />}
    </>
  );
}

function MovimientoManual({ cuenta, onClose }: { cuenta: any; onClose: () => void }) {
  const [f, setF] = useState({ fecha: hoy(), importe: null as number | null, concepto: '' });
  const m = useMut(() => api.post('/tes/movimientos', { cuentaId: cuenta.id, ...f }), { ok: 'Movimiento añadido', invalidate: ['/tes'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Movimiento en ${cuenta.nombre}`} footer={<Button variant="primary" loading={m.isPending} onClick={() => m.mutate(undefined)}>Añadir</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha">
          <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </Field>
        <Field label="Importe" help="Negativo si es una salida">
          <NumberInput value={f.importe} onChange={(n) => setF({ ...f, importe: n })} suffix="€" />
        </Field>
        <Field label="Concepto" className="sm:col-span-2">
          <Input value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}
