import { CalendarCheck2, CalendarDays, CalendarRange, Settings2 } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const AusenciasPersona = lazyComponent<{ id: string; record: any }>(() => import('./pages/AusenciasPersona'));

export default defineModule({
  code: 'aus',
  nav: [
    { label: 'Mis vacaciones', to: '/ausencias', icon: CalendarDays, perm: 'aus.solicitar', end: true },
    { label: 'Calendario de equipo', to: '/ausencias/calendario', icon: CalendarRange, perm: ['aus.aprobar', 'aus.gestionar'] },
    { label: 'Solicitudes de ausencia', to: '/ausencias/solicitudes', icon: CalendarCheck2, perm: ['aus.aprobar', 'aus.gestionar'] },
    { label: 'Tipos y saldos', to: '/ausencias/config', icon: Settings2, perm: 'aus.gestionar' },
  ],
  routes: [
    { path: 'ausencias', element: page(() => import('./pages/MisAusencias')) },
    { path: 'ausencias/calendario', element: page(() => import('./pages/Calendario')) },
    { path: 'ausencias/solicitudes', element: page(() => import('./pages/Solicitudes')) },
    { path: 'ausencias/config', element: page(() => import('./pages/Config')) },
  ],
  portal: [{ label: 'Vacaciones', description: 'Pide días y mira tu saldo', to: '/ausencias', icon: CalendarDays, perm: 'aus.solicitar' }],
  quickCreate: [{ label: 'Pedir vacaciones o permiso', to: '/ausencias?nueva=1', icon: CalendarDays, perm: 'aus.solicitar' }],
  entityTabs: { persona: [{ id: 'ausencias', label: 'Ausencias', icon: CalendarDays, perm: 'aus.ver', component: AusenciasPersona }] },
});
