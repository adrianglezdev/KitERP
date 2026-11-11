import { CalendarClock, ClipboardCheck, FileSignature, HardDrive, LifeBuoy, ListChecks, Route, Wrench } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const SatTercero = lazyComponent<{ id: string; record: any }>(() => import('./pages/SatTercero'));

export default defineModule({
  code: 'sat',
  nav: [
    { label: 'Mis órdenes de hoy', to: '/sat/hoy', icon: Route, perm: 'sat.editar', badgeUrl: '/sat/mis-ordenes/contador' },
    { label: 'Tickets', to: '/sat/tickets', icon: LifeBuoy, perm: 'sat.ver' },
    { label: 'Órdenes de trabajo', to: '/sat/ordenes', icon: Wrench, perm: 'sat.ver' },
    { label: 'Planificación', to: '/sat/planificacion', icon: CalendarClock, perm: 'sat.planificar' },
    { label: 'Equipos instalados', to: '/sat/equipos', icon: HardDrive, perm: 'sat.ver' },
    { label: 'Contratos', to: '/sat/contratos', icon: FileSignature, perm: ['sat.contratos', 'sat.planificar'] },
    { label: 'Listas de comprobación', to: '/sat/checklists', icon: ListChecks, perm: 'sat.contratos' },
  ],
  routes: [
    { path: 'sat/hoy', element: page(() => import('./pages/MisOrdenes')) },
    { path: 'sat/tickets', element: page(() => import('./pages/Tickets')) },
    { path: 'sat/tickets/:id', element: page(() => import('./pages/TicketDetalle')) },
    { path: 'sat/ordenes', element: page(() => import('./pages/Ordenes')) },
    { path: 'sat/ordenes/:id', element: page(() => import('./pages/OrdenDetalle')) },
    { path: 'sat/planificacion', element: page(() => import('./pages/Planificacion')) },
    { path: 'sat/equipos', element: page(() => import('./pages/Equipos')) },
    { path: 'sat/equipos/:id', element: page(() => import('./pages/EquipoDetalle')) },
    { path: 'sat/contratos', element: page(() => import('./pages/Contratos')) },
    { path: 'sat/contratos/:id', element: page(() => import('./pages/ContratoDetalle')) },
    { path: 'sat/checklists', element: page(() => import('./pages/Checklists')) },
    { path: '/publico/sat/ticket/:token', element: page(() => import('./pages/PublicoTicket')) },
    { path: '/publico/sat/equipo/:token', element: page(() => import('./pages/PublicoEquipo')) },
    { path: '/publico/sat/:token', element: page(() => import('./pages/PublicoPortal')) },
  ],
  portal: [{ label: 'Mis órdenes', description: 'Trabajos de hoy', to: '/sat/hoy', icon: ClipboardCheck, perm: 'sat.editar' }],
  quickCreate: [{ label: 'Ticket de servicio técnico', to: '/sat/tickets?nuevo=1', icon: LifeBuoy, perm: 'sat.editar' }],
  entityTabs: { tercero: [{ id: 'sat', label: 'Servicio técnico', icon: Wrench, perm: 'sat.ver', component: SatTercero }] },
});
