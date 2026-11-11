import { Clock, Euro, KanbanSquare } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const ProyectosTercero = lazyComponent<{ id: string; record: any }>(() => import('./pages/ProyectosTercero'));

export default defineModule({
  code: 'pry',
  nav: [
    { label: 'Proyectos', to: '/proyectos', icon: KanbanSquare, perm: 'pry.ver', end: true },
    { label: 'Mis horas', to: '/mis-horas', icon: Clock, perm: 'pry.imputar' },
    { label: 'Coste por hora', to: '/proyectos/costes', icon: Euro, perm: 'pry.editar' },
  ],
  routes: [
    { path: 'proyectos', element: page(() => import('./pages/Proyectos')) },
    { path: 'proyectos/costes', element: page(() => import('./pages/Costes')) },
    { path: 'proyectos/:id', element: page(() => import('./pages/ProyectoDetalle')) },
    { path: 'mis-horas', element: page(() => import('./pages/MisHoras')) },
  ],
  portal: [{ label: 'Mis horas', description: 'Imputa tu tiempo a proyectos', to: '/mis-horas', icon: Clock, perm: 'pry.imputar' }],
  quickCreate: [{ label: 'Proyecto', to: '/proyectos?nuevo=1', icon: KanbanSquare, perm: 'pry.editar' }],
  entityTabs: { tercero: [{ id: 'proyectos', label: 'Proyectos', icon: KanbanSquare, perm: 'pry.ver', component: ProyectosTercero }] },
});
