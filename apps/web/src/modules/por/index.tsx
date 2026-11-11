import { UserCog } from 'lucide-react';
import { defineModule } from '../types';
import { page } from '../lazy';

export default defineModule({
  code: 'por',
  nav: [{ label: 'Mi portal', to: '/portal', icon: UserCog }],
  routes: [{ path: 'portal', element: page(() => import('./pages/Portal')) }],
});
