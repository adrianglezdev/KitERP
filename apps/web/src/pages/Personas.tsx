import { useNavigate } from 'react-router-dom';
import { Network, Users } from 'lucide-react';
import { personaResource } from '@kite/shared';
import { useSession } from '@/lib/session';
import { Avatar, ButtonLink, PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Personas() {
  const { can } = useSession();
  const nav = useNavigate();
  void nav;
  return (
    <>
      <PageHeader
        title="Directorio"
        icon={Users}
        subtitle="Todas las personas de la empresa, con su departamento, centro y responsable."
        actions={
          <ButtonLink to="/organigrama" icon={Network}>
            Organigrama
          </ButtonLink>
        }
      />
      <ResourceList
        def={personaResource}
        endpoint="/personas"
        detailPath="/personas"
        createPerm={can('personas.gestionar') ? 'personas.gestionar' : undefined}
        columns={[
          {
            key: 'nombre',
            header: 'Nombre',
            sortable: true,
            cell: (r: any) => (
              <span className="flex items-center gap-2.5">
                <Avatar name={`${r.nombre} ${r.apellidos ?? ''}`} src={r.fotoUrl} size={28} />
                <span className="font-medium">
                  {r.nombre} {r.apellidos}
                </span>
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
