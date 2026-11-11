import { CalendarRange, HandCoins, Scale, Wallet } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const NominasPersona = lazyComponent<{ id: string; record: any }>(() => import('./pages/NominasPersona'));

export default defineModule({
  code: 'nom',
  nav: [
    { label: 'Mis nóminas', to: '/nominas', icon: Wallet, perm: 'nom.ver', end: true },
    { label: 'Preparar nóminas', to: '/nominas/periodos', icon: CalendarRange, perm: 'nom.gestionar' },
    { label: 'Anticipos', to: '/nominas/anticipos', icon: HandCoins, perm: 'nom.anticipos' },
    { label: 'Registro retributivo', to: '/nominas/registro-retributivo', icon: Scale, perm: 'nom.gestionar' },
  ],
  routes: [
    { path: 'nominas', element: page(() => import('./pages/MisNominas')) },
    { path: 'nominas/periodos', element: page(() => import('./pages/Periodos')) },
    { path: 'nominas/periodos/:id', element: page(() => import('./pages/Periodo')) },
    { path: 'nominas/anticipos', element: page(() => import('./pages/Anticipos')) },
    { path: 'nominas/registro-retributivo', element: page(() => import('./pages/RegistroRetributivo')) },
  ],
  portal: [{ label: 'Mis nóminas', description: 'Recibos, certificado y anticipos', to: '/nominas', icon: Wallet, perm: 'nom.ver' }],
  entityTabs: { persona: [{ id: 'nominas', label: 'Nóminas', icon: Wallet, perm: 'nom.gestionar', component: NominasPersona }] },
});
