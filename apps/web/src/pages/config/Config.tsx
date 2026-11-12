import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { centroResource, departamentoResource, festivoResource, formaPagoResource } from '@kite/shared';
import { useSession } from '@/lib/session';
import { PageHeader, Spinner } from '@/components/ui';
import { ResourceList } from '@/components/resource';
import { useCurrentApp } from '@/layout/app-context';
import { CONFIG_ITEMS } from '@/layout/apps';

const Empresa = lazy(() => import('./Empresa'));
const Apariencia = lazy(() => import('./Apariencia'));
const Modulos = lazy(() => import('./Modulos'));
const Usuarios = lazy(() => import('./Usuarios'));
const Roles = lazy(() => import('./Roles'));
const Series = lazy(() => import('./Series'));
const Plantillas = lazy(() => import('./Plantillas'));
const Integraciones = lazy(() => import('./Integraciones'));
const Emails = lazy(() => import('./Emails'));
const Auditoria = lazy(() => import('./Auditoria'));

/** Configuración es una aplicación más: sus secciones están en la barra lateral (layout/apps.ts). */
export default function Config() {
  const { can } = useSession();
  const { item } = useCurrentApp();
  const first = CONFIG_ITEMS.find((i) => !i.perm || can(i.perm))?.to ?? '/config/empresa';
  return (
    <>
      <PageHeader title={item?.label ?? 'Configuración'} icon={item?.icon ?? Settings} />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route index element={<Navigate to={first} replace />} />
          <Route path="empresa" element={<Empresa />} />
          <Route path="apariencia" element={<Apariencia />} />
          <Route path="modulos" element={<Modulos />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="roles" element={<Roles />} />
          <Route path="series" element={<Series />} />
          <Route path="plantillas" element={<Plantillas />} />
          <Route path="integraciones" element={<Integraciones />} />
          <Route path="emails" element={<Emails />} />
          <Route path="auditoria" element={<Auditoria />} />
          <Route path="centros" element={<ResourceList def={centroResource} endpoint="/centros" createPerm="cfg.gestionar" />} />
          <Route path="departamentos" element={<ResourceList def={departamentoResource} endpoint="/departamentos" createPerm={['cfg.gestionar', 'personas.gestionar']} />} />
          <Route path="calendario" element={<ResourceList def={festivoResource} endpoint="/festivos" createPerm="cfg.gestionar" pageSize={50} />} />
          <Route path="formas-pago" element={<ResourceList def={formaPagoResource} endpoint="/formas-pago" createPerm="cfg.gestionar" />} />
        </Routes>
      </Suspense>
    </>
  );
}
