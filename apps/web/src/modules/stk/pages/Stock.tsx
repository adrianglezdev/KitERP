import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Boxes, Download, History, PackageSearch, SlidersHorizontal, Euro, AlertTriangle, TrendingDown, Plus, Trash2 } from 'lucide-react';
import { fmtMoney, type Paginated, type stkShared } from '@kite/shared';
import { api, download, qs } from '@/lib/api';
import { useApi, useDebounced, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, ButtonLink, Card, DataTable, Dialog, EmptyState, Field, IconButton, Input, NumberInput, PageHeader, Pagination, RefSelect, SearchInput, Segmented, Stat, type Column } from '@/components/ui';
import { cn } from '@/lib/utils';
import { QtyCell, fmtQty } from '../ui';

type Fila = stkShared.StockFila;

export default function Stock() {
  const nav = useNavigate();
  const { can } = useSession();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'referencia', dir: 'asc' });
  const [ajuste, setAjuste] = useState(false);
  const estado = sp.get('estado') ?? (sp.get('negativo') ? 'negativo' : '');
  const almacenId = sp.get('almacenId');
  const familiaId = sp.get('familiaId');
  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    n.delete('negativo');
    setSp(n, { replace: true });
    setPage(1);
  };
  const params = { q: dq, almacenId, familiaId, estado, page, pageSize: 50, sort: sort.field, dir: sort.dir };
  const { data, isLoading } = useApi<Paginated<Fila> & { resumen: { valor: number; bajoMinimo: number; negativos: number } }>(`/stk/stock${qs(params)}`, { placeholderData: (p) => p });

  const columns: Column<Fila>[] = [
    { key: 'referencia', header: 'Referencia', sortable: true, cell: (r) => <span className="font-medium">{r.referencia}</span> },
    { key: 'nombre', header: 'Artículo', sortable: true, cell: (r) => <span className="block max-w-[340px] truncate">{r.nombre}</span> },
    { key: 'fisico', header: 'Físico', align: 'right', sortable: true, cell: (r) => <QtyCell value={r.fisico} unidad={r.unidad} /> },
    { key: 'reservado', header: 'Reservado', align: 'right', hideBelow: 'lg', cell: (r) => (r.reservado ? <span className="tabular text-warn">{fmtQty(r.reservado)}</span> : <span className="text-muted">—</span>) },
    { key: 'disponible', header: 'Disponible', align: 'right', sortable: true, cell: (r) => <span className={cn('tabular font-semibold', r.disponible < 0 && 'text-bad')}>{fmtQty(r.disponible, r.unidad)}</span> },
    { key: 'minimo', header: 'Mínimo', align: 'right', hideBelow: 'md', cell: (r) => (r.stockMin ? <span className={cn('tabular', r.bajoMinimo && 'font-semibold text-bad')}>{fmtQty(r.stockMin)}</span> : <span className="text-muted">—</span>) },
    { key: 'valor', header: 'Valor (PMP)', align: 'right', sortable: true, hideBelow: 'lg', cell: (r) => <span className="tabular">{fmtMoney(r.valor)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock"
        icon={Boxes}
        subtitle="Existencias por artículo en todos los almacenes y furgonetas"
        actions={
          <>
            <ButtonLink to="/stock/movimientos" icon={History}>
              Movimientos
            </ButtonLink>
            <ButtonLink to="/stock/trazabilidad" icon={PackageSearch} className="hidden sm:inline-flex">
              Trazabilidad
            </ButtonLink>
            {can('stk.mover') && (
              <ButtonLink to="/stock/traspasos?nuevo=1" icon={ArrowLeftRight}>
                Traspaso
              </ButtonLink>
            )}
            {can('stk.mover') && (
              <Button variant="primary" icon={SlidersHorizontal} onClick={() => setAjuste(true)}>
                Ajustar stock
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Valor del stock" value={fmtMoney(data?.resumen.valor ?? 0)} hint={<Link to="/stock/valoracion" className="text-primary">Ver valoración</Link>} icon={Euro} tone="green" />
        <button type="button" className="text-left" onClick={() => setParam('estado', estado === 'bajo_minimo' ? null : 'bajo_minimo')}>
          <Stat label="Bajo el stock mínimo" value={data?.resumen.bajoMinimo ?? 0} hint="artículos" icon={TrendingDown} tone={data?.resumen.bajoMinimo ? 'orange' : 'gray'} />
        </button>
        <button type="button" className="text-left" onClick={() => setParam('estado', estado === 'negativo' ? null : 'negativo')}>
          <Stat label="Con stock negativo" value={data?.resumen.negativos ?? 0} hint="revisa entradas pendientes" icon={AlertTriangle} tone={data?.resumen.negativos ? 'red' : 'gray'} />
        </button>
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Referencia, nombre, código de barras…" className="min-w-[220px] flex-1" />
            <div className="w-full sm:w-56">
              <RefSelect target="almacenes" value={almacenId} onChange={(v) => setParam('almacenId', v)} placeholder="Todos los almacenes" />
            </div>
            <div className="w-full sm:w-48">
              <RefSelect target="familias" value={familiaId} onChange={(v) => setParam('familiaId', v)} placeholder="Todas las familias" />
            </div>
            <IconButton icon={Download} label="Exportar a Excel" variant="secondary" onClick={() => download(`/stk/stock${qs({ ...params, format: 'xlsx', page: undefined })}`, 'stock.xlsx')} />
          </div>
          <Segmented
            value={estado}
            onChange={(v) => setParam('estado', v || null)}
            options={[
              { value: '', label: 'Todos' },
              { value: 'con_stock', label: 'Con stock' },
              { value: 'bajo_minimo', label: 'Bajo mínimo' },
              { value: 'reservado', label: 'Con reservas' },
              { value: 'negativo', label: 'Negativo' },
            ]}
          />
        </div>
        <DataTable
          columns={columns}
          rows={(data?.items ?? []).map((r) => ({ ...r, id: r.articuloId }))}
          loading={isLoading}
          sort={sort}
          onSort={(f) => setSort((s) => ({ field: f, dir: s.field === f && s.dir === 'asc' ? 'desc' : 'asc' }))}
          onRowClick={(r) => nav(`/catalogo/${r.articuloId}?tab=stk-stock`)}
          mobileTitle={(r) => r.nombre}
          mobileSubtitle={(r) => `${r.referencia}${r.reservado ? ` · ${fmtQty(r.reservado)} reservado` : ''}`}
          mobileRight={(r) => (
            <div className="text-right">
              <p className={cn('tabular text-[15px] font-semibold', r.disponible < 0 && 'text-bad')}>{fmtQty(r.disponible, r.unidad)}</p>
              {r.bajoMinimo && <p className="text-[11.5px] font-medium text-bad">bajo mínimo</p>}
            </div>
          )}
          empty={<EmptyState icon={Boxes} title="No hay artículos con ese filtro">Los artículos que controlan stock aparecen aquí.</EmptyState>}
        />
        {data && <Pagination page={page} pageSize={50} total={data.total} onPage={setPage} />}
      </Card>
      {ajuste && <AjusteDialog almacenId={almacenId} onClose={() => setAjuste(false)} />}
    </div>
  );
}

interface LineaAjuste {
  key: number;
  articuloId: string | null;
  nuevaCantidad: number | null;
  lote: string;
}

/** Ajuste de stock: se indica la cantidad real y se registra la diferencia con su motivo. */
export function AjusteDialog({ almacenId: inicial, articuloId, onClose }: { almacenId?: string | null; articuloId?: string; onClose: () => void }) {
  const [almacenId, setAlmacenId] = useState<string | null>(inicial ?? null);
  const [motivo, setMotivo] = useState('');
  const [lineas, setLineas] = useState<LineaAjuste[]>([{ key: 1, articuloId: articuloId ?? null, nuevaCantidad: null, lote: '' }]);
  const ids = lineas.map((l) => l.articuloId).filter(Boolean).join(',');
  const disp = useApi<Record<string, { fisico: number }>>(almacenId && ids ? `/stk/disponible?articuloIds=${ids}&almacenId=${almacenId}` : null);
  const guardar = useMut(
    () =>
      api.post('/stk/ajustes', {
        almacenId,
        motivo,
        lineas: lineas.filter((l) => l.articuloId && l.nuevaCantidad !== null).map((l) => ({ articuloId: l.articuloId, nuevaCantidad: l.nuevaCantidad, lote: l.lote || undefined })),
      }),
    { ok: (r: any) => `Stock ajustado (${r.movimientos} movimiento${r.movimientos === 1 ? '' : 's'})`, invalidate: ['/stk'], onSuccess: onClose },
  );
  const set = (key: number, p: Partial<LineaAjuste>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Ajustar stock"
      description="Indica la cantidad que hay de verdad: se registra la diferencia."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={guardar.isPending} disabled={!almacenId || motivo.trim().length < 3 || !lineas.some((l) => l.articuloId && l.nuevaCantidad !== null)} onClick={() => guardar.mutate(undefined)}>
            Registrar ajuste
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Almacén" required>
            <RefSelect target="almacenes" value={almacenId} onChange={setAlmacenId} />
          </Field>
          <Field label="Motivo" required>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Rotura, error de recuento, muestra…" />
          </Field>
        </div>
        <div className="space-y-2">
          {lineas.map((l) => (
            <div key={l.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_120px_130px_auto] sm:items-end">
              <Field label="Artículo" className="col-span-2 sm:col-span-1">
                <RefSelect target="articulos" value={l.articuloId} onChange={(v) => set(l.key, { articuloId: v })} />
              </Field>
              <Field label="Lote">
                <Input value={l.lote} onChange={(e) => set(l.key, { lote: e.target.value })} placeholder="Opcional" />
              </Field>
              <Field label="Cantidad real" help={l.articuloId && disp.data?.[l.articuloId] ? `Ahora: ${fmtQty(disp.data[l.articuloId]!.fisico)}` : undefined}>
                <NumberInput value={l.nuevaCantidad} onChange={(v) => set(l.key, { nuevaCantidad: v })} decimals={3} min={0} />
              </Field>
              <IconButton icon={Trash2} label="Quitar" onClick={() => setLineas(lineas.filter((x) => x.key !== l.key))} disabled={lineas.length === 1} className="self-end" />
            </div>
          ))}
          <Button icon={Plus} variant="ghost" onClick={() => setLineas([...lineas, { key: Date.now(), articuloId: null, nuevaCantidad: null, lote: '' }])}>
            Añadir artículo
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
