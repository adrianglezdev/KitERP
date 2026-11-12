import { Link } from 'react-router-dom';
import { CalendarClock, ClipboardCheck, PackageCheck, Truck } from 'lucide-react';
import { DOC_ESTADOS, fmtDate } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Card, EmptyState, EnumBadge, PageHeader, Spinner } from '@/components/ui';
import { DocumentList } from '@/components/docs/DocumentList';
import { defineModule } from '../types';

function Pedidos() {
  return <DocumentList tipos={['pedido']} title="Pedidos" icon={PackageCheck} createTipo="pedido" subtitle="Lo vendido: al confirmarlo se reserva el stock y al entregarlo se descuenta." />;
}

function Albaranes() {
  return <DocumentList tipos={['albaran']} title="Albaranes" icon={Truck} createTipo="albaran" subtitle="Entregas a clientes. Los entregados quedan listos para facturar." />;
}

function Preparacion() {
  const { data, isLoading } = useApi<any[]>('/documentos-pendientes/servir');
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Preparación de pedidos" icon={ClipboardCheck} subtitle="Pedidos confirmados pendientes de servir, por fecha de entrega." />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title="No hay pedidos pendientes de servir">
            Cuando comercial confirme un pedido aparecerá aquí.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => {
            const tarde = !!p.fechaEntrega && p.fechaEntrega < hoy;
            return (
              <Link key={p.id} to={`/documentos/${p.id}`} className="rounded-2xl bg-surface p-4 shadow-card transition hover:bg-sunken/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[16px] font-bold">{p.tercero}</p>
                    <p className="text-[12.5px] text-muted">{p.codigo}</p>
                  </div>
                  <EnumBadge options={DOC_ESTADOS.pedido} value={p.estado} />
                </div>
                <p className={cn('mt-3 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold', tarde ? 'bg-bad-soft text-bad' : 'bg-sunken text-muted')}>
                  <CalendarClock className="h-3.5 w-3.5" />
                  {p.fechaEntrega ? `${tarde ? 'Retrasado, debía entregarse el' : 'Entrega el'} ${fmtDate(p.fechaEntrega)}` : 'Sin fecha de entrega'}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default defineModule({
  code: 'ped',
  nav: [
    { label: 'Pedidos', to: '/pedidos', icon: PackageCheck, perm: 'ped.ver', end: true },
    { label: 'Preparación', to: '/pedidos/preparacion', icon: ClipboardCheck, perm: 'ped.preparar' },
    { label: 'Albaranes', to: '/albaranes', icon: Truck, perm: 'ped.ver' },
  ],
  routes: [
    { path: 'pedidos', element: <Pedidos /> },
    { path: 'pedidos/preparacion', element: <Preparacion /> },
    { path: 'albaranes', element: <Albaranes /> },
  ],
  quickCreate: [{ label: 'Pedido de cliente', to: '/documentos/nuevo?tipo=pedido', icon: PackageCheck, perm: 'ped.editar' }],
});
