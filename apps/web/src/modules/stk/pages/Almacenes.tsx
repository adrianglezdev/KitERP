import { Warehouse } from 'lucide-react';
import { stkShared } from '@kite/shared';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, Tabs, useTab } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Almacenes() {
  const tab = useTab('almacenes');
  const nav = useNavigate();
  return (
    <div className="space-y-5">
      <PageHeader title="Almacenes y furgonetas" icon={Warehouse} back="/stock" subtitle="Cada furgoneta es un almacén con su técnico responsable" />
      <Tabs
        tabs={[
          { id: 'almacenes', label: 'Almacenes' },
          { id: 'ubicaciones', label: 'Ubicaciones' },
        ]}
      />
      {tab === 'almacenes' ? (
        <ResourceList
          def={stkShared.almacenResource}
          endpoint="/stk/almacenes"
          createPerm="stk.gestionar"
          editPerm="stk.gestionar"
          toolbar={
            <Button variant="ghost" onClick={() => nav('/stock/valoracion')} className="hidden sm:inline-flex">
              Valoración
            </Button>
          }
        />
      ) : (
        <ResourceList def={stkShared.ubicacionResource} endpoint="/stk/ubicaciones" createPerm="stk.gestionar" editPerm="stk.gestionar" emptyText="Aún no hay ubicaciones. Crea códigos de pasillo, estantería y hueco." />
      )}
    </div>
  );
}
