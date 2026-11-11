import { useNavigate } from 'react-router-dom';
import { CalendarClock, PackageOpen } from 'lucide-react';
import { fmtDate, fmtNumber } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button, Card, CardHeader, EmptyState, Spinner } from '@/components/ui';
import { DocumentList } from '@/components/docs/DocumentList';

interface Pendiente {
  id: string;
  codigo: string;
  fecha: string;
  fechaEntrega: string | null;
  proveedor: string;
  lineas: number;
  pendiente: number;
  recepcionBorrador: string | null;
  retrasado: boolean;
}

/**
 * Recepción de mercancía. Arriba, lo que está por llegar (pensado para el móvil del almacén):
 * al pulsar "Recibir" se crea la recepción con lo pendiente y se ajusta lo que ha llegado de verdad.
 */
export default function Recepciones() {
  const nav = useNavigate();
  const { can } = useSession();
  const { data, isLoading } = useApi<Pendiente[]>('/cpr/recepciones-pendientes');
  const recibir = useMut((p: Pendiente) => (p.recepcionBorrador ? Promise.resolve({ id: p.recepcionBorrador }) : api.post<{ id: string }>(`/documentos/${p.id}/convertir`, { tipo: 'recepcion' })), {
    invalidate: ['/cpr', '/documentos'],
    onSuccess: (r) => nav(`/documentos/${r.id}/editar`),
  });
  return (
    <div className="space-y-5">
      <DocumentList
        tipos={['recepcion']}
        title="Recepciones"
        icon={PackageOpen}
        subtitle="Mercancía recibida de proveedores. Al confirmar una recepción entra el stock."
        extraActions={null}
        estadoTabs={false}
      />
      {can(['cpr.recibir', 'cpr.editar']) && (
        <Card className="overflow-hidden">
          <CardHeader title="Pendiente de recibir" subtitle="Pedidos a proveedor aprobados con mercancía por llegar" />
          {isLoading ? (
            <Spinner />
          ) : !data?.length ? (
            <EmptyState icon={PackageOpen} title="No hay nada pendiente de llegar" />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold">{p.proveedor}</p>
                    <p className="text-[12.5px] text-muted">
                      {p.codigo} · {p.lineas} líneas · {fmtNumber(p.pendiente, 3)} unidades pendientes
                    </p>
                    <p className={cn('mt-1 inline-flex items-center gap-1 text-[12px]', p.retrasado ? 'font-medium text-bad' : 'text-muted')}>
                      <CalendarClock className="h-3.5 w-3.5" />
                      {p.fechaEntrega ? `${p.retrasado ? 'Retrasado: debía llegar el' : 'Llega el'} ${fmtDate(p.fechaEntrega)}` : `Pedido el ${fmtDate(p.fecha)}`}
                    </p>
                  </div>
                  <Button variant="primary" size="lg" icon={PackageOpen} className="w-full sm:w-auto" loading={recibir.isPending && recibir.variables?.id === p.id} onClick={() => recibir.mutate(p)}>
                    {p.recepcionBorrador ? 'Seguir recepción' : 'Recibir'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
