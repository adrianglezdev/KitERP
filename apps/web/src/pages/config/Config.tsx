import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  Building,
  CalendarHeart,
  CreditCard,
  FileText,
  Hash,
  History,
  Mail,
  MapPin,
  Network,
  Plug,
  Puzzle,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { centroResource, departamentoResource, festivoResource, formaPagoResource } from '@kite/shared';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { PageHeader, Spinner } from '@/components/ui';
import { ResourceList } from '@/components/resource';

const Empresa = lazy(() => import('./Empresa'));
const Modulos = lazy(() => import('./Modulos'));
const Usuarios = lazy(() => import('./Usuarios'));
const Roles = lazy(() => import('./Roles'));
const Series = lazy(() => import('./Series'));
const Plantillas = lazy(() => import('./Plantillas'));
const Integraciones = lazy(() => import('./Integraciones'));
const Emails = lazy(() => import('./Emails'));
const Auditoria = lazy(() => import('./Auditoria'));

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: string | string[];
}

const ITEMS: { grupo: string; items: Item[] }[] = [
  {
    grupo: 'Empresa',
    items: [
      { to: 'empresa', label: 'Datos y ajustes', icon: Building, perm: 'cfg.gestionar' },
      { to: 'modulos', label: 'Módulos', icon: Puzzle, perm: 'cfg.gestionar' },
      { to: 'centros', label: 'Centros de trabajo', icon: MapPin, perm: 'cfg.gestionar' },
      { to: 'departamentos', label: 'Departamentos', icon: Network, perm: ['cfg.gestionar', 'personas.gestionar'] },
      { to: 'calendario', label: 'Calendario laboral', icon: CalendarHeart, perm: 'cfg.gestionar' },
    ],
  },
  {
    grupo: 'Accesos',
    items: [
      { to: 'usuarios', label: 'Usuarios', icon: Users, perm: 'usr.gestionar' },
      { to: 'roles', label: 'Roles y permisos', icon: ShieldCheck, perm: 'usr.gestionar' },
      { to: 'auditoria', label: 'Registro de auditoría', icon: History, perm: 'auditoria.ver' },
    ],
  },
  {
    grupo: 'Documentos',
    items: [
      { to: 'series', label: 'Series de numeración', icon: Hash, perm: 'cfg.gestionar' },
      { to: 'formas-pago', label: 'Formas de pago', icon: CreditCard, perm: 'cfg.gestionar' },
      { to: 'plantillas', label: 'Plantillas', icon: FileText, perm: 'doc.plantillas' },
    ],
  },
  {
    grupo: 'Sistema',
    items: [
      { to: 'integraciones', label: 'Integraciones e importación', icon: Plug, perm: 'api.gestionar' },
      { to: 'emails', label: 'Emails enviados', icon: Mail, perm: 'cfg.gestionar' },
    ],
  },
];

export default function Config() {
  const { can } = useSession();
  const groups = ITEMS.map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) })).filter((g) => g.items.length);
  const first = groups[0]?.items[0]?.to ?? 'empresa';
  return (
    <>
      <PageHeader title="Configuración" icon={Settings} />
      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <nav className="scroll-thin -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-4 lg:px-0" aria-label="Secciones de configuración">
          {groups.map((g) => (
            <div key={g.grupo} className="contents lg:block">
              <p className="mb-1 hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-muted lg:block">{g.grupo}</p>
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  className={({ isActive }) => cn('flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-medium transition', isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-sunken hover:text-fg')}
                >
                  <i.icon className="h-4 w-4" />
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route index element={<Navigate to={first} replace />} />
              <Route path="empresa" element={<Empresa />} />
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
        </div>
      </div>
    </>
  );
}
