import { GraduationCap } from 'lucide-react';
import { altShared } from '@kite/shared';
import { PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function PlanFormacion() {
  return (
    <>
      <PageHeader title="Plan de formación" icon={GraduationCap} subtitle="Acciones formativas previstas por año, con su coste y si son bonificables." />
      <ResourceList def={altShared.planFormacionResource} endpoint="/alt/plan" createPerm="alt.gestionar" />
    </>
  );
}
