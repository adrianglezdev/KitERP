import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Sparkles } from 'lucide-react';
import { fmtMoney, fmtNumber } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Button, Card, EmptyState, NumberInput, PageHeader, RefSelect, Spinner } from '@/components/ui';

interface Linea {
  articuloId: string;
  referencia: string;
  nombre: string;
  unidad: string;
  fisico: number;
  reservado: number;
  disponible: number;
  pendiente: number;
  enBorrador: number;
  stockMin: number | null;
  puntoPedido: number;
  sugerido: number;
  proveedorId: string | null;
  proveedor: string | null;
  precio: number;
  plazoDias: number | null;
}

/** Artículos que no llegan al punto de pedido contando lo disponible y lo ya pedido. Un clic crea los pedidos. */
export default function Propuesta() {
  const nav = useNavigate();
  const { data, isLoading } = useApi<{ activo: boolean; lineas: Linea[] }>('/cpr/propuesta');
  const [sel, setSel] = useState<Record<string, { on: boolean; cantidad: number; proveedorId: string | null }>>({});
  useEffect(() => {
    if (data) setSel(Object.fromEntries(data.lineas.map((l) => [l.articuloId, { on: !!l.proveedorId, cantidad: l.sugerido, proveedorId: l.proveedorId }])));
  }, [data]);
  const elegidas = useMemo(() => (data?.lineas ?? []).filter((l) => sel[l.articuloId]?.on), [data, sel]);
  const total = elegidas.reduce((a, l) => a + (sel[l.articuloId]?.cantidad ?? 0) * l.precio, 0);
  const generar = useMut(
    () => api.post<{ pedidos: { id: string; codigo: string }[] }>('/cpr/propuesta/generar', { lineas: elegidas.map((l) => ({ articuloId: l.articuloId, proveedorId: sel[l.articuloId]!.proveedorId, cantidad: sel[l.articuloId]!.cantidad })) }),
    {
      ok: (r) => `Creados ${r.pedidos.length} pedidos en borrador: ${r.pedidos.map((p) => p.codigo).join(', ')}`,
      invalidate: ['/cpr', '/documentos'],
      onSuccess: (r) => (r.pedidos.length === 1 ? nav(`/documentos/${r.pedidos[0]!.id}`) : nav('/compras/pedidos')),
    },
  );
  const set = (id: string, p: Partial<{ on: boolean; cantidad: number; proveedorId: string | null }>) => setSel((s) => ({ ...s, [id]: { ...s[id]!, ...p } }));

  return (
    <>
      <PageHeader
        title="Propuesta de compra"
        icon={Sparkles}
        subtitle="Artículos por debajo de su punto de pedido, teniendo en cuenta lo reservado y lo que ya está pedido."
        actions={
          <Button variant="primary" icon={ShoppingCart} disabled={!elegidas.length || elegidas.some((l) => !sel[l.articuloId]?.proveedorId)} loading={generar.isPending} onClick={() => generar.mutate(undefined)}>
            Crear pedidos ({elegidas.length}) · {fmtMoney(total)}
          </Button>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : !data?.activo ? (
        <Alert tone="gray">La propuesta necesita el módulo de Stock activo.</Alert>
      ) : !data.lineas.length ? (
        <Card>
          <EmptyState icon={Sparkles} title="No hace falta pedir nada">Todos los artículos con stock mínimo están cubiertos. Configura los mínimos en la pestaña Stock de cada artículo.</EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {data.lineas.map((l) => {
              const s = sel[l.articuloId];
              if (!s) return null;
              return (
                <li key={l.articuloId} className="grid gap-3 px-4 py-3 md:grid-cols-[auto_1fr_220px_130px] md:items-center">
                  <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={s.on} onChange={(e) => set(l.articuloId, { on: e.target.checked })} aria-label={`Incluir ${l.nombre}`} />
                  <div className="min-w-0">
                    <Link to={`/catalogo/${l.articuloId}`} className="font-medium hover:text-primary">
                      {l.nombre}
                    </Link>
                    <p className="text-[12.5px] text-muted">
                      <span className="font-mono">{l.referencia}</span> · disponible {fmtNumber(l.disponible, 3)} {l.unidad} · pedido {fmtNumber(l.pendiente, 3)} · punto de pedido {fmtNumber(l.puntoPedido, 3)}
                      {l.enBorrador > 0 && ` · ${fmtNumber(l.enBorrador, 3)} en pedidos sin confirmar`}
                    </p>
                  </div>
                  <RefSelect target="proveedores" value={s.proveedorId} onChange={(v) => set(l.articuloId, { proveedorId: v, on: true })} placeholder="Elige proveedor" label={l.proveedor ?? undefined} invalid={s.on && !s.proveedorId} />
                  <div>
                    <NumberInput value={s.cantidad} onChange={(v) => set(l.articuloId, { cantidad: v ?? 0 })} decimals={3} suffix={l.unidad} />
                    <p className="mt-0.5 text-right text-[11.5px] text-muted">{l.precio ? fmtMoney(l.precio * s.cantidad) : 'sin precio'}{l.plazoDias ? ` · ${l.plazoDias} días` : ''}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
