import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, type LucideIcon } from 'lucide-react';
import { DOC_ESTADOS, ESTADO_PAGO, fmtDate, fmtMoney, type DocTipo } from '@kite/shared';
import { qs } from '@/lib/api';
import { useApi, useDebounced } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, DataTable, EnumBadge, Input, PageHeader, Pagination, RefSelect, SearchInput, Segmented, type Column } from '@/components/ui';
import { esCompra, permisoEditarDoc, tipoLabel } from './config';

interface Row {
  id: string;
  tipo: string;
  codigo: string | null;
  estado: string;
  estadoPago: string | null;
  fecha: string;
  fechaValidez: string | null;
  fechaEntrega: string | null;
  titulo: string | null;
  referenciaExterna: string | null;
  baseImponible: number;
  total: number;
  margen: number | null;
  version: number;
  tercero: string;
  comercial: string | null;
}

/**
 * Listado de documentos comerciales de uno o varios tipos.
 * Lo usan Presupuestos, Pedidos, Albaranes, Facturas y Compras.
 */
export function DocumentList({
  tipos,
  title,
  icon,
  subtitle,
  createTipo,
  createLabel,
  fixed,
  embedded,
  extraActions,
  showPago,
  estadoTabs = true,
}: {
  tipos: DocTipo[];
  title?: string;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  createTipo?: DocTipo;
  createLabel?: string;
  fixed?: Record<string, string>;
  embedded?: boolean;
  extraActions?: ReactNode;
  showPago?: boolean;
  estadoTabs?: boolean;
}) {
  const nav = useNavigate();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [estado, setEstado] = useState('');
  const [tercero, setTercero] = useState<string | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'fecha', dir: 'desc' });
  const compra = esCompra(tipos[0]!);

  const url = `/documentos${qs({
    tipo: tipos.join(','),
    estado,
    q: dq,
    terceroId: tercero ?? fixed?.terceroId,
    desde,
    hasta,
    page,
    pageSize: 25,
    sort: sort.field,
    dir: sort.dir,
    soloUltimaVersion: tipos.includes('presupuesto') ? 1 : undefined,
    ...Object.fromEntries(Object.entries(fixed ?? {}).filter(([k]) => k !== 'terceroId')),
  })}`;
  const { data, isLoading } = useApi<{ items: Row[]; total: number; sumaTotal: number; sumaBase: number }>(url, { placeholderData: (p) => p });

  const estados = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    for (const t of tipos) for (const e of DOC_ESTADOS[t]) if (!map.has(e.value)) map.set(e.value, { value: e.value, label: e.label });
    return [...map.values()];
  }, [tipos]);

  const columns: Column<Row>[] = [
    {
      key: 'codigo',
      header: 'Número',
      sortable: true,
      cell: (r) => (
        <span className="font-medium">
          {r.codigo ?? <span className="text-muted">Borrador</span>}
          {tipos.length > 1 && <span className="ml-1.5 text-[11.5px] font-normal text-muted">{tipoLabel(r.tipo)}</span>}
        </span>
      ),
    },
    { key: 'fecha', header: 'Fecha', sortable: true, cell: (r) => fmtDate(r.fecha) },
    { key: 'tercero', header: compra ? 'Proveedor' : 'Cliente', sortable: true, cell: (r) => <span className="block max-w-[260px] truncate">{r.tercero}</span> },
    { key: 'titulo', header: 'Concepto', hideBelow: 'lg', cell: (r) => <span className="block max-w-[240px] truncate text-muted">{r.titulo ?? r.referenciaExterna ?? '—'}</span> },
    { key: 'comercial', header: compra ? 'Responsable' : 'Comercial', hideBelow: 'xl', cell: (r) => r.comercial ?? '—' },
    { key: 'estado', header: 'Estado', sortable: true, cell: (r) => <EnumBadge options={DOC_ESTADOS[r.tipo as DocTipo]} value={r.estado} /> },
    ...(showPago ? [{ key: 'pago', header: compra ? 'Pago' : 'Cobro', cell: (r: Row) => (r.estadoPago ? <EnumBadge options={ESTADO_PAGO} value={r.estadoPago} /> : '—') }] : []),
    { key: 'total', header: 'Total', align: 'right', sortable: true, cell: (r) => <span className="font-medium">{fmtMoney(r.total)}</span> },
  ];

  const canCreate = createTipo && can(permisoEditarDoc(createTipo));
  const body = (
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Número, cliente, concepto…" className="min-w-[200px] flex-1" />
          {!fixed?.terceroId && (
            <div className="w-full sm:w-60">
              <RefSelect target={compra ? 'proveedores' : 'terceros'} value={tercero} onChange={(v) => { setTercero(v); setPage(1); }} placeholder={compra ? 'Todos los proveedores' : 'Todos los clientes'} />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} aria-label="Desde" className="w-[150px]" />
            <span className="text-muted">–</span>
            <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} aria-label="Hasta" className="w-[150px]" />
          </div>
        </div>
        {estadoTabs && (
          <Segmented
            value={estado}
            onChange={(v) => { setEstado(v); setPage(1); }}
            options={[{ value: '', label: 'Todos' }, ...estados]}
          />
        )}
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        sort={sort}
        onSort={(f) => setSort((s) => ({ field: f, dir: s.field === f && s.dir === 'desc' ? 'asc' : 'desc' }))}
        onRowClick={(r) => nav(`/documentos/${r.id}`)}
        rowHref={(r) => `/documentos/${r.id}`}
        mobileTitle={(r) => r.tercero}
        mobileSubtitle={(r) => `${r.codigo ?? 'Borrador'} · ${fmtDate(r.fecha)}${r.titulo ? ` · ${r.titulo}` : ''}`}
        mobileRight={(r) => (
          <div className="space-y-1">
            <p className="tabular text-[14px] font-semibold">{fmtMoney(r.total)}</p>
            <EnumBadge options={DOC_ESTADOS[r.tipo as DocTipo]} value={r.estado} dot={false} />
          </div>
        )}
      />
      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-sunken/40 px-4 py-2 text-[12.5px] text-muted">
          <span>
            Base imponible <b className="tabular text-fg">{fmtMoney(data.sumaBase)}</b> · Total <b className="tabular text-fg">{fmtMoney(data.sumaTotal)}</b>
          </span>
        </div>
      )}
      {data && <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />}
    </Card>
  );

  if (embedded) return body;
  return (
    <>
      <PageHeader
        title={title ?? tipoLabel(tipos[0]!)}
        subtitle={subtitle}
        icon={icon}
        actions={
          <>
            {extraActions}
            {canCreate && (
              <Button variant="primary" icon={Plus} onClick={() => nav(`/documentos/nuevo?tipo=${createTipo}${fixed?.terceroId ? `&terceroId=${fixed.terceroId}` : ''}`)}>
                {createLabel ?? `Nuevo ${tipoLabel(createTipo!).toLowerCase()}`}
              </Button>
            )}
          </>
        }
      />
      {body}
    </>
  );
}
