import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, Eye } from 'lucide-react';
import { dtcShared } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { Alert, PageHeader, Segmented } from '@/components/ui';
import { ResourceList } from '@/components/resource';

type Vista = 'todos' | 'aprobado' | 'en_revision' | 'borrador' | 'obsoleto';

/** Biblioteca de documentación técnica controlada: manuales, planos, procedimientos… con versiones aprobadas. */
export default function Documentos() {
  const [vista, setVista] = useState<Vista>('todos');
  const pend = useApi<{ n: number }>('/dtc/pendientes-leer/contador');
  return (
    <>
      <PageHeader title="Documentación técnica" icon={BookOpenCheck} subtitle="Cada documento guarda todas sus versiones; solo la aprobada es la vigente." />
      {!!pend.data?.n && (
        <Alert tone="violet" icon={Eye} className="mb-4">
          Tienes {pend.data.n} {pend.data.n === 1 ? 'documento nuevo o actualizado' : 'documentos nuevos o actualizados'} por leer.{' '}
          <Link to="/dtc/pendientes" className="font-semibold underline">
            Ver
          </Link>
        </Alert>
      )}
      <Segmented
        className="mb-3"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'todos', label: 'Todos' },
          { value: 'aprobado', label: 'Vigentes' },
          { value: 'en_revision', label: 'En revisión' },
          { value: 'borrador', label: 'Borradores' },
          { value: 'obsoleto', label: 'Obsoletos' },
        ]}
      />
      <ResourceList
        key={vista}
        def={dtcShared.dtcDocumentoResource}
        endpoint="/dtc/documentos"
        detailPath="/dtc/documentos"
        createPerm="dtc.editar"
        fixed={vista === 'todos' ? undefined : { estado: vista }}
      />
    </>
  );
}
