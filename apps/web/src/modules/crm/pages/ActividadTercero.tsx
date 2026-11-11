import { crmShared } from '@kite/shared';
import { ResourceList } from '@/components/resource';

export default function ActividadTercero({ id }: { id: string }) {
  return (
    <ResourceList
      def={crmShared.actividadResource}
      endpoint="/crm/actividades"
      createPerm="crm.editar"
      fixed={{ terceroId: id }}
      initial={{ fecha: new Date().toISOString().slice(0, 16) }}
      embedded
      pageSize={10}
      emptyText="Todavía no hay actividad registrada con este cliente."
    />
  );
}
