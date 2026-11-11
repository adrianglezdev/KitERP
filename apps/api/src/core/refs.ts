import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ResourceDef } from '@kite/shared';
import { db } from '../db/client';
import type { Ctx } from './context';
import { can, scopeCondition } from './permissions';

/**
 * Destinos de los selectores de referencia (persona, cliente, artículo…).
 * Cada módulo puede registrar los suyos en ModuleDef.refTargets.
 */
export interface RefTarget {
  table: PgTable;
  id: PgColumn;
  label: SQL;
  sub?: SQL;
  search: (PgColumn | SQL)[];
  empresaCol?: PgColumn;
  archivedCol?: PgColumn;
  /** Permiso necesario para buscar (si no se indica, cualquier usuario de la empresa). */
  perm?: string | string[];
  /** Columna de la persona dueña para limitar por alcance. */
  scopeCol?: PgColumn;
  where?: (ctx: Ctx, filter: Record<string, string>) => SQL | undefined;
  /** Columnas permitidas como filtro (?f.terceroId=…) */
  filterCols?: Record<string, PgColumn>;
  module?: string;
  order?: PgColumn | SQL;
}

const targets = new Map<string, RefTarget>();

export function registerRefTarget(name: string, t: RefTarget) {
  targets.set(name, t);
}
export function getRefTarget(name: string) {
  return targets.get(name);
}

export async function searchRefs(ctx: Ctx, name: string, q: string, ids: string[] | null, filter: Record<string, string>, limit = 20) {
  const t = targets.get(name);
  if (!t) return [];
  if (t.module && !ctx.modules.has(t.module)) return [];
  const perms = t.perm ? (Array.isArray(t.perm) ? t.perm : [t.perm]) : [];
  if (perms.length && !perms.some((p) => can(ctx, p))) return [];

  const conds: (SQL | undefined)[] = [];
  if (t.empresaCol) conds.push(eq(t.empresaCol, ctx.empresaId));
  if (t.archivedCol && !ids) conds.push(isNull(t.archivedCol));
  if (ids) conds.push(inArray(t.id, ids));
  if (q && !ids) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    conds.push(or(...t.search.map((c) => ilike(c as PgColumn, like))));
  }
  if (t.where) conds.push(t.where(ctx, filter));
  if (t.filterCols) for (const [k, col] of Object.entries(t.filterCols)) if (filter[k]) conds.push(eq(col, filter[k]));
  if (t.scopeCol && perms.length && !ids) {
    const scope = perms.map((p) => ctx.perms.get(p)).find(Boolean);
    if (scope) conds.push(await scopeCondition(ctx, scope, t.scopeCol));
  }
  const rows = await db
    .select({ id: t.id, label: t.label, sub: t.sub ?? sql<string | null>`null` })
    .from(t.table)
    .where(and(...conds.filter(Boolean)))
    .orderBy(t.order ?? asc(t.label))
    .limit(ids ? Math.max(ids.length, 1) : limit);
  return rows as { id: string; label: string; sub: string | null }[];
}

/** Etiquetas de todas las referencias de una lista de filas, agrupadas por destino. */
export async function resolveRefs(ctx: Ctx, def: Pick<ResourceDef, 'fields'>, items: Record<string, any>[]) {
  const byTarget = new Map<string, Set<string>>();
  for (const [k, f] of Object.entries(def.fields)) {
    if ((f.type !== 'ref' && f.type !== 'refs') || !f.ref) continue;
    const set = byTarget.get(f.ref) ?? new Set<string>();
    for (const it of items) {
      const v = it[k];
      if (Array.isArray(v)) v.forEach((x) => x && set.add(x));
      else if (v) set.add(v);
    }
    byTarget.set(f.ref, set);
  }
  const refs: Record<string, Record<string, string>> = {};
  for (const [target, set] of byTarget) {
    if (!set.size) continue;
    const t = targets.get(target);
    if (!t) continue;
    const rows = await db
      .select({ id: t.id, label: t.label })
      .from(t.table)
      .where(inArray(t.id, [...set]));
    refs[target] = Object.fromEntries(rows.map((r) => [r.id as string, r.label as string]));
  }
  return refs;
}

export function listTargets() {
  return [...targets.keys()];
}
