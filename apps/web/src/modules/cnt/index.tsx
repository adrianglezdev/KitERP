import { BookOpen, Calculator, FileSpreadsheet, ListOrdered, Receipt } from 'lucide-react';
import { defineModule } from '../types';
import { page } from '../lazy';

export default defineModule({
  code: 'cnt',
  nav: [
    { label: 'Contabilidad', to: '/contabilidad', icon: Calculator, perm: 'cnt.ver', end: true },
    { label: 'Libro diario', to: '/contabilidad/asientos', icon: ListOrdered, perm: 'cnt.ver' },
    { label: 'Libros y estados', to: '/contabilidad/libros', icon: FileSpreadsheet, perm: 'cnt.ver' },
    { label: 'Modelos tributarios', to: '/contabilidad/modelos', icon: Receipt, perm: 'cnt.ver' },
    { label: 'Plan de cuentas', to: '/contabilidad/cuentas', icon: BookOpen, perm: 'cnt.ver' },
  ],
  routes: [
    { path: 'contabilidad', element: page(() => import('./pages/Contabilidad')) },
    { path: 'contabilidad/asientos', element: page(() => import('./pages/Asientos')) },
    { path: 'contabilidad/libros', element: page(() => import('./pages/Libros')) },
    { path: 'contabilidad/modelos', element: page(() => import('./pages/Modelos')) },
    { path: 'contabilidad/cuentas', element: page(() => import('./pages/PlanCuentas')) },
  ],
});
