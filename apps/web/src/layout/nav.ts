import {
  BarChart3,
  Building2,
  ClipboardList,
  Contact,
  FileSignature,
  Home,
  Inbox,
  Megaphone,
  Network,
  Package,
  Settings,
  ShieldAlert,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { MODULES, PILLARS, type Pillar } from '@kite/shared';
import { moduleWebs } from '@/modules/registry';
import type { NavItem, QuickAction } from '@/modules/types';

export interface NavGroup {
  id: string;
  label: string;
  pillar?: Pillar;
  items: (NavItem & { module?: string })[];
}

/** Entradas del núcleo, siempre disponibles (según permisos). */
const CORE: Record<string, (NavItem & { module?: string })[]> = {
  general: [
    { label: 'Inicio', to: '/', icon: Home, end: true },
    { label: 'Bandeja', to: '/bandeja', icon: Inbox, badgeUrl: '/aprobaciones-contador' },
    { label: 'Tareas', to: '/tareas', icon: ClipboardList },
    { label: 'Tablón', to: '/tablon', icon: Megaphone },
  ],
  personas: [
    { label: 'Directorio', to: '/personas', icon: Users, perm: 'personas.ver' },
    { label: 'Organigrama', to: '/organigrama', icon: Network, perm: 'personas.ver' },
  ],
  comercial: [
    { label: 'Clientes y proveedores', to: '/terceros', icon: Building2, perm: 'terceros.ver' },
    { label: 'Contactos', to: '/contactos', icon: Contact, perm: 'terceros.ver' },
  ],
  operaciones: [{ label: 'Catálogo', to: '/catalogo', icon: Package, perm: ['catalogo.ver', 'cpr.solicitar'] }],
  finanzas: [],
  plataforma: [
    { label: 'Encuestas', to: '/encuestas', icon: Vote },
    { label: 'Firmas', to: '/firmas', icon: FileSignature, perm: 'doc.firmas' },
    { label: 'Canal de denuncias', to: '/denuncias', icon: ShieldAlert, perm: 'msg.denuncias' },
    { label: 'Configuración', to: '/config', icon: Settings, perm: ['cfg.gestionar', 'usr.gestionar', 'api.gestionar', 'auditoria.ver', 'doc.plantillas'] },
  ],
};

export function buildNav(has: (m: string) => boolean, can: (p: string | string[]) => boolean): NavGroup[] {
  const allowed = (i: NavItem) => !i.perm || can(i.perm);
  const groups: NavGroup[] = [{ id: 'general', label: 'General', items: CORE.general!.filter(allowed) }];
  for (const p of ['personas', 'comercial', 'operaciones', 'finanzas', 'plataforma'] as Pillar[]) {
    const items: (NavItem & { module?: string })[] = [];
    const mods = MODULES.filter((m) => m.pillar === p);
    const core = CORE[p] ?? [];
    // Los accesos del núcleo van primero en Comercial/Operaciones; en Plataforma al final
    if (p !== 'plataforma') items.push(...core.filter(allowed));
    for (const m of mods) {
      if (!has(m.code)) continue;
      const w = moduleWebs.find((x) => x.code === m.code);
      for (const n of w?.nav ?? []) if (allowed(n)) items.push({ ...n, module: m.code });
    }
    if (p === 'plataforma') items.push(...core.filter(allowed));
    if (items.length) groups.push({ id: p, label: PILLARS[p].label, pillar: p, items });
  }
  return groups;
}

export function quickActions(has: (m: string) => boolean, can: (p: string | string[]) => boolean): QuickAction[] {
  const out: QuickAction[] = [];
  for (const w of moduleWebs) if (has(w.code)) for (const q of w.quickCreate ?? []) if (!q.perm || can(q.perm)) out.push(q);
  if (can('terceros.gestionar')) out.push({ label: 'Cliente o proveedor', to: '/terceros?nuevo=1', icon: Building2 });
  return out;
}

export const BI_ICON: LucideIcon = BarChart3;
