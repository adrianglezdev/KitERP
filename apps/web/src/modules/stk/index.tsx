import { ArrowLeftRight, Boxes, ClipboardList, History, Truck, Warehouse } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const ArticuloStockTab = lazyComponent<{ id: string; record: any }>(() => import('./pages/ArticuloStockTab'));

export default defineModule({
  code: 'stk',
  nav: [
    { label: 'Stock', to: '/stock', icon: Boxes, perm: 'stk.ver', end: true },
    { label: 'Movimientos', to: '/stock/movimientos', icon: History, perm: 'stk.ver' },
    { label: 'Traspasos', to: '/stock/traspasos', icon: ArrowLeftRight, perm: 'stk.mover' },
    { label: 'Inventarios', to: '/stock/inventarios', icon: ClipboardList, perm: 'stk.mover' },
    { label: 'Mi furgoneta', to: '/stock/mi-furgoneta', icon: Truck, perm: 'stk.mover' },
    { label: 'Almacenes', to: '/stock/almacenes', icon: Warehouse, perm: 'stk.gestionar' },
  ],
  routes: [
    { path: 'stock', element: page(() => import('./pages/Stock')) },
    { path: 'stock/movimientos', element: page(() => import('./pages/Movimientos')) },
    { path: 'stock/traspasos', element: page(() => import('./pages/Traspasos')) },
    { path: 'stock/inventarios', element: page(() => import('./pages/Inventarios')) },
    { path: 'stock/inventarios/:id', element: page(() => import('./pages/InventarioDetalle')) },
    { path: 'stock/mi-furgoneta', element: page(() => import('./pages/MiFurgoneta')) },
    { path: 'stock/almacenes', element: page(() => import('./pages/Almacenes')) },
    { path: 'stock/valoracion', element: page(() => import('./pages/Valoracion')) },
    { path: 'stock/trazabilidad', element: page(() => import('./pages/Trazabilidad')) },
  ],
  portal: [{ label: 'Mi furgoneta', description: 'Material que llevas', to: '/stock/mi-furgoneta', icon: Truck, perm: 'stk.mover' }],
  entityTabs: { articulo: [{ id: 'stock', label: 'Stock', icon: Boxes, perm: 'stk.ver', component: ArticuloStockTab }] },
});

