import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Package, Pencil } from 'lucide-react';
import { ARTICULO_TIPOS, articuloResource, fmtMoney, fmtNumber } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Badge, Button, EnumBadge, PageHeader, Spinner, Stat } from '@/components/ui';
import { ResourceDetails, ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';

export default function ArticuloDetalle() {
  const { id } = useParams();
  const { can } = useSession();
  const { data: a, isLoading } = useApi<any>(`/articulos/${id}`);
  const [edit, setEdit] = useState(false);
  if (isLoading || !a) return <Spinner />;
  const margen = a.coste !== null && a.precioVenta ? ((a.precioVenta - a.coste) / a.precioVenta) * 100 : null;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/catalogo"
        crumbs={[{ label: 'Catálogo', to: '/catalogo' }, { label: a.referencia }]}
        title={a.nombre}
        subtitle={<span className="font-mono">{a.referencia}</span>}
        badges={
          <>
            <EnumBadge options={ARTICULO_TIPOS} value={a.tipo} />
            {!a.activo && <Badge tone="red">Descatalogado</Badge>}
          </>
        }
        actions={can('catalogo.gestionar') && <Button icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Precio de venta" value={fmtMoney(a.precioVenta)} hint={`IVA ${fmtNumber(a.ivaTipo)} %`} />
        {a.coste !== null && <Stat label="Coste" value={fmtMoney(a.coste)} tone="brown" />}
        {margen !== null && <Stat label="Margen sobre venta" value={`${fmtNumber(margen, 1)} %`} tone={margen < 15 ? 'red' : 'green'} />}
      </div>
      <EntityTabsView
        entidad="articulo"
        id={a.id}
        record={a}
        canEdit={can('catalogo.gestionar')}
        tabs={[{ id: 'datos', label: 'Datos', icon: Package, content: <ResourceDetails def={articuloResource} record={a} exclude={['nombre']} /> }]}
      />
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={articuloResource} endpoint="/articulos" record={a} />
    </div>
  );
}
