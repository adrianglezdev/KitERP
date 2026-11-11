import { GraduationCap, ListChecks, Route, Star, UserSearch } from 'lucide-react';
import { defineModule } from '../types';
import { page } from '../lazy';

export default defineModule({
  code: 'alt',
  nav: [
    { label: 'Selección', to: '/rrhh/seleccion', icon: UserSearch, perm: 'alt.ver' },
    { label: 'Altas y bajas', to: '/rrhh/procesos', icon: Route, perm: 'alt.ver' },
    { label: 'Evaluaciones', to: '/rrhh/evaluaciones', icon: Star },
    { label: 'Plan de formación', to: '/rrhh/plan-formacion', icon: GraduationCap, perm: 'alt.ver' },
    { label: 'Plantillas de altas', to: '/rrhh/procesos/plantillas', icon: ListChecks, perm: 'alt.gestionar' },
  ],
  routes: [
    { path: 'rrhh/seleccion', element: page(() => import('./pages/Seleccion')) },
    { path: 'rrhh/procesos', element: page(() => import('./pages/Procesos')) },
    { path: 'rrhh/procesos/plantillas', element: page(() => import('./pages/Plantillas')) },
    { path: 'rrhh/evaluaciones', element: page(() => import('./pages/Evaluaciones')) },
    { path: 'rrhh/evaluaciones/:id', element: page(() => import('./pages/Evaluaciones').then((m) => ({ default: m.EvaluacionDetalle }))) },
    { path: 'rrhh/plan-formacion', element: page(() => import('./pages/PlanFormacion')) },
  ],
  portal: [{ label: 'Mis evaluaciones', description: 'Lee y firma tu evaluación', to: '/rrhh/evaluaciones', icon: Star }],
});
