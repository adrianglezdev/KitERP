import { FileSignature } from 'lucide-react';
import { satShared } from '@kite/shared';
import { PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Contratos() {
  return (
    <>
      <PageHeader
        title="Contratos de mantenimiento"
        icon={FileSignature}
        subtitle="Visitas periódicas que se generan solas como órdenes de trabajo y, si hay cuota, factura recurrente."
      />
      <ResourceList def={satShared.contratoResource} endpoint="/sat/contratos" detailPath="/sat/contratos" createPerm="sat.contratos" />
    </>
  );
}
