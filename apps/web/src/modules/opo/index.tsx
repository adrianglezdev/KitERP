import { Target } from 'lucide-react';
import { defineModule } from '../types';
import { page } from '../lazy';

export default defineModule({
  code: 'opo',
  nav: [{ label: 'Oportunidades', to: '/oportunidades', icon: Target, perm: 'opo.ver', end: true }],
  routes: [
    { path: 'oportunidades', element: page(() => import('./pages/Tablero')) },
    { path: 'oportunidades/:id', element: page(() => import('./pages/Oportunidad')) },
  ],
  quickCreate: [{ label: 'Oportunidad', to: '/oportunidades?nuevo=1', icon: Target, perm: 'opo.editar' }],
});
