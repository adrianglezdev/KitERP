import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { ausShared } from '@kite/shared';
import type { DbOrTx } from '../../db/client';
import { festivos, personas } from '../../db/schema/core';
import { diaSemana, rangoDias } from '../hor/tiempo';
import { ausSaldos, ausSolicitudes, ausTipos } from './schema';

type SaldoResumen = ausShared.SaldoResumen;
export const ACTIVAS = ['pendiente', 'aprobada_responsable', 'aprobada'];
export const PENDIENTES = ['pendiente', 'aprobada_responsable'];

export async function festivosDe(tx: DbOrTx, empresaId: string, centroId: string | null, desde: string, hasta: string) {
  const rows = await tx
    .select({ fecha: festivos.fecha, nombre: festivos.nombre, centroId: festivos.centroId })
    .from(festivos)
    .where(and(eq(festivos.empresaId, empresaId), gte(festivos.fecha, desde), lte(festivos.fecha, hasta)));
  return rows.filter((f) => !f.centroId || f.centroId === centroId);
}

/** Días que cuenta una ausencia según el tipo (naturales o laborables, sin festivos). */
export async function contarDias(tx: DbOrTx, empresaId: string, personaId: string, unidad: string, desde: string, hasta: string, medioDia?: string | null) {
  if (hasta < desde) return 0;
  if (medioDia) return 0.5;
  if (unidad === 'naturales') return rangoDias(desde, hasta).length;
  const [p] = await tx.select({ centroId: personas.centroId }).from(personas).where(eq(personas.id, personaId));
  const fest = new Set((await festivosDe(tx, empresaId, p?.centroId ?? null, desde, hasta)).map((f) => f.fecha));
  return rangoDias(desde, hasta).filter((f) => diaSemana(f) <= 5 && !fest.has(f)).length;
}

/** Saldo de cada tipo que descuenta días, para una persona y año. */
export async function saldos(tx: DbOrTx, empresaId: string, personaId: string, anio: number): Promise<SaldoResumen[]> {
  const tipos = await tx.select().from(ausTipos).where(and(eq(ausTipos.empresaId, empresaId), eq(ausTipos.descuentaSaldo, true), eq(ausTipos.activo, true))).orderBy(asc(ausTipos.nombre));
  if (!tipos.length) return [];
  const asign = await tx.select().from(ausSaldos).where(and(eq(ausSaldos.personaId, personaId), eq(ausSaldos.anio, anio)));
  const usos = await tx
    .select({ tipoId: ausSolicitudes.tipoId, estado: ausSolicitudes.estado, dias: sql<number>`sum(${ausSolicitudes.dias})::float` })
    .from(ausSolicitudes)
    .where(and(eq(ausSolicitudes.personaId, personaId), inArray(ausSolicitudes.estado, ACTIVAS), sql`extract(year from ${ausSolicitudes.desde}) = ${anio}`))
    .groupBy(ausSolicitudes.tipoId, ausSolicitudes.estado);
  return tipos.map((t) => {
    const a = asign.find((x) => x.tipoId === t.id);
    const asignados = a ? Number(a.dias) : Number(t.diasAnuales ?? 0);
    const arrastre = Number(a?.arrastre ?? 0);
    const ajuste = Number(a?.ajuste ?? 0);
    const disfrutados = usos.filter((u) => u.tipoId === t.id && u.estado === 'aprobada').reduce((s, u) => s + u.dias, 0);
    const pendientes = usos.filter((u) => u.tipoId === t.id && PENDIENTES.includes(u.estado)).reduce((s, u) => s + u.dias, 0);
    return { tipoId: t.id, tipo: t.nombre, color: t.color, unidad: t.unidad, anio, asignados, arrastre, ajuste, disfrutados, pendientes, disponibles: Math.round((asignados + arrastre + ajuste - disfrutados - pendientes) * 10) / 10 };
  });
}

