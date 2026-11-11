import { BarChart3, FileBarChart } from 'lucide-react';
import { defineModule } from '../types';
import { page } from '../lazy';

export default defineModule({
  code: 'bi',
  nav: [
    { label: 'Panel de dirección', to: '/direccion', icon: BarChart3, perm: 'bi.ver' },
    { label: 'Informes', to: '/informes', icon: FileBarChart, perm: 'bi.ver' },
  ],
  routes: [
    { path: 'direccion', element: page(() => import('./pages/Panel')) },
    { path: 'informes', element: page(() => import('./pages/Informes')) },
  ],
});
