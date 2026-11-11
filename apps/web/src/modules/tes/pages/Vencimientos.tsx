import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Check, Combine, Plus } from 'lucide-react';
import { fmtDate, fmtMoney, tesShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useDebounced, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, DataTable, EnumBadge, PageHeader, Pagination, SearchInput, Segmented } from '@/components/ui';
import { ResourceFormDialog } from '@/components/resource';
import { RegistrarLoteDialog, VENC_ESTADOS, VencimientoSheet } from '../comun';

type Vista = 'abiertos' | 'vencidos' | 'impagados' | 'pagados' | 'todos';

/** Cartera de cobros (clientes) o de pagos (proveedores, nóminas, impuestos…). */
export default function Vencimientos({ circuito }: { circuito: 'cobro' | 'pago' }) {
  const { can } = useSession();
  const gestiona = can('tes.gestionar');
  const [sp] = useSearchParams();
  const [vista, setVista] = useState<Vista>((sp.get('vista') as Vista) || 'abiertos');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<string | null>(null);
  const [lote, setLote] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const filtro = { abiertos: '', vencidos: '&vencidos=1', impagados: '&estado=impagado,devuelto', pagados: '&estado=pagado', todos: '&abiertos=0' }[vista];
  const url = `/tes/vencimientos?circuito=${circuito}&page=${page}&pageSize=50${filtro}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`;
  const { data, isLoading } = useApi<any>(url);
  const items: any[] = data?.items ?? [];
  const elegidos = items.filter((v) => sel.has(v.id));
  const totalSel = elegidos.reduce((s, v) => s + v.pendiente, 0);
  const compensar = useMut(() => api.post('/tes/vencimientos/compensar', { ids: [...sel] }), { ok: 'Compensado', invalidate: ['/tes'], onSuccess: () => setSel(new Set()) });
  const esCobro = circuito === 'cobro';
  return (
    <>
      <PageHeader
        title={esCobro ? 'Cobros' : 'Pagos'}
        icon={esCobro ? ArrowDownLeft : ArrowUpRight}
        subtitle={esCobro ? 'Lo que nos deben los clientes, por fecha de vencimiento.' : 'Lo que debemos: proveedores, gastos, nóminas e impuestos.'}
        actions={
          gestiona && (
            <>
              {sel.size >= 2 && (
                <Button icon={Combine} loading={compensar.isPending} onClick={() => compensar.mutate(undefined)}>
                  Compensar
                </Button>
              )}
              {sel.size > 0 && (
                <Button variant="primary" icon={Check} onClick={() => setLote(true)}>
                  {esCobro ? 'Cobrar' : 'Pagar'} {sel.size} ({fmtMoney(totalSel)})
                </Button>
              )}
              <Button icon={Plus} onClick={() => setNuevo(true)}>
                Vencimiento manual
              </Button>
            </>
          )
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented
          value={vista}
          onChange={(v) => {
            setVista(v);
            setPage(1);
            setSel(new Set());
          }}
          options={[
            { value: 'abiertos', label: 'Pendientes' },
            { value: 'vencidos', label: 'Vencidos' },
            { value: 'impagados', label: 'Impagados' },
            { value: 'pagados', label: esCobro ? 'Cobrados' : 'Pagados' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Nombre, NIF, factura o concepto" className="sm:ml-auto sm:w-72" />
      </div>
      <Card className="overflow-hidden">
        <DataTable
          rows={items}
          loading={isLoading}
          selectable={gestiona}
          selected={sel}
          onSelect={(id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; })}
          onRowClick={(v: any) => setAbierto(v.id)}
          empty="No hay vencimientos."
          columns={[
            { key: 'fecha', header: 'Vence', width: '110px', cell: (v: any) => <span className={v.diasVencido ? 'font-medium text-bad' : ''}>{fmtDate(v.fecha)}</span> },
            { key: 'tercero', header: esCobro ? 'Cliente' : 'Proveedor', cell: (v: any) => <span className="font-medium">{v.tercero ?? '—'}</span> },
            { key: 'concepto', header: 'Concepto', cell: (v: any) => <span className="line-clamp-1 text-muted">{v.documento ?? v.concepto}</span>, hideBelow: 'md' },
            { key: 'estado', header: 'Estado', cell: (v: any) => (
                <span className="flex items-center gap-1.5">
                  <EnumBadge options={VENC_ESTADOS} value={v.estado} />
                  {v.diasVencido > 0 && <Badge tone="red">{v.diasVencido} d</Badge>}
                </span>
              ) },
            { key: 'importe', header: 'Importe', align: 'right', cell: (v: any) => fmtMoney(v.importe), hideBelow: 'lg' },
            { key: 'pendiente', header: 'Pendiente', align: 'right', cell: (v: any) => <b className="tabular-nums">{fmtMoney(v.pendiente)}</b> },
          ]}
          mobileTitle={(v: any) => v.tercero ?? v.concepto}
          mobileSubtitle={(v: any) => (
            <span className="flex items-center gap-1.5">
              {fmtDate(v.fecha)} <EnumBadge options={VENC_ESTADOS} value={v.estado} />
            </span>
          )}
          mobileRight={(v: any) => <b>{fmtMoney(v.pendiente)}</b>}
          footer={
            data?.total ? (
              <div className="flex justify-between px-4 py-2 text-[13px]">
                <span className="text-muted">{data.total} vencimientos</span>
                <span className="font-semibold">Pendiente {fmtMoney(data.sumaPendiente)}</span>
              </div>
            ) : null
          }
        />
      </Card>
      {data && <Pagination page={page} pageSize={50} total={data.total} onPage={setPage} />}
      {abierto && <VencimientoSheet id={abierto} onClose={() => setAbierto(null)} />}
      {lote && <RegistrarLoteDialog ids={[...sel]} circuito={circuito} total={totalSel} onClose={() => { setLote(false); setSel(new Set()); }} />}
      <ResourceFormDialog open={nuevo} onOpenChange={setNuevo} def={tesShared.vencimientoManualResource} endpoint="/tes/vencimientos" initial={{ circuito }} title="Nuevo vencimiento" />
    </>
  );
}
