import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { satShared } from '@kite/shared';
import { PageHeader, Segmented } from '@/components/ui';
import { ResourceList } from '@/components/resource';

/** Todas las órdenes de trabajo (cada técnico ve las suyas). */
export default function Ordenes() {
  const [estado, setEstado] = useState('pendiente,planificada,en_ruta,en_curso');
  return (
    <>
      <PageHeader title="Órdenes de trabajo" icon={Wrench} subtitle="Trabajos de los técnicos: correctivos, preventivos e instalaciones." />
      <Segmented
        className="mb-4"
        value={estado}
        onChange={setEstado}
        options={[
          { value: 'pendiente,planificada,en_ruta,en_curso', label: 'Abiertas' },
          { value: 'pendiente', label: 'Sin planificar' },
          { value: 'finalizada', label: 'Finalizadas' },
          { value: '', label: 'Todas' },
        ]}
      />
      <ResourceList key={estado} def={satShared.ordenResource} endpoint="/sat/ordenes" detailPath="/sat/ordenes" createPerm="sat.planificar" fixed={estado ? { estado } : undefined} />
    </>
  );
}
