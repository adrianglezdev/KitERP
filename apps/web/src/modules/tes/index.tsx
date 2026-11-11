import { ArrowDownLeft, ArrowUpRight, Landmark, Layers, PiggyBank, Wand2 } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const TesTercero = lazyComponent<{ id: string; record: any }>(() => import('./pages/TesTercero'));
const Cobros = lazyComponent<object>(() => import('./pages/Vencimientos').then((m) => ({ default: () => <m.default circuito="cobro" /> })));
const Pagos = lazyComponent<object>(() => import('./pages/Vencimientos').then((m) => ({ default: () => <m.default circuito="pago" /> })));

export default defineModule({
  code: 'tes',
  nav: [
    { label: 'Tesorería', to: '/tesoreria', icon: PiggyBank, perm: 'tes.ver', end: true },
    { label: 'Cobros', to: '/tesoreria/cobros', icon: ArrowDownLeft, perm: 'tes.ver' },
    { label: 'Pagos', to: '/tesoreria/pagos', icon: ArrowUpRight, perm: 'tes.ver' },
    { label: 'Remesas', to: '/tesoreria/remesas', icon: Layers, perm: 'tes.ver' },
    { label: 'Banco y conciliación', to: '/tesoreria/banco', icon: Wand2, perm: 'tes.ver' },
    { label: 'Bancos y cajas', to: '/tesoreria/cuentas', icon: Landmark, perm: 'tes.gestionar' },
  ],
  routes: [
    { path: 'tesoreria', element: page(() => import('./pages/Tesoreria')) },
    { path: 'tesoreria/cobros', element: <Cobros /> },
    { path: 'tesoreria/pagos', element: <Pagos /> },
    { path: 'tesoreria/remesas', element: page(() => import('./pages/Remesas')) },
    { path: 'tesoreria/banco', element: page(() => import('./pages/Banco')) },
    { path: 'tesoreria/cuentas', element: page(() => import('./pages/Cuentas')) },
  ],
  entityTabs: { tercero: [{ id: 'tes', label: 'Cobros y pagos', icon: PiggyBank, perm: 'tes.ver', component: TesTercero }] },
});
