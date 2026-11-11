import { MessagesSquare } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const ActividadTercero = lazyComponent<{ id: string; record: any }>(() => import('./pages/ActividadTercero'));

export default defineModule({
  code: 'crm',
  nav: [{ label: 'Actividad comercial', to: '/crm/actividades', icon: MessagesSquare, perm: 'crm.ver' }],
  routes: [{ path: 'crm/actividades', element: page(() => import('./pages/Actividades')) }],
  quickCreate: [{ label: 'Actividad comercial', to: '/crm/actividades?nuevo=1', icon: MessagesSquare, perm: 'crm.editar' }],
  entityTabs: { tercero: [{ id: 'actividad', label: 'Actividad comercial', icon: MessagesSquare, perm: 'crm.ver', component: ActividadTercero }] },
});
