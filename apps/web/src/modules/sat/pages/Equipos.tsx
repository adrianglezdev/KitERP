import { HardDrive } from 'lucide-react';
import { satShared } from '@kite/shared';
import { PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Equipos() {
  return (
    <>
      <PageHeader title="Equipos instalados" icon={HardDrive} subtitle="Cada equipo en casa del cliente, con su garantía, su contrato y el historial de intervenciones." />
      <ResourceList def={satShared.equipoResource} endpoint="/sat/equipos" detailPath="/sat/equipos" createPerm="sat.contratos" />
    </>
  );
}
