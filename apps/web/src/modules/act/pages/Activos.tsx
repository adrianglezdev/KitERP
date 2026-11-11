import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';
import { activoResource } from '../comun';

export default function Activos() {
  return (
    <>
      <PageHeader title="Activos" icon={Truck} subtitle="Vehículos, maquinaria, herramientas e informática: quién lo tiene, sus vencimientos, costes y amortización." />
      <ResourceList def={activoResource} endpoint="/act/activos" detailPath="/activos" createPerm="act.gestionar" />
    </>
  );
}
