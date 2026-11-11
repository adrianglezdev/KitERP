import { useState } from 'react';
import { Package } from 'lucide-react';
import { articuloResource, familiaResource, fmtMoney, tarifaResource } from '@kite/shared';
import { useSession } from '@/lib/session';
import { PageHeader, Segmented } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Catalogo() {
  const { can } = useSession();
  const [vista, setVista] = useState<'articulos' | 'familias' | 'tarifas'>('articulos');
  return (
    <>
      <PageHeader title="Catálogo" icon={Package} subtitle="Artículos y servicios que se compran y se venden. Es la base de presupuestos, pedidos, stock y compras." />
      <Segmented
        className="mb-4"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'articulos', label: 'Artículos y servicios' },
          { value: 'familias', label: 'Familias' },
          { value: 'tarifas', label: 'Tarifas' },
        ]}
      />
      {vista === 'articulos' && (
        <ResourceList
          def={articuloResource}
          endpoint="/articulos"
          detailPath="/catalogo"
          createPerm="catalogo.gestionar"
          columns={[{ key: 'precioVenta', header: 'PVP', align: 'right', sortable: true, cell: (r: any) => fmtMoney(r.precioVenta) }]}
        />
      )}
      {vista === 'familias' && <ResourceList def={familiaResource} endpoint="/familias" createPerm="catalogo.gestionar" />}
      {vista === 'tarifas' && <ResourceList def={tarifaResource} endpoint="/tarifas" createPerm="catalogo.gestionar" />}
      {!can('catalogo.ver') && null}
    </>
  );
}
