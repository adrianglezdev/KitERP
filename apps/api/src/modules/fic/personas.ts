import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, type DbOrTx } from '../../db/client';
import { departamentos, personas } from '../../db/schema/core';
import type { Ctx } from '../../core/context';
import { forbidden } from '../../core/errors';
import { canOnOwner } from '../../core/permissions';

/** Utilidades de personas compartidas por los módulos del pilar Personas. */

export const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

/** Ids de las personas que el usuario puede ver con un permiso (null = todas). */
export async function idsEnAlcance(ctx: Ctx, perm: string): Promise<string[] | null> {
  const s = ctx.perms.get(perm);
  if (!s) return [];
  if (s === 'todo') return null;
  if (s === 'propio') return ctx.personaId ? [ctx.personaId] : [];
  if (s === 'equipo') return ctx.teamIds();
  return ctx.deptIds();
}

/** Condición SQL para limitar una columna de persona al alcance. */
export async function condAlcance(ctx: Ctx, perm: string, col: PgColumn | SQL): Promise<SQL | undefined> {
  const ids = await idsEnAlcance(ctx, perm);
  if (ids === null) return undefined;
  if (!ids.length) return sql`false`;
  return inArray(col as PgColumn, ids);
}

export async function exigirPersona(ctx: Ctx, perm: string, personaId: string | null | undefined, msg = 'No puedes ver los datos de esta persona') {
  if (!personaId || !(await canOnOwner(ctx, perm, personaId))) throw forbidden(msg);
}

export interface PersonaInfo {
  id: string;
  nombre: string;
  departamentoId: string | null;
  departamento: string | null;
  centroId: string | null;
  responsableId: string | null;
  puesto: string | null;
  email: string | null;
  activo: boolean;
}

/** Personas activas de la empresa (opcionalmente solo algunas). */
export async function personasActivas(tx: DbOrTx, empresaId: string, ids?: string[] | null, incluirInactivas = false): Promise<PersonaInfo[]> {
  if (ids && !ids.length) return [];
  return tx
    .select({
      id: personas.id,
      nombre: nombrePersona,
      departamentoId: personas.departamentoId,
      departamento: departamentos.nombre,
      centroId: personas.centroId,
      responsableId: personas.responsableId,
      puesto: personas.puesto,
      email: personas.email,
      activo: personas.activo,
    })
    .from(personas)
    .leftJoin(departamentos, eq(departamentos.id, personas.departamentoId))
    .where(and(eq(personas.empresaId, empresaId), isNull(personas.archivadoEn), incluirInactivas ? undefined : eq(personas.activo, true), ids ? inArray(personas.id, ids) : undefined))
    .orderBy(nombrePersona);
}

export async function personaPorId(tx: DbOrTx, empresaId: string, id: string): Promise<PersonaInfo | null> {
  const [p] = await personasActivas(tx, empresaId, [id], true);
  return p ?? null;
}

export async function nombreDe(tx: DbOrTx, id: string | null | undefined): Promise<string> {
  if (!id) return '';
  const [p] = await tx.select({ n: nombrePersona }).from(personas).where(eq(personas.id, id));
  return p?.n ?? '';
}

/** Mapa id → nombre para pintar listados. */
export async function nombres(tx: DbOrTx, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  if (!list.length) return {};
  const rows = await tx.select({ id: personas.id, n: nombrePersona }).from(personas).where(inArray(personas.id, list));
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

export const _db = db;
