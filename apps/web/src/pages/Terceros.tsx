import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { terceroResource } from '@kite/shared';
import { PageHeader, Segmented } from '@/components/ui';
import { ResourceList } from '@/components/resource';
import { DuplicadosTercero } from '@/components/entity/DuplicadosTercero';

export default function Terceros() {
  const [vista, setVista] = useState<'clientes' | 'proveedores' | 'todos'>('clientes');
  const fixed: Record<string, string> | undefined = vista === 'clientes' ? { esCliente: 'true' } : vista === 'proveedores' ? { esProveedor: 'true' } : undefined;
  return (
    <>
      <PageHeader title="Clientes y proveedores" icon={Building2} subtitle="Una sola ficha por empresa: puede ser cliente y proveedor a la vez." />
      <Segmented
        className="mb-4"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'clientes', label: 'Clientes' },
          { value: 'proveedores', label: 'Proveedores' },
          { value: 'todos', label: 'Todos' },
        ]}
      />
      <ResourceList
        key={vista}
        def={terceroResource}
        endpoint="/terceros"
        detailPath="/terceros"
        createPerm="terceros.gestionar"
        fixed={fixed}
        initial={vista === 'proveedores' ? { esCliente: false, esProveedor: true } : undefined}
        formExtra={(values, record) => <DuplicadosTercero values={values} excluir={record?.id} />}
      />
    </>
  );
}
