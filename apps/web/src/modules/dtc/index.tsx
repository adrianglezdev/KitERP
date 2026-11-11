import { BookOpenCheck, BookOpen, Eye } from 'lucide-react';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const DocsVinculadosTab = lazyComponent<{ id: string; record: any; entidad?: string }>(() => import('./pages/DocsVinculadosTab'));
const tab = (entidad: string) => ({ id: 'dtc', label: 'Documentación técnica', icon: BookOpen, perm: 'dtc.ver', component: (p: { id: string; record: any }) => <DocsVinculadosTab {...p} entidad={entidad} /> });

export default defineModule({
  code: 'dtc',
  nav: [
    { label: 'Documentación técnica', to: '/dtc/documentos', icon: BookOpenCheck, perm: 'dtc.ver' },
    { label: 'Pendientes de leer', to: '/dtc/pendientes', icon: Eye, perm: 'dtc.ver', badgeUrl: '/dtc/pendientes-leer/contador' },
  ],
  routes: [
    { path: 'dtc/documentos', element: page(() => import('./pages/Documentos')) },
    { path: 'dtc/documentos/:id', element: page(() => import('./pages/DocumentoDetalle')) },
    { path: 'dtc/pendientes', element: page(() => import('./pages/Pendientes')) },
  ],
  portal: [{ label: 'Documentación', description: 'Manuales y procedimientos que debes leer', to: '/dtc/pendientes', icon: BookOpenCheck, perm: 'dtc.ver' }],
  quickCreate: [{ label: 'Documento técnico', to: '/dtc/documentos?nuevo=1', icon: BookOpenCheck, perm: 'dtc.editar' }],
  entityTabs: {
    articulo: [tab('articulo')],
    tercero: [tab('tercero')],
  },
});
