import { CalendarClock, Car, TrendingDown, Truck } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const ActivosPersona = lazyComponent<{ id: string; record: any }>(() => import('./pages/ActivosPersona'));

export default defineModule({
  code: 'act',
  nav: [
    { label: 'Activos', to: '/activos', icon: Truck, perm: 'act.ver', end: true },
    { label: 'Vencimientos', to: '/activos/vencimientos', icon: CalendarClock, perm: 'act.ver' },
    { label: 'Flota', to: '/activos/flota', icon: Car, perm: 'act.ver' },
    { label: 'Amortizaciones', to: '/activos/amortizaciones', icon: TrendingDown, perm: ['act.gestionar', 'cnt.ver'] },
  ],
  routes: [
    { path: 'activos', element: page(() => import('./pages/Activos')) },
    { path: 'activos/vencimientos', element: page(() => import('./pages/Vencimientos')) },
    { path: 'activos/flota', element: page(() => import('./pages/Flota')) },
    { path: 'activos/amortizaciones', element: page(() => import('./pages/Amortizaciones')) },
    { path: 'activos/:id', element: page(() => import('./pages/ActivoDetalle')) },
  ],
  quickCreate: [{ label: 'Activo', to: '/activos?nuevo=1', icon: Truck, perm: 'act.gestionar' }],
  entityTabs: { persona: [{ id: 'activos', label: 'Activos', icon: Truck, perm: 'act.ver', component: ActivosPersona }] },
});
