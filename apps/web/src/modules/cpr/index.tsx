import { FileInput, ClipboardList, PackageOpen, ShoppingCart, Sparkles, Truck, Users } from 'lucide-react';
import { DocumentList } from '@/components/docs/DocumentList';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const ProveedorTab = lazyComponent<{ id: string; record: any }>(() => import('./pages/ProveedorTab'));
const ArticuloProveedoresTab = lazyComponent<{ id: string; record: any }>(() => import('./pages/ArticuloProveedoresTab'));

export default defineModule({
  code: 'cpr',
  nav: [
    { label: 'Solicitudes de compra', to: '/compras/solicitudes', icon: ClipboardList, perm: ['cpr.solicitar', 'cpr.ver'] },
    { label: 'Propuesta de compra', to: '/compras/propuesta', icon: Sparkles, perm: 'cpr.editar' },
    { label: 'Pedidos a proveedor', to: '/compras/pedidos', icon: ShoppingCart, perm: 'cpr.ver' },
    { label: 'Recepciones', to: '/compras/recepciones', icon: PackageOpen, perm: ['cpr.recibir', 'cpr.ver'] },
    { label: 'Facturas de proveedor', to: '/compras/facturas', icon: FileInput, perm: 'cpr.editar' },
    { label: 'Proveedores', to: '/compras/proveedores', icon: Users, perm: ['cpr.editar', 'cpr.aprobar'] },
  ],
  routes: [
    { path: 'compras/solicitudes', element: page(() => import('./pages/Solicitudes')) },
    { path: 'compras/propuesta', element: page(() => import('./pages/Propuesta')) },
    { path: 'compras/pedidos', element: <DocumentList tipos={['pedido_compra']} title="Pedidos a proveedor" icon={ShoppingCart} createTipo="pedido_compra" subtitle="Lo que se pide a cada proveedor. Por encima del importe fijado necesitan aprobación." /> },
    { path: 'compras/recepciones', element: page(() => import('./pages/Recepciones')) },
    { path: 'compras/facturas', element: page(() => import('./pages/Facturas')) },
    { path: 'compras/proveedores', element: page(() => import('./pages/Proveedores')) },
  ],
  portal: [{ label: 'Pedir material', description: 'Solicitud de compra', to: '/compras/solicitudes?nuevo=1', icon: ShoppingCart, perm: 'cpr.solicitar' }],
  quickCreate: [
    { label: 'Solicitud de compra', to: '/compras/solicitudes?nuevo=1', icon: ClipboardList, perm: 'cpr.solicitar' },
    { label: 'Pedido a proveedor', to: '/documentos/nuevo?tipo=pedido_compra', icon: Truck, perm: 'cpr.editar' },
  ],
  entityTabs: {
    tercero: [{ id: 'compras', label: 'Compras', icon: ShoppingCart, perm: ['cpr.editar', 'cpr.aprobar'], component: ProveedorTab }],
    articulo: [{ id: 'proveedores', label: 'Proveedores', icon: Users, perm: ['cpr.editar', 'cpr.aprobar', 'catalogo.gestionar'], component: ArticuloProveedoresTab }],
  },
});
