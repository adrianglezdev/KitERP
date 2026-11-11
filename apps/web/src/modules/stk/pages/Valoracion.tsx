import { useState } from 'react';
import { Download, Euro } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { download, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Chart } from '@/components/charts/Widget';
import { Button, Card, CardHeader, DataTable, EmptyState, PageHeader, RefSelect, SearchInput, Stat, type Column } from '@/components/ui';
import { fmtQty } from '../ui';

interface Fila {
  articuloId: string;
  referencia: string;
  nombre: string;
  unidad: string;
  familia: string | null;
  almacen: string;
  almacenId: string;
  cantidad: number;
  costeMedio: number;
  valor: number;
}

/** Valoración del stock a precio medio ponderado (PMP), por artículo y almacén. */
export default function Valoracion() {
  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const { data, isLoading } = useApi<{ items: Fila[]; total: number; porAlmacen: { almacen: string; valor: number }[] }>(`/stk/valoracion${qs({ almacenId })}`);
  const t = q.trim().toLowerCase();
  const filas = (data?.items ?? []).filter((r) => !t || `${r.referencia} ${r.nombre} ${r.familia ?? ''}`.toLowerCase().includes(t)).map((r) => ({ ...r, id: `${r.articuloId}-${r.almacenId}` }));
  const columns: Column<Fila & { id: string }>[] = [
    { key: 'referencia', header: 'Referencia', cell: (r) => <span className="font-medium">{r.referencia}</span> },
    { key: 'nombre', header: 'Artículo', cell: (r) => <span className="block max-w-[320px] truncate">{r.nombre}</span> },
    { key: 'familia', header: 'Familia', hideBelow: 'xl', cell: (r) => r.familia ?? '—' },
    { key: 'almacen', header: 'Almacén', hideBelow: 'md', cell: (r) => r.almacen },
    { key: 'cantidad', header: 'Cantidad', align: 'right', cell: (r) => fmtQty(r.cantidad, r.unidad) },
    { key: 'pmp', header: 'PMP', align: 'right', hideBelow: 'lg', cell: (r) => fmtMoney(r.costeMedio) },
    { key: 'valor', header: 'Valor', align: 'right', cell: (r) => <b className="font-semibold">{fmtMoney(r.valor)}</b> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Valoración del stock"
        icon={Euro}
        back="/stock"
        subtitle="A precio medio ponderado: cada entrada recalcula el coste medio"
        actions={
          <Button icon={Download} onClick={() => download(`/stk/valoracion${qs({ almacenId, format: 'xlsx' })}`, 'valoracion-stock.xlsx')}>
            Exportar a Excel
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Stat label="Valor total" value={fmtMoney(data?.total ?? 0)} icon={Euro} tone="green" />
          {(data?.porAlmacen.length ?? 0) > 1 && (
            <Card>
              <CardHeader title="Por almacén" />
              <div className="p-3">
                <Chart chart="pie" data={data!.porAlmacen} xKey="almacen" series={[{ key: 'valor', label: 'Valor' }]} format="money" height={200} />
                <ul className="mt-2 space-y-1 text-[13px]">
                  {data!.porAlmacen.map((a) => (
                    <li key={a.almacen} className="flex justify-between gap-2">
                      <span className="truncate">{a.almacen}</span>
                      <span className="tabular font-medium">{fmtMoney(a.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </div>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-line p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Filtrar…" className="min-w-[200px] flex-1" />
            <div className="w-full sm:w-56">
              <RefSelect target="almacenes" value={almacenId} onChange={setAlmacenId} placeholder="Todos los almacenes" />
            </div>
          </div>
          <DataTable
            columns={columns}
            rows={filas}
            loading={isLoading}
            dense
            mobileTitle={(r) => r.nombre}
            mobileSubtitle={(r) => `${r.referencia} · ${r.almacen} · ${fmtQty(r.cantidad, r.unidad)} × ${fmtMoney(r.costeMedio)}`}
            mobileRight={(r) => <b className="tabular">{fmtMoney(r.valor)}</b>}
            empty={<EmptyState icon={Euro} title="No hay stock que valorar" />}
          />
        </Card>
      </div>
    </div>
  );
}
