import { FileClock, Receipt, Repeat, ShieldCheck, ShoppingBag } from 'lucide-react';
import { DocumentList } from '@/components/docs/DocumentList';
import { useSession } from '@/lib/session';
import { DOC_MODULO, DOC_VENTA, type DocTipo } from '@kite/shared';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

function Facturas() {
  return (
    <DocumentList
      tipos={['factura', 'factura_rectificativa', 'factura_simplificada', 'proforma']}
      title="Facturas"
      icon={Receipt}
      createTipo="factura"
      showPago
      subtitle="Facturas emitidas, rectificativas y proformas. Una factura emitida no se modifica: se rectifica."
    />
  );
}

/** Pestaña "Ventas" en la ficha del cliente: todos sus documentos de venta que el usuario puede ver. */
function VentasTercero({ id }: { id: string }) {
  const { has, can } = useSession();
  const tipos = DOC_VENTA.filter((t) => has(DOC_MODULO[t as DocTipo]) && can(`${DOC_MODULO[t as DocTipo]}.ver`)) as DocTipo[];
  if (!tipos.length) return null;
  return <DocumentList tipos={tipos} fixed={{ terceroId: id }} embedded showPago />;
}

const Pendientes = lazyComponent(() => import('./pages/Pendientes'));

export default defineModule({
  code: 'fac',
  nav: [
    { label: 'Facturas', to: '/facturas', icon: Receipt, perm: 'fac.ver', end: true },
    { label: 'Pendiente de facturar', to: '/facturas/pendientes', icon: FileClock, perm: 'fac.editar' },
    { label: 'Facturas recurrentes', to: '/facturas/recurrentes', icon: Repeat, perm: 'fac.ver' },
    { label: 'Verifactu', to: '/facturas/verifactu', icon: ShieldCheck, perm: 'fac.ver' },
  ],
  routes: [
    { path: 'facturas', element: <Facturas /> },
    { path: 'facturas/pendientes', element: <Pendientes /> },
    { path: 'facturas/recurrentes', element: page(() => import('./pages/Recurrentes')) },
    { path: 'facturas/verifactu', element: page(() => import('./pages/Verifactu')) },
  ],
  quickCreate: [{ label: 'Factura', to: '/documentos/nuevo?tipo=factura', icon: Receipt, perm: 'fac.editar' }],
  entityTabs: { tercero: [{ id: 'ventas', label: 'Ventas', icon: ShoppingBag, perm: ['pre.ver', 'ped.ver', 'fac.ver'], component: VentasTercero }] },
});
