import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { satShared } from '@kite/shared';
import { useSession } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { ResourceFormDialog, ResourceList } from '@/components/resource';
import { SlaBadge } from '../components';

export default function Tickets() {
  const { can } = useSession();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [nuevo, setNuevo] = useState(false);
  useEffect(() => {
    if (sp.get('nuevo') === '1') {
      setNuevo(true);
      sp.delete('nuevo');
      setSp(sp, { replace: true });
    }
  }, [sp, setSp]);
  return (
    <>
      <PageHeader title="Tickets" icon={LifeBuoy} subtitle="Avisos e incidencias de los clientes, con su plazo de respuesta y resolución." />
      <ResourceList
        def={satShared.ticketResource}
        endpoint="/sat/tickets"
        detailPath="/sat/tickets"
        createPerm={can('sat.planificar') ? 'sat.editar' : 'sat.planificar'}
        hideInForm={can('sat.planificar') ? [] : ['responsableId']}
        columns={[{ key: 'venceResolucion', header: 'Plazo', cell: (r: any) => <SlaBadge sla={r.sla} estado={r.estado} /> }]}
        emptyText="No hay tickets con estos filtros."
      />
      <ResourceFormDialog open={nuevo} onOpenChange={setNuevo} def={satShared.ticketResource} endpoint="/sat/tickets" onSaved={(r) => nav(`/sat/tickets/${r.id}`)} />
    </>
  );
}
