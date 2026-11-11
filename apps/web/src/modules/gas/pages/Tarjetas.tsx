import { useState } from 'react';
import { AlertTriangle, CreditCard, Link2 } from 'lucide-react';
import { fmtDate, fmtMoney, gasShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Badge, Card, CardHeader, DataTable, PageHeader, Sheet, Spinner } from '@/components/ui';
import { FileDrop } from '@/components/form/inputs';
import { ResourceList } from '@/components/resource';

/** Tarjetas de empresa: alta, extracto mensual y cruce con los tickets del titular. */
export default function Tarjetas() {
  const [abierta, setAbierta] = useState<any | null>(null);
  return (
    <>
      <PageHeader title="Tarjetas de empresa" icon={CreditCard} subtitle="Importa el extracto de cada tarjeta: se casa solo con los tickets y avisa de los cargos sin justificar." />
      <ResourceList def={gasShared.tarjetaResource} endpoint="/gas/tarjetas" createPerm="gas.liquidar" />
      <p className="mt-3 text-[12.5px] text-muted">Pulsa en una tarjeta para editarla. Para ver sus cargos, usa el botón de extracto:</p>
      <ListaExtractos onOpen={setAbierta} />
      {abierta && <Extracto tarjeta={abierta} onClose={() => setAbierta(null)} />}
    </>
  );
}

function ListaExtractos({ onOpen }: { onOpen: (t: any) => void }) {
  const { data } = useApi<{ items: any[] }>('/gas/tarjetas?pageSize=100');
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {data?.items.map((t) => (
        <button key={t.id} type="button" onClick={() => onOpen(t)} className="inline-flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-[13px] font-medium ring-1 ring-line hover:ring-primary">
          <CreditCard className="h-4 w-4 text-primary" /> {t.nombre} ·· {t.ultimos4}
        </button>
      ))}
    </div>
  );
}

function Extracto({ tarjeta, onClose }: { tarjeta: any; onClose: () => void }) {
  const { data, isLoading } = useApi<any[]>(`/gas/tarjetas/${tarjeta.id}/movimientos`);
  const importar = useMut((archivoId: string) => api.post(`/gas/tarjetas/${tarjeta.id}/movimientos/importar`, { archivoId }), {
    ok: (r: any) => `${r.nuevos} cargos nuevos, ${r.casados} casados con tickets`,
    invalidate: ['/gas/tarjetas'],
  });
  const sinTicket = (data ?? []).filter((m) => !m.gastoId).length;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={`${tarjeta.nombre} ·· ${tarjeta.ultimos4}`} width="max-w-2xl">
      <div className="space-y-4">
        <FileDrop multiple={false} accept=".csv,text/csv" compact label="Importar extracto CSV (fecha; comercio; importe)" onUploaded={(f) => f[0] && importar.mutate(f[0].id)} />
        {sinTicket > 0 && (
          <p className="flex items-center gap-2 text-[13px] text-warn">
            <AlertTriangle className="h-4 w-4" /> {sinTicket} cargos sin ticket. Al titular le llega un aviso para que los justifique.
          </p>
        )}
        {isLoading ? (
          <Spinner />
        ) : (
          <Card className="overflow-hidden">
            <CardHeader title="Cargos" />
            <DataTable
              dense
              rows={data ?? []}
              empty="Sin cargos importados."
              columns={[
                { key: 'fecha', header: 'Fecha', cell: (m: any) => fmtDate(m.fecha), width: '100px' },
                { key: 'comercio', header: 'Comercio', cell: (m: any) => m.comercio },
                { key: 'importe', header: 'Importe', align: 'right', cell: (m: any) => fmtMoney(m.importe) },
                {
                  key: 'gasto',
                  header: 'Ticket',
                  cell: (m: any) =>
                    m.gastoId ? (
                      <Badge tone="green">
                        <Link2 className="mr-1 inline h-3 w-3" />
                        {m.comercioGasto || m.gasto || 'Casado'}
                      </Badge>
                    ) : (
                      <Badge tone="orange">Sin ticket</Badge>
                    ),
                },
              ]}
              mobileTitle={(m: any) => m.comercio}
              mobileSubtitle={(m: any) => fmtDate(m.fecha)}
              mobileRight={(m: any) => fmtMoney(m.importe)}
            />
          </Card>
        )}
      </div>
    </Sheet>
  );
}
