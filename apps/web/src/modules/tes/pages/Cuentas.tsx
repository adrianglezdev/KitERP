import { Landmark } from 'lucide-react';
import { tesShared } from '@kite/shared';
import { PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Cuentas() {
  return (
    <>
      <PageHeader title="Bancos y cajas" icon={Landmark} subtitle="Cuentas donde entra y sale el dinero. Cada una tiene su subcuenta contable." />
      <ResourceList def={tesShared.cuentaBancariaResource} endpoint="/tes/cuentas" createPerm="tes.gestionar" />
    </>
  );
}
