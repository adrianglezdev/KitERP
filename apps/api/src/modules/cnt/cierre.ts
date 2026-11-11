import { and, eq, inArray, sql } from 'drizzle-orm';
import { round } from '@kite/shared';
import type { Tx } from '../../db/client';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { conflict, forbidden, notFound } from '../../core/errors';
import { cntApuntes, cntAsientos, cntEjercicios } from './schema';
import { crearAsiento, ensureEjercicio, type LineaAsiento } from './service';

async function saldosEjercicio(tx: Tx, empresaId: string, anio: number, excluir: string[] = []) {
  const rows = await tx
    .select({ cuentaId: cntApuntes.cuentaId, cuenta: cntApuntes.cuenta, s: sql<string>`sum(${cntApuntes.debe} - ${cntApuntes.haber})` })
    .from(cntApuntes)
    .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
    .innerJoin(cntEjercicios, eq(cntEjercicios.id, cntAsientos.ejercicioId))
    .where(and(eq(cntAsientos.empresaId, empresaId), eq(cntEjercicios.anio, anio), excluir.length ? sql`${cntAsientos.origen} NOT IN (${sql.join(excluir.map((e) => sql`${e}`), sql`, `)})` : undefined))
    .groupBy(cntApuntes.cuentaId, cntApuntes.cuenta);
  return rows.map((r) => ({ cuentaId: r.cuentaId, cuenta: r.cuenta, saldo: round(Number(r.s)) })).filter((r) => r.saldo !== 0);
}

/** Saldar una lista de cuentas: cada saldo deudor va al haber y cada acreedor al debe. */
const saldar = (rows: { cuentaId: string; saldo: number }[], concepto: string): LineaAsiento[] =>
  rows.map((r) => (r.saldo > 0 ? { cuentaId: r.cuentaId, haber: r.saldo, concepto } : { cuentaId: r.cuentaId, debe: -r.saldo, concepto }));

/**
 * Cierre del ejercicio:
 *  1. Regularización: los grupos 6 y 7 se saldan contra 129 (resultado del ejercicio).
 *  2. Cierre: se saldan todas las cuentas de balance (grupos 1 a 5).
 *  3. Apertura del ejercicio siguiente con los saldos inversos del cierre.
 *  4. El ejercicio queda cerrado: ningún asiento suyo se puede crear, cambiar ni borrar.
 */
export async function cerrarEjercicio(tx: Tx, ctx: Ctx, anio: number) {
  const ej = await ensureEjercicio(tx, ctx.empresaId, anio);
  const [locked] = await tx.select().from(cntEjercicios).where(eq(cntEjercicios.id, ej.id)).for('update');
  if (locked!.estado === 'cerrado') throw conflict(`El ejercicio ${anio} ya está cerrado`);
  const [anterior] = await tx.select().from(cntEjercicios).where(and(eq(cntEjercicios.empresaId, ctx.empresaId), eq(cntEjercicios.anio, anio - 1)));
  if (anterior && anterior.estado !== 'cerrado') {
    const [hay] = await tx.select({ id: cntAsientos.id }).from(cntAsientos).where(eq(cntAsientos.ejercicioId, anterior.id)).limit(1);
    if (hay) throw conflict(`Cierra antes el ejercicio ${anio - 1}`);
  }
  const fin = `${anio}-12-31`;
  const ya = await tx.select({ id: cntAsientos.id }).from(cntAsientos).where(and(eq(cntAsientos.ejercicioId, ej.id), inArray(cntAsientos.origen, ['regularizacion', 'cierre'])));
  if (ya.length) throw conflict('Este ejercicio ya tiene asientos de regularización o cierre');

  // 1. Regularización
  const pyg = (await saldosEjercicio(tx, ctx.empresaId, anio)).filter((r) => /^[67]/.test(r.cuenta));
  let resultado = 0;
  if (pyg.length) {
    resultado = round(-pyg.reduce((a, r) => a + r.saldo, 0)); // positivo = beneficio
    const lineas = saldar(pyg, 'Regularización');
    lineas.push(resultado >= 0 ? { cuenta: '1290000', haber: resultado, concepto: 'Resultado del ejercicio' } : { cuenta: '1290000', debe: -resultado, concepto: 'Resultado del ejercicio' });
    await crearAsiento(tx, ctx, { fecha: fin, concepto: `Regularización del ejercicio ${anio}`, origen: 'regularizacion', refClave: String(anio), lineas });
  }
  // 2. Cierre
  const balance = (await saldosEjercicio(tx, ctx.empresaId, anio)).filter((r) => /^[1-5]/.test(r.cuenta));
  let cierreId: string | null = null;
  if (balance.length) {
    const { asiento } = await crearAsiento(tx, ctx, { fecha: fin, concepto: `Cierre del ejercicio ${anio}`, origen: 'cierre', refClave: String(anio), lineas: saldar(balance, 'Cierre') });
    cierreId = asiento.id;
  }
  // 3. Apertura del siguiente
  let aperturaId: string | null = null;
  if (balance.length) {
    const sig = await ensureEjercicio(tx, ctx.empresaId, anio + 1);
    if (sig.estado === 'cerrado') throw conflict(`El ejercicio ${anio + 1} está cerrado`);
    const lineas: LineaAsiento[] = balance.map((r) => (r.saldo > 0 ? { cuentaId: r.cuentaId, debe: r.saldo, concepto: 'Apertura' } : { cuentaId: r.cuentaId, haber: -r.saldo, concepto: 'Apertura' }));
    const { asiento } = await crearAsiento(tx, ctx, { fecha: `${anio + 1}-01-01`, concepto: `Apertura del ejercicio ${anio + 1}`, origen: 'apertura', refClave: String(anio + 1), lineas });
    aperturaId = asiento.id;
  }
  // 4. Cerrar
  await tx.update(cntEjercicios).set({ estado: 'cerrado', cerradoEn: new Date(), cerradoPor: ctx.usuarioId }).where(eq(cntEjercicios.id, ej.id));
  await audit(tx, ctx, 'cerrar', 'cnt_ejercicio', ej.id, { anio, resultado, cierreId, aperturaId });
  return { anio, resultado, cierreId, aperturaId };
}

/** Reapertura (solo administradores): se deshacen regularización, cierre y la apertura del año siguiente. */
export async function reabrirEjercicio(tx: Tx, ctx: Ctx, anio: number, motivo: string) {
  if (!ctx.isAdmin) throw forbidden('Solo un administrador puede reabrir un ejercicio cerrado');
  const [ej] = await tx.select().from(cntEjercicios).where(and(eq(cntEjercicios.empresaId, ctx.empresaId), eq(cntEjercicios.anio, anio))).for('update');
  if (!ej) throw notFound('Ejercicio no encontrado');
  if (ej.estado !== 'cerrado') throw conflict(`El ejercicio ${anio} no está cerrado`);
  const [sig] = await tx.select().from(cntEjercicios).where(and(eq(cntEjercicios.empresaId, ctx.empresaId), eq(cntEjercicios.anio, anio + 1)));
  if (sig?.estado === 'cerrado') throw conflict(`Reabre antes el ejercicio ${anio + 1}`);
  if (sig) await tx.delete(cntAsientos).where(and(eq(cntAsientos.ejercicioId, sig.id), eq(cntAsientos.origen, 'apertura'), eq(cntAsientos.refClave, String(anio + 1))));
  await tx.update(cntEjercicios).set({ estado: 'abierto', cerradoEn: null, cerradoPor: null }).where(eq(cntEjercicios.id, ej.id));
  await tx.delete(cntAsientos).where(and(eq(cntAsientos.ejercicioId, ej.id), inArray(cntAsientos.origen, ['regularizacion', 'cierre'])));
  await audit(tx, ctx, 'reabrir', 'cnt_ejercicio', ej.id, { anio, motivo });
  return { anio };
}
