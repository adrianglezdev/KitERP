import { BarChart3, ClipboardCheck, CreditCard, HandCoins, Receipt, Wallet } from 'lucide-react';
import { defineModule } from '../types';
import { page } from '../lazy';

export default defineModule({
  code: 'gas',
  nav: [
    { label: 'Mis gastos', to: '/gastos', icon: Receipt, perm: 'gas.crear', end: true },
    { label: 'Por aprobar', to: '/gastos/aprobar', icon: ClipboardCheck, perm: 'gas.aprobar', badgeUrl: '/gas/gastos/contador-aprobar' },
    { label: 'Todos los gastos', to: '/gastos/todos', icon: Wallet, perm: 'gas.ver' },
    { label: 'Pagar gastos', to: '/gastos/liquidar', icon: HandCoins, perm: 'gas.liquidar' },
    { label: 'Informe', to: '/gastos/informe', icon: BarChart3, perm: ['gas.ver', 'gas.liquidar'] },
    { label: 'Tarjetas de empresa', to: '/gastos/tarjetas', icon: CreditCard, perm: 'gas.liquidar' },
  ],
  routes: [
    { path: 'gastos', element: page(() => import('./pages/MisGastos')) },
    { path: 'gastos/todos', element: page(() => import('./pages/TodosGastos')) },
    { path: 'gastos/aprobar', element: page(() => import('./pages/Aprobar')) },
    { path: 'gastos/liquidar', element: page(() => import('./pages/Liquidar')) },
    { path: 'gastos/informe', element: page(() => import('./pages/Informe')) },
    { path: 'gastos/tarjetas', element: page(() => import('./pages/Tarjetas')) },
  ],
  portal: [{ label: 'Mis gastos', description: 'Sube un ticket o kilómetros', to: '/gastos?nuevo=1', icon: Receipt, perm: 'gas.crear' }],
  quickCreate: [{ label: 'Gasto', to: '/gastos?nuevo=1', icon: Receipt, perm: 'gas.crear' }],
});
