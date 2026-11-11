import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, type RouteObject } from 'react-router-dom';
import { ConfirmProvider, EmptyState, Spinner, TooltipProvider } from '@/components/ui';
import { SessionProvider, useSession } from '@/lib/session';
import { AppShell } from '@/layout/AppShell';
import { moduleWebs } from '@/modules/registry';
import { ShieldOff } from 'lucide-react';

const Login = lazy(() => import('@/pages/Login'));
const Inicio = lazy(() => import('@/pages/Inicio'));
const Bandeja = lazy(() => import('@/pages/Bandeja'));
const Tareas = lazy(() => import('@/pages/Tareas'));
const Tablon = lazy(() => import('@/pages/Tablon'));
const Encuestas = lazy(() => import('@/pages/Encuestas'));
const Firmas = lazy(() => import('@/pages/Firmas'));
const Denuncias = lazy(() => import('@/pages/Denuncias'));
const Personas = lazy(() => import('@/pages/Personas'));
const PersonaDetalle = lazy(() => import('@/pages/PersonaDetalle'));
const Organigrama = lazy(() => import('@/pages/Organigrama'));
const Terceros = lazy(() => import('@/pages/Terceros'));
const TerceroDetalle = lazy(() => import('@/pages/TerceroDetalle'));
const Contactos = lazy(() => import('@/pages/Contactos'));
const Catalogo = lazy(() => import('@/pages/Catalogo'));
const ArticuloDetalle = lazy(() => import('@/pages/ArticuloDetalle'));
const DocumentoVista = lazy(() => import('@/pages/DocumentoVista'));
const DocumentoEditar = lazy(() => import('@/pages/DocumentoEditar'));
const Cuenta = lazy(() => import('@/pages/Cuenta'));
const Config = lazy(() => import('@/pages/config/Config'));
const PublicDocumento = lazy(() => import('@/pages/public/PublicDocumento'));
const PublicFirma = lazy(() => import('@/pages/public/PublicFirma'));
const PublicCanal = lazy(() => import('@/pages/public/PublicCanal'));

function Guard({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Spinner className="h-dvh" />;
  if (!session) return <Navigate to={`/login?volver=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

/** Comprueba que el módulo esté activo antes de mostrar sus pantallas. */
function ModuleGate({ code, children }: { code: string; children: ReactNode }) {
  const { has } = useSession();
  if (!has(code))
    return (
      <EmptyState icon={ShieldOff} title="Este módulo no está activo">
        Un administrador puede activarlo en Configuración → Módulos.
      </EmptyState>
    );
  return <>{children}</>;
}

function renderRoutes(routes: RouteObject[], code: string): ReactNode {
  return routes.map((r, i) => (
    <Route key={`${code}-${i}`} path={r.path} element={<ModuleGate code={code}>{r.element}</ModuleGate>}>
      {r.children && renderRoutes(r.children, code)}
    </Route>
  ));
}

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <SessionProvider>
          <ConfirmProvider>
            <Suspense fallback={<Spinner className="h-dvh" />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/p/:token" element={<PublicDocumento />} />
                <Route path="/firmar/:token" element={<PublicFirma />} />
                <Route path="/canal/:empresaId" element={<PublicCanal />} />
                {moduleWebs.flatMap((m) => (m.routes ?? []).filter((r) => r.path?.startsWith('/publico/')).map((r, i) => <Route key={`pub-${m.code}-${i}`} path={r.path} element={r.element} />))}
                <Route
                  element={
                    <Guard>
                      <AppShell />
                    </Guard>
                  }
                >
                  <Route index element={<Inicio />} />
                  <Route path="bandeja" element={<Bandeja />} />
                  <Route path="tareas" element={<Tareas />} />
                  <Route path="tablon" element={<Tablon />} />
                  <Route path="encuestas" element={<Encuestas />} />
                  <Route path="firmas" element={<Firmas />} />
                  <Route path="denuncias" element={<Denuncias />} />
                  <Route path="personas" element={<Personas />} />
                  <Route path="personas/:id" element={<PersonaDetalle />} />
                  <Route path="organigrama" element={<Organigrama />} />
                  <Route path="terceros" element={<Terceros />} />
                  <Route path="terceros/:id" element={<TerceroDetalle />} />
                  <Route path="contactos" element={<Contactos />} />
                  <Route path="catalogo" element={<Catalogo />} />
                  <Route path="catalogo/:id" element={<ArticuloDetalle />} />
                  <Route path="documentos/nuevo" element={<DocumentoEditar />} />
                  <Route path="documentos/:id" element={<DocumentoVista />} />
                  <Route path="documentos/:id/editar" element={<DocumentoEditar />} />
                  <Route path="cuenta" element={<Cuenta />} />
                  <Route path="config/*" element={<Config />} />
                  {moduleWebs.map((m) => renderRoutes((m.routes ?? []).filter((r) => !r.path?.startsWith('/publico/')), m.code))}
                  <Route path="*" element={<EmptyState title="Página no encontrada">Revisa la dirección o vuelve al inicio.</EmptyState>} />
                </Route>
              </Routes>
            </Suspense>
          </ConfirmProvider>
        </SessionProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}
