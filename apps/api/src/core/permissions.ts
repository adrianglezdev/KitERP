import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { EMPLOYEE_BASE, MANAGER_IMPLICIT, PERMISSIONS, maxScope, scopeRank, type Scope } from '@kite/shared';
import { db } from '../db/client';
import { personas, rolPermisos, roles, usuarioPermisos } from '../db/schema';
import type { Ctx } from './context';
import { forbidden } from './errors';

interface PermCacheEntry {
  at: number;
  perms: Map<string, Scope>;
  isAdmin: boolean;
}
const cache = new Map<string, PermCacheEntry>();
const NO_AMPLIAR = new Set(['nom.ver', 'fic.sensible', 'nom.anticipos']);
const TTL = 30_000;

export function invalidatePermissions(usuarioEmpresaId?: string) {
  if (usuarioEmpresaId) cache.delete(usuarioEmpresaId);
  else cache.clear();
}

/** Calcula los permisos efectivos: rol + permisos sueltos + base de empleado + implícitos de responsable. */
export async function loadPermissions(ue: { id: string; rolId: string | null; personaId: string | null; empresaId: string }) {
  const hit = cache.get(ue.id);
  if (hit && Date.now() - hit.at < TTL) return hit;

  const perms = new Map<string, Scope>();
  const add = (k: string, s: Scope) => perms.set(k, maxScope(perms.get(k), s)!);
  let isAdmin = false;

  if (ue.rolId) {
    const [rol] = await db.select({ clave: roles.clave }).from(roles).where(eq(roles.id, ue.rolId));
    if (rol?.clave === 'admin') {
      isAdmin = true;
      for (const p of PERMISSIONS) perms.set(p.key, 'todo');
    } else {
      const rows = await db.select().from(rolPermisos).where(eq(rolPermisos.rolId, ue.rolId));
      for (const r of rows) add(r.permiso, r.alcance as Scope);
    }
  }
  const extra = await db.select().from(usuarioPermisos).where(eq(usuarioPermisos.usuarioEmpresaId, ue.id));
  for (const r of extra) add(r.permiso, r.alcance as Scope);

  if (ue.personaId) {
    for (const [k, s] of Object.entries(EMPLOYEE_BASE)) add(k, s);
    const [sub] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(personas)
      .where(and(eq(personas.responsableId, ue.personaId), eq(personas.activo, true), isNull(personas.archivadoEn)));
    if ((sub?.n ?? 0) > 0) {
      for (const [k, s] of Object.entries(MANAGER_IMPLICIT)) add(k, s);
      // Quien tiene equipo ve también lo de su equipo en todo lo que ve "lo suyo"
      // (salvo nóminas y datos sensibles, que siguen siendo personales).
      for (const [k, s] of perms) {
        if (s !== 'propio' || NO_AMPLIAR.has(k)) continue;
        if (PERMISSIONS.find((p) => p.key === k)?.scoped) perms.set(k, 'equipo');
      }
    }
  }

  const entry = { at: Date.now(), perms, isAdmin };
  cache.set(ue.id, entry);
  return entry;
}

/** Ids del equipo (la propia persona y todas las que dependen de ella en cualquier nivel). */
export async function teamOf(personaId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE equipo AS (
      SELECT id FROM personas WHERE id = ${personaId}
      UNION
      SELECT p.id FROM personas p JOIN equipo e ON p.responsable_id = e.id
    ) SELECT id FROM equipo`);
  return rows.map((r) => r.id);
}

export async function departmentOf(departamentoId: string | null, personaId: string | null): Promise<string[]> {
  if (!departamentoId) return personaId ? [personaId] : [];
  const rows = await db.select({ id: personas.id }).from(personas).where(eq(personas.departamentoId, departamentoId));
  const ids = rows.map((r) => r.id);
  if (personaId && !ids.includes(personaId)) ids.push(personaId);
  return ids;
}

export function scopeOf(ctx: Ctx, perm: string): Scope | undefined {
  return ctx.perms.get(perm);
}

export function can(ctx: Ctx, perm: string, min: Scope = 'propio'): boolean {
  return scopeRank(ctx.perms.get(perm)) >= scopeRank(min);
}

export function canAny(ctx: Ctx, perms: string[]): boolean {
  return perms.some((p) => ctx.perms.has(p));
}

export function need(ctx: Ctx, perm: string, min: Scope = 'propio'): void {
  if (!can(ctx, perm, min)) throw forbidden();
}

/** preHandler de Fastify: exige un permiso. */
export function guard(perm: string | string[], min: Scope = 'propio') {
  const list = Array.isArray(perm) ? perm : [perm];
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!list.some((p) => can(req.ctx, p, min))) throw forbidden();
  };
}

/**
 * Condición SQL que limita las filas al alcance del usuario.
 * `col` es la columna que indica la persona "dueña" de la fila (comercial, solicitante, técnico…).
 * Devuelve undefined si puede ver todo.
 */
export async function scopeWhere(ctx: Ctx, perm: string, col: PgColumn | SQL): Promise<SQL | undefined> {
  const s = ctx.perms.get(perm);
  if (!s) throw forbidden();
  return scopeCondition(ctx, s, col);
}

export async function scopeCondition(ctx: Ctx, s: Scope, col: PgColumn | SQL): Promise<SQL | undefined> {
  switch (s) {
    case 'todo':
      return undefined;
    case 'departamento': {
      const ids = await ctx.deptIds();
      return ids.length ? inArray(col as PgColumn, ids) : sql`false`;
    }
    case 'equipo': {
      const ids = await ctx.teamIds();
      return ids.length ? inArray(col as PgColumn, ids) : sql`false`;
    }
    case 'propio':
      return ctx.personaId ? eq(col as PgColumn, ctx.personaId) : sql`false`;
  }
}

/** ¿Puede actuar sobre una fila cuya persona dueña es `ownerId`? */
export async function canOnOwner(ctx: Ctx, perm: string, ownerId: string | null | undefined): Promise<boolean> {
  const s = ctx.perms.get(perm);
  if (!s) return false;
  if (s === 'todo') return true;
  if (!ownerId) return false;
  if (s === 'propio') return ownerId === ctx.personaId;
  if (s === 'equipo') return (await ctx.teamIds()).includes(ownerId);
  return (await ctx.deptIds()).includes(ownerId);
}

export async function needOnOwner(ctx: Ctx, perm: string, ownerId: string | null | undefined) {
  if (!(await canOnOwner(ctx, perm, ownerId))) throw forbidden();
}
