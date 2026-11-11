import { and, eq, inArray } from 'drizzle-orm';
import { round } from '@kite/shared';
import type { Tx } from '../../db/client';
import { personas } from '../../db/schema/core';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { emit } from '../../core/events';
import { notify } from '../../core/notify';
import { nextCode } from '../../core/numbering';
import { canOnOwner } from '../../core/permissions';
import { gasGastos, gasLiquidaciones } from './schema';

export type Gasto = typeof gasGastos.$inferSelect;

export interface ImportesInput {
  tipo: string;
  total?: number | null;
  ivaTipo?: number | null;
  iva?: number | null;
  km?: number | null;
}

/** Calcula base, IVA y total: kilometraje = km × €/km de la empresa; dietas sin IVA; tickets con IVA incluido. */
export function calcularImportes(b: ImportesInput, precioKm: number) {
  if (b.tipo === 'kilometraje') {
    const km = round(Number(b.km) || 0, 1);
    if (km <= 0) throw badRequest('Indica los kilómetros');
    const total = round(km * precioKm);
    return { base: total, iva: 0, ivaTipo: 0, total, km, precioKm };
  }
  const total = round(Number(b.total) || 0);
  if (total <= 0) throw badRequest('Indica el importe del gasto');
  if (b.tipo === 'dieta') return { base: total, iva: 0, ivaTipo: 0, total, km: null, precioKm: null };
  let iva = b.iva !== null && b.iva !== undefined && b.iva !== ('' as unknown) ? round(Number(b.iva)) : null;
  const tipoIva = b.ivaTipo !== null && b.ivaTipo !== undefined ? Number(b.ivaTipo) : null;
  if (iva === null && tipoIva) iva = round(total - total / (1 + tipoIva / 100));
  iva = iva ?? 0;
  if (iva < 0 || iva >= total) throw badRequest('El IVA no puede ser mayor que el total');
  return { base: round(total - iva), iva, ivaTipo: tipoIva, total, km: null, precioKm: null };
}

export async function cargarGasto(tx: Tx, ctx: Ctx, id: string, opts: { forUpdate?: boolean } = {}) {
  const q = tx.select().from(gasGastos).where(and(eq(gasGastos.id, id), eq(gasGastos.empresaId, ctx.empresaId)));
  const [g] = opts.forUpdate ? await q.for('update') : await q;
  if (!g) throw notFound('Gasto no encontrado');
  return g;
}

export async function puedeVerGasto(ctx: Ctx, g: Pick<Gasto, 'personaId'>) {
  return g.personaId === ctx.personaId || (await canOnOwner(ctx, 'gas.ver', g.personaId)) || (await canOnOwner(ctx, 'gas.aprobar', g.personaId)) || ctx.perms.has('gas.liquidar');
}

/** Puede aprobar los gastos de su equipo (o de toda la empresa); nunca los suyos, salvo un administrador. */
export async function puedeAprobar(ctx: Ctx, personaId: string) {
  if (personaId === ctx.personaId && !ctx.isAdmin) return false;
  return canOnOwner(ctx, 'gas.aprobar', personaId);
}

const nombrePersona = async (tx: Tx, id: string) => {
  const [p] = await tx.select({ n: personas.nombre, a: personas.apellidos, r: personas.responsableId }).from(personas).where(eq(personas.id, id));
  return { nombre: p ? `${p.n} ${p.a ?? ''}`.trim() : 'Empleado', responsableId: p?.r ?? null };
};
const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

export async function enviarGasto(tx: Tx, ctx: Ctx, id: string) {
  const g = await cargarGasto(tx, ctx, id, { forUpdate: true });
  if (g.personaId !== ctx.personaId) throw forbidden('Solo quien registra el gasto puede enviarlo');
  if (!['borrador', 'rechazado'].includes(g.estado)) throw conflict('Este gasto ya está enviado');
  if ((g.tipo === 'ticket' || g.tipo === 'tarjeta') && !g.archivoId) throw badRequest('Añade la foto del ticket antes de enviarlo');
  await tx.update(gasGastos).set({ estado: 'enviado', enviadoEn: new Date(), motivoRechazo: null }).where(eq(gasGastos.id, id));
  const p = await nombrePersona(tx, g.personaId);
  await notify(tx, ctx, { modulo: 'gas', tipo: 'gasto_enviado', titulo: `Gasto por aprobar: ${p.nombre} · ${eur(g.total)}`, cuerpo: g.concepto || g.comercio || null, enlace: '/gastos/aprobar', personaIds: [p.responsableId] });
  await audit(tx, ctx, 'enviar', 'gas_gasto', id);
}

export async function aprobarGasto(tx: Tx, ctx: Ctx, id: string) {
  const g = await cargarGasto(tx, ctx, id, { forUpdate: true });
  if (!(await puedeAprobar(ctx, g.personaId))) throw forbidden('No puedes aprobar este gasto');
  if (g.estado !== 'enviado') throw conflict('El gasto no está pendiente de aprobar');
  await tx.update(gasGastos).set({ estado: 'aprobado', aprobadoPor: ctx.personaId, aprobadoEn: new Date() }).where(eq(gasGastos.id, id));
  await notify(tx, ctx, { modulo: 'gas', tipo: 'gasto_aprobado', titulo: `Gasto aprobado: ${eur(g.total)}`, cuerpo: `${g.concepto || g.comercio || ''}. Administración lo pagará en la próxima liquidación.`, enlace: '/gastos', personaIds: [g.personaId] });
  await notify(tx, ctx, { modulo: 'gas', tipo: 'gasto_por_liquidar', titulo: `Gasto aprobado pendiente de pagar · ${eur(g.total)}`, enlace: '/gastos/liquidar', permiso: 'gas.liquidar' });
  await audit(tx, ctx, 'aprobar', 'gas_gasto', id);
}

export async function rechazarGasto(tx: Tx, ctx: Ctx, id: string, motivo: string) {
  const g = await cargarGasto(tx, ctx, id, { forUpdate: true });
  if (!(await puedeAprobar(ctx, g.personaId))) throw forbidden('No puedes rechazar este gasto');
  if (!['enviado', 'aprobado'].includes(g.estado)) throw conflict('Este gasto ya no se puede rechazar');
  await tx.update(gasGastos).set({ estado: 'rechazado', motivoRechazo: motivo, aprobadoPor: ctx.personaId, aprobadoEn: new Date() }).where(eq(gasGastos.id, id));
  await notify(tx, ctx, { modulo: 'gas', tipo: 'gasto_rechazado', titulo: `Gasto rechazado: ${eur(g.total)}`, cuerpo: `Motivo: ${motivo}. Puedes corregirlo y volver a enviarlo.`, enlace: '/gastos', personaIds: [g.personaId] });
  await audit(tx, ctx, 'rechazar', 'gas_gasto', id, { motivo });
}

/** Liquidación por lotes: marca los gastos como pagados y publica gas.gasto_liquidado por cada uno (asiento contable). */
export async function liquidar(tx: Tx, ctx: Ctx, input: { ids: string[]; via: 'nomina' | 'transferencia'; fecha: string }) {
  const gs = await tx
    .select()
    .from(gasGastos)
    .where(and(inArray(gasGastos.id, input.ids), eq(gasGastos.empresaId, ctx.empresaId)))
    .for('update');
  if (gs.length !== input.ids.length) throw notFound('Algún gasto no existe');
  const malos = gs.filter((g) => g.estado !== 'aprobado');
  if (malos.length) throw conflict(`Solo se liquidan gastos aprobados (${malos.length} no lo están)`);
  const total = round(gs.reduce((a, g) => a + g.total, 0));
  const codigo = await nextCode(tx, ctx.empresaId, 'gas_liquidacion', 'LG', input.fecha);
  const [liq] = await tx
    .insert(gasLiquidaciones)
    .values({ empresaId: ctx.empresaId, codigo, fecha: input.fecha, via: input.via, total, numGastos: gs.length, creadoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId })
    .returning();
  for (const g of gs) {
    // los cargos de la tarjeta de empresa ya los pagó el banco: no se reembolsan al empleado
    const via = g.tipo === 'tarjeta' ? 'transferencia' : input.via;
    await tx.update(gasGastos).set({ estado: 'liquidado', liquidacionId: liq!.id, liquidacionVia: g.tipo === 'tarjeta' ? 'tarjeta' : input.via, fechaLiquidacion: input.fecha }).where(eq(gasGastos.id, g.id));
    await emit(tx, ctx, 'gas.gasto_liquidado', { gastoId: g.id, personaId: g.personaId, importe: g.total, iva: g.iva, fecha: input.fecha, via, proyectoId: g.proyectoId });
  }
  const porPersona = new Map<string, number>();
  for (const g of gs.filter((x) => x.tipo !== 'tarjeta')) porPersona.set(g.personaId, round((porPersona.get(g.personaId) ?? 0) + g.total));
  for (const [personaId, imp] of porPersona)
    await notify(tx, ctx, { modulo: 'gas', tipo: 'gasto_liquidado', titulo: `Te reembolsamos ${eur(imp)} de gastos`, cuerpo: input.via === 'nomina' ? 'Se incluye en tu próxima nómina.' : 'Recibirás una transferencia en los próximos días.', enlace: '/gastos', personaIds: [personaId] });
  await audit(tx, ctx, 'liquidar', 'gas_liquidacion', liq!.id, { codigo, via: input.via, total, gastos: gs.length });
  return { ...liq!, gastos: gs.length };
}
