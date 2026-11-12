/**
 * Aplicaciones de KiteERP.
 *
 * Cada módulo activo se presenta como una aplicación con su icono, al estilo del lanzador de Google:
 * se abre desde la cuadrícula de la cabecera, tiene sus propios apartados en la barra lateral y cada
 * persona elige cuáles quiere tener a mano como favoritas. Algunas aplicaciones juntan pantallas del
 * núcleo con las de un módulo (Equipo = directorio + ficha del trabajador).
 */
import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Boxes,
  Building,
  Building2,
  CalendarDays,
  CalendarHeart,
  ClipboardList,
  Clock,
  Contact,
  CreditCard,
  FileSignature,
  FileText,
  Hash,
  History,
  Home,
  Inbox,
  KanbanSquare,
  Landmark,
  LayoutGrid,
  Mail,
  MapPin,
  Megaphone,
  Network,
  Package,
  PackageCheck,
  Palette,
  Plug,
  Puzzle,
  Receipt,
  ReceiptEuro,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Target,
  Truck,
  UserPlus,
  Users,
  Vote,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { PILLARS, type Pillar } from '@kite/shared';
import { moduleWebs } from '@/modules/registry';
import type { NavItem, QuickAction } from '@/modules/types';

export interface AppItem extends NavItem {
  /** Subtítulo de grupo dentro de la aplicación (solo en las que tienen muchos apartados). */
  group?: string;
}

interface AppDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  pillar: Pillar;
  /** Pantallas del núcleo que pertenecen a esta aplicación. */
  core?: AppItem[];
  /** Módulos cuyos apartados se añaden (si están activos). */
  modules?: string[];
  /** Direcciones que también son de esta aplicación aunque no estén en el menú (fichas, detalle…). */
  extra?: string[];
}

export interface AppInfo {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  pillar: Pillar;
  pillarLabel: string;
  items: AppItem[];
  /** Pantalla con la que se abre. */
  home: string;
  extra: string[];
}

/** Secciones de Configuración (las usa también la propia pantalla para montar sus rutas). */
export const CONFIG_ITEMS: AppItem[] = [
  { group: 'Empresa', to: '/config/empresa', label: 'Datos y ajustes', icon: Building, perm: 'cfg.gestionar' },
  { group: 'Empresa', to: '/config/apariencia', label: 'Apariencia', icon: Palette, perm: 'cfg.gestionar' },
  { group: 'Empresa', to: '/config/modulos', label: 'Módulos', icon: Puzzle, perm: 'cfg.gestionar' },
  { group: 'Empresa', to: '/config/centros', label: 'Centros de trabajo', icon: MapPin, perm: 'cfg.gestionar' },
  { group: 'Empresa', to: '/config/departamentos', label: 'Departamentos', icon: Network, perm: ['cfg.gestionar', 'personas.gestionar'] },
  { group: 'Empresa', to: '/config/calendario', label: 'Calendario laboral', icon: CalendarHeart, perm: 'cfg.gestionar' },
  { group: 'Accesos', to: '/config/usuarios', label: 'Usuarios', icon: Users, perm: 'usr.gestionar' },
  { group: 'Accesos', to: '/config/roles', label: 'Roles y permisos', icon: ShieldCheck, perm: 'usr.gestionar' },
  { group: 'Accesos', to: '/config/auditoria', label: 'Registro de auditoría', icon: History, perm: 'auditoria.ver' },
  { group: 'Documentos', to: '/config/series', label: 'Series de numeración', icon: Hash, perm: 'cfg.gestionar' },
  { group: 'Documentos', to: '/config/formas-pago', label: 'Formas de pago', icon: CreditCard, perm: 'cfg.gestionar' },
  { group: 'Documentos', to: '/config/plantillas', label: 'Plantillas', icon: FileText, perm: 'doc.plantillas' },
  { group: 'Sistema', to: '/config/integraciones', label: 'Integraciones e importación', icon: Plug, perm: 'api.gestionar' },
  { group: 'Sistema', to: '/config/emails', label: 'Emails enviados', icon: Mail, perm: 'cfg.gestionar' },
];

const APPS: AppDef[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    description: 'Tu día: aprobaciones, tareas y avisos',
    icon: Home,
    pillar: 'plataforma',
    core: [
      { label: 'Inicio', to: '/', icon: Home, end: true },
      { label: 'Bandeja', to: '/bandeja', icon: Inbox, badgeUrl: '/aprobaciones-contador' },
      { label: 'Tareas', to: '/tareas', icon: ClipboardList },
      { label: 'Tablón', to: '/tablon', icon: Megaphone },
    ],
  },

  // ── Personas ──
  {
    id: 'equipo',
    label: 'Equipo',
    description: 'Directorio, organigrama y plantilla',
    icon: Users,
    pillar: 'personas',
    core: [
      { label: 'Directorio', to: '/personas', icon: Users, perm: 'personas.ver' },
      { label: 'Organigrama', to: '/organigrama', icon: Network, perm: 'personas.ver' },
    ],
    modules: ['fic'],
    extra: ['/mi-ficha'],
  },
  { id: 'hor', label: 'Fichaje', description: 'Jornada, turnos y cuadrantes', icon: Clock, pillar: 'personas', modules: ['hor'] },
  { id: 'aus', label: 'Ausencias', description: 'Vacaciones, permisos y calendario', icon: CalendarDays, pillar: 'personas', modules: ['aus'] },
  { id: 'nom', label: 'Nóminas', description: 'Recibos, variables y anticipos', icon: Wallet, pillar: 'personas', modules: ['nom'] },
  { id: 'alt', label: 'Talento', description: 'Selección, altas, bajas y evaluación', icon: UserPlus, pillar: 'personas', modules: ['alt'] },
  { id: 'por', label: 'Mi portal', description: 'Lo tuyo, en una pantalla', icon: Smartphone, pillar: 'personas', modules: ['por'] },

  // ── Comercial ──
  {
    id: 'clientes',
    label: 'Clientes',
    description: 'Clientes, proveedores y contactos',
    icon: Building2,
    pillar: 'comercial',
    core: [
      { label: 'Clientes y proveedores', to: '/terceros', icon: Building2, perm: 'terceros.ver' },
      { label: 'Contactos', to: '/contactos', icon: Contact, perm: 'terceros.ver' },
    ],
    modules: ['crm'],
  },
  { id: 'opo', label: 'Oportunidades', description: 'Embudo de ventas y previsión', icon: Target, pillar: 'comercial', modules: ['opo'] },
  { id: 'pre', label: 'Presupuestos', description: 'Ofertas con margen y aceptación online', icon: FileSignature, pillar: 'comercial', modules: ['pre'] },
  { id: 'ped', label: 'Pedidos', description: 'Pedidos, preparación y albaranes', icon: PackageCheck, pillar: 'comercial', modules: ['ped'] },
  { id: 'fac', label: 'Facturas', description: 'Facturación, Verifactu y recurrentes', icon: Receipt, pillar: 'comercial', modules: ['fac'] },

  // ── Operaciones ──
  {
    id: 'stk',
    label: 'Almacén',
    description: 'Catálogo, stock e inventarios',
    icon: Boxes,
    pillar: 'operaciones',
    core: [{ label: 'Catálogo', to: '/catalogo', icon: Package, perm: ['catalogo.ver', 'cpr.solicitar'] }],
    modules: ['stk'],
  },
  { id: 'cpr', label: 'Compras', description: 'Solicitudes, pedidos y recepciones', icon: ShoppingCart, pillar: 'operaciones', modules: ['cpr'] },
  { id: 'pry', label: 'Proyectos', description: 'Tareas, horas y rentabilidad', icon: KanbanSquare, pillar: 'operaciones', modules: ['pry'] },
  { id: 'sat', label: 'Servicio técnico', description: 'Tickets, órdenes y contratos', icon: Wrench, pillar: 'operaciones', modules: ['sat'] },
  { id: 'act', label: 'Activos', description: 'Maquinaria, flota y vencimientos', icon: Truck, pillar: 'operaciones', modules: ['act'] },
  { id: 'dtc', label: 'Doc. técnica', description: 'Manuales y procedimientos', icon: BookOpenCheck, pillar: 'operaciones', modules: ['dtc'] },

  // ── Finanzas ──
  { id: 'tes', label: 'Tesorería', description: 'Cobros, pagos, remesas y banco', icon: Landmark, pillar: 'finanzas', modules: ['tes'] },
  { id: 'cnt', label: 'Contabilidad', description: 'Asientos, libros y modelos', icon: BookOpen, pillar: 'finanzas', modules: ['cnt'] },
  { id: 'gas', label: 'Gastos', description: 'Tickets, kilometraje y dietas', icon: ReceiptEuro, pillar: 'finanzas', modules: ['gas'] },
  { id: 'bi', label: 'Informes', description: 'Panel de dirección e informes', icon: BarChart3, pillar: 'finanzas', modules: ['bi'] },

  // ── Plataforma ──
  {
    id: 'utilidades',
    label: 'Utilidades',
    description: 'Encuestas, firmas y canal de denuncias',
    icon: Vote,
    pillar: 'plataforma',
    core: [
      { label: 'Encuestas', to: '/encuestas', icon: Vote },
      { label: 'Firmas', to: '/firmas', icon: FileSignature, perm: 'doc.firmas' },
      { label: 'Canal de denuncias', to: '/denuncias', icon: ShieldAlert, perm: 'msg.denuncias' },
    ],
  },
  { id: 'config', label: 'Configuración', description: 'Empresa, apariencia, módulos y accesos', icon: Settings, pillar: 'plataforma', core: CONFIG_ITEMS },
];

/** Aplicaciones a las que puede entrar la persona, con los apartados que le corresponden. */
export function buildApps(has: (m: string) => boolean, can: (p: string | string[]) => boolean): AppInfo[] {
  const allowed = (i: NavItem) => !i.perm || can(i.perm);
  const out: AppInfo[] = [];
  for (const a of APPS) {
    const items: AppItem[] = (a.core ?? []).filter(allowed);
    for (const code of a.modules ?? []) {
      if (!has(code)) continue;
      const w = moduleWebs.find((x) => x.code === code);
      for (const n of w?.nav ?? []) if (allowed(n)) items.push(n);
    }
    if (!items.length) continue;
    out.push({ id: a.id, label: a.label, description: a.description, icon: a.icon, pillar: a.pillar, pillarLabel: PILLARS[a.pillar].label, items, home: items[0]!.to, extra: a.extra ?? [] });
  }
  return out;
}

const pathOf = (to: string) => to.split('?')[0]!;
const under = (path: string, base: string) => path === base || path.startsWith(base + '/');

/** Aplicación y apartado a los que pertenece una dirección (el prefijo más largo gana). */
export function locate(apps: AppInfo[], pathname: string): { app: AppInfo; item: AppItem | null } | null {
  let best: { app: AppInfo; item: AppItem | null; len: number } | null = null;
  for (const app of apps) {
    for (const item of app.items) {
      const p = pathOf(item.to);
      const hit = p === '/' ? pathname === '/' : under(pathname, p);
      if (hit && (!best || p.length > best.len)) best = { app, item, len: p.length };
    }
    for (const p of app.extra) if (under(pathname, p) && (!best || p.length > best.len)) best = { app, item: null, len: p.length };
  }
  return best && { app: best.app, item: best.item };
}

/** Orden en el que se proponen las favoritas a quien todavía no ha elegido las suyas. */
const SUGERIDAS = ['hor', 'aus', 'clientes', 'pre', 'fac', 'sat', 'stk', 'pry', 'gas', 'equipo', 'nom', 'tes', 'cpr', 'bi', 'por'];
export const MAX_SUGERIDAS = 6;

/** Favoritas de la persona (las guardadas que siguen disponibles) o, si no ha elegido, las propuestas. */
export function favoriteIds(apps: AppInfo[], saved: string[] | undefined): string[] {
  const ids = new Set(apps.map((a) => a.id));
  if (saved) return saved.filter((id) => ids.has(id) && id !== 'inicio');
  return SUGERIDAS.filter((id) => ids.has(id)).slice(0, MAX_SUGERIDAS);
}

export function quickActions(has: (m: string) => boolean, can: (p: string | string[]) => boolean): QuickAction[] {
  const out: QuickAction[] = [];
  for (const w of moduleWebs) if (has(w.code)) for (const q of w.quickCreate ?? []) if (!q.perm || can(q.perm)) out.push(q);
  if (can('terceros.gestionar')) out.push({ label: 'Cliente o proveedor', to: '/terceros?nuevo=1', icon: Building2 });
  return out;
}

export const ALL_APPS_ICON: LucideIcon = LayoutGrid;
