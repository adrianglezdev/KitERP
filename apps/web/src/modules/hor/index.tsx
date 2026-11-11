import { CalendarRange, Clock, Hourglass, MonitorSmartphone, TriangleAlert, Users } from 'lucide-react';
import { MesJornada } from './comun';
import { defineModule } from '../types';
import { page } from '../lazy';

function FichajesPersona({ id }: { id: string }) {
  return <MesJornada personaId={id} />;
}

export default defineModule({
  code: 'hor',
  nav: [
    { label: 'Fichar', to: '/fichar', icon: Clock, perm: 'hor.fichar' },
    { label: 'Equipo ahora', to: '/horario/ahora', icon: Users, perm: 'hor.aprobar' },
    { label: 'Incidencias de jornada', to: '/horario/incidencias', icon: TriangleAlert, perm: 'hor.aprobar' },
    { label: 'Cuadrante', to: '/horario/cuadrante', icon: CalendarRange, perm: ['hor.aprobar', 'hor.gestionar'] },
    { label: 'Bolsa de horas', to: '/horario/bolsa', icon: Hourglass, perm: 'hor.aprobar' },
    { label: 'Turnos y quioscos', to: '/horario/turnos', icon: MonitorSmartphone, perm: 'hor.gestionar' },
  ],
  routes: [
    { path: 'fichar', element: page(() => import('./pages/Fichar')) },
    { path: 'horario/ahora', element: page(() => import('./pages/Ahora')) },
    { path: 'horario/incidencias', element: page(() => import('./pages/Incidencias')) },
    { path: 'horario/cuadrante', element: page(() => import('./pages/Cuadrante')) },
    { path: 'horario/bolsa', element: page(() => import('./pages/Bolsa')) },
    { path: 'horario/turnos', element: page(() => import('./pages/Turnos')) },
    { path: '/publico/kiosco/:token', element: page(() => import('./pages/Kiosco')) },
  ],
  portal: [{ label: 'Fichar', description: 'Entrada, pausa y salida', to: '/fichar', icon: Clock, perm: 'hor.fichar' }],
  entityTabs: { persona: [{ id: 'fichajes', label: 'Jornada', icon: Clock, perm: 'hor.ver', component: FichajesPersona }] },
});
