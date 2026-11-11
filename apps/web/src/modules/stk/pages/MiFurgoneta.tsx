import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ClipboardCheck, Truck, Undo2 } from 'lucide-react';
import { fmtDateTime, stkShared } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, CardHeader, EmptyState, EnumBadge, PageHeader, SearchInput, Spinner } from '@/components/ui';
import { SignedQty, fmtQty } from '../ui';
import { TraspasoDialog } from './Traspasos';
import { NuevoInventario } from './Inventarios';

interface Almacen {
  id: string;
  nombre: string;
  tipo: string;
  stock: { articuloId: string; referencia: string; nombre: string; unidad: string; ean: string | null; lote: string; cantidad: number; stockMin: number | null }[];
  movimientos: any[];
}

/** Stock de la furgoneta del técnico, pensado para el móvil. */
export default function MiFurgoneta() {
  const nav = useNavigate();
  const { data, isLoading } = useApi<{ almacenes: Almacen[] }>('/stk/mi-furgoneta');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [traspaso, setTraspaso] = useState<'devolver' | null>(null);
  const [recuento, setRecuento] = useState(false);
  const a = data?.almacenes[sel];
  const stock = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (a?.stock ?? []).filter((s) => !t || `${s.referencia} ${s.nombre} ${s.ean ?? ''}`.toLowerCase().includes(t));
  }, [a, q]);
  if (isLoading) return <Spinner />;
  if (!data?.almacenes.length)
    return (
      <>
        <PageHeader title="Mi furgoneta" icon={Truck} />
        <Card>
          <EmptyState icon={Truck} title="No tienes ninguna furgoneta asignada">Pide al responsable de almacén que te asigne como responsable de una furgoneta en Stock → Almacenes.</EmptyState>
        </Card>
      </>
    );
  return (
    <div className="space-y-4">
      <PageHeader
        title={a?.nombre ?? 'Mi furgoneta'}
        icon={Truck}
        subtitle={`${a?.stock.length ?? 0} artículos con stock`}
        actions={
          <>
            <Button icon={Undo2} onClick={() => setTraspaso('devolver')}>
              Devolver o pasar material
            </Button>
            <Button icon={ClipboardCheck} onClick={() => setRecuento(true)}>
              Contar mi furgoneta
            </Button>
          </>
        }
      />
      {data.almacenes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {data.almacenes.map((x, i) => (
            <Button key={x.id} variant={i === sel ? 'primary' : 'secondary'} size="sm" onClick={() => setSel(i)}>
              {x.nombre}
            </Button>
          ))}
        </div>
      )}
      <SearchInput value={q} onChange={setQ} placeholder="Buscar en la furgoneta…" />
      <Card className="overflow-hidden">
        {!stock.length ? (
          <EmptyState icon={Truck} title={q ? 'No hay coincidencias' : 'La furgoneta está vacía'} />
        ) : (
          <ul className="divide-y divide-line">
            {stock.map((s) => {
              const bajo = s.stockMin !== null && s.cantidad <= 0;
              return (
                <li key={`${s.articuloId}-${s.lote}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium">{s.nombre}</p>
                    <p className="truncate text-[12.5px] text-muted">
                      {s.referencia}
                      {s.lote && ` · lote ${s.lote}`}
                    </p>
                  </div>
                  <span className={cn('tabular text-[17px] font-bold', (s.cantidad < 0 || bajo) && 'text-bad')}>{fmtQty(s.cantidad, s.unidad)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Últimos movimientos" icon={ArrowLeftRight} actions={<Button size="sm" variant="ghost" onClick={() => nav(`/stock/movimientos?almacenId=${a?.id}`)}>Ver todos</Button>} />
        {!a?.movimientos.length ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">Sin movimientos</p>
        ) : (
          <ul className="divide-y divide-line">
            {a.movimientos.map((m: any) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px]">
                    <b className="font-medium">{m.referencia}</b> · {m.articulo}
                  </p>
                  <p className="flex items-center gap-1.5 text-[12px] text-muted">
                    {fmtDateTime(m.momento)} <EnumBadge options={stkShared.MOVIMIENTO_TIPOS} value={m.tipo} dot={false} />
                  </p>
                </div>
                <SignedQty value={m.cantidad} unidad={m.unidad} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {traspaso && a && <TraspasoDialog origen={a.id} onClose={() => setTraspaso(null)} />}
      {recuento && a && <NuevoInventario almacenId={a.id} onClose={() => setRecuento(false)} onCreated={(id) => nav(`/stock/inventarios/${id}`)} />}
    </div>
  );
}
