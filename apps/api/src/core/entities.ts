import type { Ctx } from './context';

/**
 * Entidades a las que se pueden adjuntar archivos, comentarios y tareas.
 * Cada módulo registra cómo se comprueba el acceso a las suyas, para que
 * comentarios y adjuntos respeten exactamente los mismos permisos que la ficha.
 */
export interface EntityGuard {
  label: string;
  module: string;
  canView: (ctx: Ctx, id: string) => Promise<boolean>;
  canEdit?: (ctx: Ctx, id: string) => Promise<boolean>;
  /** Título del registro (para notificaciones). */
  title?: (id: string) => Promise<string | null>;
  /** Ruta de la web para abrir el registro. */
  url?: (id: string) => string;
  /** Personas interesadas en novedades (dueño, responsable…). */
  watchers?: (id: string) => Promise<string[]>;
}

const guards = new Map<string, EntityGuard>();

export function registerEntity(name: string, g: EntityGuard) {
  guards.set(name, g);
}

export function entityGuard(name: string) {
  return guards.get(name);
}

export async function canViewEntity(ctx: Ctx, entidad: string, id: string) {
  const g = guards.get(entidad);
  if (!g) return ctx.isAdmin;
  if (!ctx.modules.has(g.module) && g.module !== 'core') return false;
  return g.canView(ctx, id);
}

export async function canEditEntity(ctx: Ctx, entidad: string, id: string) {
  const g = guards.get(entidad);
  if (!g) return ctx.isAdmin;
  if (!ctx.modules.has(g.module) && g.module !== 'core') return false;
  return (g.canEdit ?? g.canView)(ctx, id);
}
