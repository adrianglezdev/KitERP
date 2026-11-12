import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, History } from 'lucide-react';
import { fmtDateTime, fmtMoney, stkShared } from '@kite/shared';
import { download, qs } from '@/lib/api';
import { useApi, useDebounced } from '@/lib/hooks';
import { Card, DataTable, EmptyState, EnumBadge, IconButton, Input, PageHeader, Pagination, RefSelect, SearchInput, Select, type Column } from '@/components/ui';
import { SignedQty, fmtQty } from '../ui';

export interface Movimiento {
  id: string;
  momento: string;
  tipo: string;
  articuloId: string;
  referencia: string;
  articulo: string;
  unidad: string;
  almacenId: string;
  almacen: string;
  lote: string;
  cantidad: number;
  costeUnitario: number | null;
  saldo: number | null;
  documentoId: string | null;
  documento: string | null;
  origenTipo: string | null;
  origenId: string | null;
  series: string[] | null;
  motivo: string | null;
  persona: string | null;
}

export function origenEnlace(m: Movimiento) {
  if (m.documentoId) return { to: `/documentos/${m.documentoId}`, label: m.documento ?? 'Documento' };
  if (m.origenTipo === 'pry_proyecto' && m.origenId) return { to: `/proyectos/${m.origenId}?tab=material`, label: 'Proyecto' };
  if (m.origenTipo === 'inventario' && m.origenId) return { to: `/stock/inventarios/${m.origenId}`, label: 'Recuento' };
  if (m.origenTipo === 'traspaso') return { to: '/stock/traspasos', label: m.motivo?.split(':')[0] ?? 'Traspaso' };
  return null;
}

export function movimientoColumns(opts: { articulo?: boolean; almacen?: boolean } = {}): Column<Movimiento>[] {
  return [
    { key: 'momento', header: 'Fecha', cell: (m) => <span className="whitespace-nowrap text-[13px]">{fmtDateTime(m.momento)}</span> },
    { key: 'tipo', header: 'Tipo', cell: (m) => <EnumBadge options={stkShared.MOVIMIENTO_TIPOS} value={m.tipo} dot={false} /> },
    ...(opts.articulo !== false
      ? [{ key: 'articulo', header: 'Artículo', cell: (m: Movimiento) => <Link to={`/catalogo/${m.articuloId}?tab=stk-stock`} className="block max-w-[280px] truncate hover:text-primary"><b className="font-medium">{m.referencia}</b> · {m.articulo}</Link> }]
      : []),
    ...(opts.almacen !== false ? [{ key: 'almacen', header: 'Almacén', hideBelow: 'md' as const, cell: (m: Movimiento) => m.almacen }] : []),
    { key: 'lote', header: 'Lote', hideBelow: 'xl', cell: (m) => m.lote || <span className="text-muted">—</span> },
    { key: 'cantidad', header: 'Cantidad', align: 'right', cell: (m) => <SignedQty value={m.cantidad} unidad={m.unidad} /> },
    { key: 'saldo', header: 'Saldo', align: 'right', hideBelow: 'lg', cell: (m) => <span className="tabular text-muted">{fmtQty(m.saldo)}</span> },
    { key: 'coste', header: 'Coste ud.', align: 'right', hideBelow: 'xl', cell: (m) => <span className="tabular text-muted">{m.costeUnitario !== null ? fmtMoney(m.costeUnitario) : '—'}</span> },
    {
      key: 'origen',
      header: 'Origen',
      hideBelow: 'lg',
      cell: (m) => {
        const o = origenEnlace(m);
        return (
          <span className="block max-w-[220px] truncate text-[13px]">
            {o ? (
              <Link to={o.to} className="text-primary hover:underline">
                {o.label}
              </Link>
            ) : (
              <span className="text-muted">{m.motivo ?? '—'}</span>
            )}
            {m.persona && <span className="text-muted"> · {m.persona}</span>}
          </span>
        );
      },
    },
  ];
}

export default function Movimientos() {
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [almacenId, setAlmacenId] = useState<string | null>(sp.get('almacenId'));
  const [articuloId, setArticuloId] = useState<string | null>(sp.get('articuloId'));
  const [tipo, setTipo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const params = { q: dq, almacenId, articuloId, tipo, desde, hasta, page, pageSize: 50 };
  const { data, isLoading } = useApi<{ items: Movimiento[]; total: number }>(`/stk/movimientos${qs(params)}`, { placeholderData: (p) => p });
  const reset = () => setPage(1);
  return (
    <div className="space-y-5">
      <PageHeader title="Movimientos de stock" icon={History} back="/stock" subtitle="Cada entrada y salida queda registrada y no se puede modificar" />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Artículo, lote o documento…" className="min-w-[200px] flex-1" />
          <div className="w-full sm:w-52">
            <RefSelect target="almacenes" value={almacenId} onChange={(v) => { setAlmacenId(v); reset(); }} placeholder="Todos los almacenes" />
          </div>
          <div className="w-full sm:w-56">
            <RefSelect target="articulos" value={articuloId} onChange={(v) => { setArticuloId(v); reset(); }} placeholder="Todos los artículos" />
          </div>
          <Select value={tipo} onChange={(e) => { setTipo(e.target.value); reset(); }} options={stkShared.MOVIMIENTO_TIPOS} placeholder="Todos los tipos" className="w-full sm:w-52" />
          <div className="flex items-center gap-1.5">
            <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); reset(); }} aria-label="Desde" className="w-[150px]" />
            <span className="text-muted">–</span>
            <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); reset(); }} aria-label="Hasta" className="w-[150px]" />
          </div>
          <IconButton icon={Download} label="Exportar a Excel" variant="secondary" onClick={() => download(`/stk/movimientos${qs({ ...params, format: 'xlsx', page: undefined })}`, 'movimientos.xlsx')} />
        </div>
        <DataTable
          columns={movimientoColumns()}
          rows={data?.items ?? []}
          loading={isLoading}
          dense
          mobileTitle={(m) => `${m.referencia} · ${m.articulo}`}
          mobileSubtitle={(m) => `${fmtDateTime(m.momento)} · ${m.almacen}${m.lote ? ` · lote ${m.lote}` : ''}`}
          mobileRight={(m) => (
            <div className="space-y-0.5 text-right">
              <SignedQty value={m.cantidad} unidad={m.unidad} />
              <div>
                <EnumBadge options={stkShared.MOVIMIENTO_TIPOS} value={m.tipo} dot={false} />
              </div>
            </div>
          )}
          empty={<EmptyState icon={History} title="Sin movimientos">No hay movimientos con estos filtros.</EmptyState>}
        />
        {data && <Pagination page={page} pageSize={50} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
