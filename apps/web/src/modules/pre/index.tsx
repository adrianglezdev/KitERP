import { FileSignature } from 'lucide-react';
import { DocumentList } from '@/components/docs/DocumentList';
import { defineModule } from '../types';

function Presupuestos() {
  return <DocumentList tipos={['presupuesto']} title="Presupuestos" icon={FileSignature} createTipo="presupuesto" subtitle="Ofertas a clientes con margen, versiones y aceptación online." />;
}

export default defineModule({
  code: 'pre',
  nav: [{ label: 'Presupuestos', to: '/presupuestos', icon: FileSignature, perm: 'pre.ver' }],
  routes: [{ path: 'presupuestos', element: <Presupuestos /> }],
  quickCreate: [{ label: 'Presupuesto', to: '/documentos/nuevo?tipo=presupuesto', icon: FileSignature, perm: 'pre.editar' }],
});
