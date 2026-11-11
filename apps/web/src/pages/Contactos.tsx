import { Contact } from 'lucide-react';
import { contactoResource } from '@kite/shared';
import { PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Contactos() {
  return (
    <>
      <PageHeader title="Contactos" icon={Contact} subtitle="Las personas con las que tratáis en cada cliente o proveedor." />
      <ResourceList def={contactoResource} endpoint="/contactos" createPerm="terceros.gestionar" />
    </>
  );
}
