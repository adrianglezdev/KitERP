import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { calcVencimientos, round } from '@kite/shared';
import type { DbOrTx, Tx } from '../../db/client';
import { empresas, formasPago, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/errors';
import { emit } from '../../core/events';
import { tesCuentas, tesPagos, tesRemesas, tesVencimientos } from './schema';

export type Vencimiento = typeof tesVencimientos.$inferSelect;
export const EPS = 0.005;

export const pendienteDe = (v: { importe: number; importePagado: number }) => round(v.importe - v.importePagado);

/* ───────────── Cuentas de tesorería ───────────── */

/** Siguiente subcuenta libre para un banco (5720001…) o una caja (5700001…). */
export async function siguienteCuentaContable(tx: DbOrTx, empresaId: string, tipo: string) {
  const pref = tipo === 'caja' ? '570' : '572';
  const rows = await tx.select({ c: tesCuentas.cuentaContable }).from(tesCuentas).where(eq(tesCuentas.empresaId, empresaId));
  const max = rows.map((r) => r.c).filter((c) => c.startsWith(pref) && c.length === 7).map((c) => Number(c.slice(3))).reduce((a, b) => Math.max(a, b), 0);
  return `${pref}${String(max + 1).padStart(4, '0')}`;
}

/** Cuenta por defecto; si la empresa aún no tiene ninguna, se crea a partir de su IBAN. */
export async function cuentaPorDefecto(tx: Tx, ctx: Ctx) {
  const rows = await tx
    .select()
    .from(tesCuentas)
    .where(and(eq(tesCuentas.empresaId, ctx.empresaId), eq(tesCuentas.activo, true), sql`${tesCuentas.archivadoEn} IS NULL`))
    .orderBy(desc(tesCuentas.porDefecto), asc(tesCuentas.creadoEn));
  const banco = rows.find((r) => r.porDefecto) ?? rows.find((r) => r.tipo === 'banco') ?? rows[0];
  if (banco) return banco;
  const [emp] = await tx.select().from(empresas).where(eq(empresas.id, ctx.empresaId));
  const [c] = await tx
    .insert(tesCuentas)
    .values({ empresaId: ctx.empresaId, nombre: 'Banco principal', tipo: 'banco', iban: emp?.iban ?? null, bic: emp?.bic ?? null, cuentaContable: '5720001', sufijoSepa: emp?.sufijoSepa ?? '000', porDefecto: true })
    .returning();
  await audit(tx, ctx, 'crear', 'tes_cuenta', c!.id, { nombre: c!.nombre, automatica: true });
  return c!;
}

/* ───────────── Vencimientos desde documentos ───────────── */

/**
 * Crea los vencimientos de una factura emitida (cobro) o registrada (pago) según los plazos de su forma de pago
 * y el día de pago fijo del tercero. Es idempotente: si ya existen, no hace nada.
 */
export async function crearVencimientosDocumento(tx: Tx, ctx: Ctx, documentoId: string, circuito: 'cobro' | 'pago') {
  const existentes = await tx.select({ id: tesVencimientos.id }).from(tesVencimientos).where(eq(tesVencimientos.documentoId, documentoId)).limit(1);
  if (existentes.length) return [];
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, documentoId));
  if (!d || !d.total) return [];
  const [t] = await tx.select().from(terceros).where(eq(terceros.id, d.terceroId));
  const fpId = d.formaPagoId ?? t?.formaPagoId ?? null;
  const [fp] = fpId ? await tx.select().from(formasPago).where(eq(formasPago.id, fpId)) : [];
  const plazos = fp?.plazos?.length ? fp.plazos : [{ dias: 0, porcentaje: 100 }];
  const reparto = calcVencimientos(d.total, d.fecha, plazos, t?.diaPago ?? null);
  const n = reparto.length;
  const rows = await tx
    .insert(tesVencimientos)
    .values(
      reparto.map((r, i) => ({
        empresaId: ctx.empresaId,
        circuito,
        documentoId,
        terceroId: d.terceroId,
        plazo: i + 1,
        concepto: `${circuito === 'cobro' ? 'Factura' : 'Factura proveedor'} ${d.codigo ?? ''}${d.referenciaExterna && circuito === 'pago' ? ` (${d.referenciaExterna})` : ''}${n > 1 ? ` · plazo ${i + 1}/${n}` : ''}`.trim(),
        fecha: r.fecha,
        importe: r.importe,
        formaPagoTipo: fp?.tipo ?? 'transferencia',
      })),
    )
    .returning();
  await audit(tx, ctx, 'crear_vencimientos', 'documento', documentoId, { circuito, plazos: rows.map((r) => ({ fecha: r.fecha, importe: r.importe })) });
  return rows;
}

/* ───────────── Estados ───────────── */

/** Recalcula lo pagado y el estado de un vencimiento a partir de sus pagos. */
export async function recalcVencimiento(tx: Tx, id: string, forzar?: 'devuelto' | 'impagado') {
  const [v] = await tx.select().from(tesVencimientos).where(eq(tesVencimientos.id, id)).for('update');
  if (!v) throw notFound('Vencimiento no encontrado');
  const [s] = await tx.select({ s: sql<string>`coalesce(sum(${tesPagos.importe}), 0)` }).from(tesPagos).where(eq(tesPagos.vencimientoId, id));
  const pagado = round(Number(s?.s ?? 0));
  const pend = round(v.importe - pagado);
  let estado: string;
  if (forzar) estado = forzar;
  else if (Math.abs(pend) < EPS) estado = 'pagado';
  else if (Math.abs(pagado) >= EPS) estado = 'parcial';
  else if (['devuelto', 'impagado'].includes(v.estado)) estado = v.estado;
  else if (v.remesaId) {
    const [r] = await tx.select({ e: tesRemesas.estado }).from(tesRemesas).where(eq(tesRemesas.id, v.remesaId));
    estado = r && r.e !== 'cobrada' ? 'remesado' : 'pendiente';
  } else estado = 'pendiente';
  const [upd] = await tx.update(tesVencimientos).set({ importePagado: pagado, estado }).where(eq(tesVencimientos.id, id)).returning();
  if (v.documentoId) await syncEstadoPago(tx, v.documentoId);
  return upd!;
}

/** Mantiene documentos.estado_pago (núcleo) a partir de sus vencimientos. */
export async function syncEstadoPago(tx: Tx, documentoId: string) {
  const vs = await tx.select().from(tesVencimientos).where(eq(tesVencimientos.documentoId, documentoId));
  if (!vs.length) return;
  let estado: string;
  if (vs.every((v) => v.estado === 'pagado')) estado = 'pagado';
  else if (vs.some((v) => v.estado === 'impagado' || v.estado === 'devuelto')) estado = 'impagado';
  else if (vs.some((v) => Math.abs(v.importePagado) >= EPS)) estado = 'parcial';
  else estado = 'pendiente';
  await tx.update(documentos).set({ estadoPago: estado }).where(and(eq(documentos.id, documentoId), sql`${documentos.estadoPago} IS DISTINCT FROM ${estado}`));
}

/* ───────────── Cobros y pagos ───────────── */

export interface PagoInput {
  vencimientoId: string;
  importe?: number | null; // por defecto, todo lo pendiente
  fecha: string;
  cuentaId?: string | null;
  medio?: string;
  remesaId?: string | null;
  notas?: string | null;
}

/**
 * Registra un cobro o pago contra un vencimiento, recalcula estados y publica
 * tes.cobro_registrado / tes.pago_registrado con la subcuenta del banco (para el asiento).
 */
export async function registrarPago(tx: Tx, ctx: Ctx, input: PagoInput) {
  const [v] = await tx
    .select()
    .from(tesVencimientos)
    .where(and(eq(tesVencimientos.id, input.vencimientoId), eq(tesVencimientos.empresaId, ctx.empresaId)))
    .for('update');
  if (!v) throw notFound('Vencimiento no encontrado');
  const pend = pendienteDe(v);
  const importe = round(input.importe ?? pend);
  const medio = input.medio ?? 'transferencia';
  if (Math.abs(importe) < EPS) throw badRequest('El importe no puede ser cero');
  if (medio !== 'devolucion') {
    if (Math.sign(importe) !== Math.sign(v.importe)) throw badRequest('El importe debe tener el mismo signo que el vencimiento');
    if (Math.abs(importe) - Math.abs(pend) > EPS) throw conflict(`El importe supera lo pendiente (${pend.toFixed(2).replace('.', ',')} €)`);
  }
  let cuenta: typeof tesCuentas.$inferSelect | null = null;
  if (medio !== 'compensacion') {
    if (input.cuentaId) {
      [cuenta] = await tx.select().from(tesCuentas).where(and(eq(tesCuentas.id, input.cuentaId), eq(tesCuentas.empresaId, ctx.empresaId)));
      if (!cuenta) throw badRequest('La cuenta bancaria no existe');
    } else cuenta = await cuentaPorDefecto(tx, ctx);
  }
  const [p] = await tx
    .insert(tesPagos)
    .values({
      empresaId: ctx.empresaId,
      vencimientoId: v.id,
      cuentaId: cuenta?.id ?? null,
      fecha: input.fecha,
      importe,
      medio,
      remesaId: input.remesaId ?? null,
      notas: input.notas ?? null,
      creadoPor: ctx.usuarioId,
    })
    .returning();
  await audit(tx, ctx, v.circuito === 'cobro' ? 'registrar_cobro' : 'registrar_pago', 'tes_vencimiento', v.id, { pagoId: p!.id, importe, fecha: input.fecha, medio });
  const actualizado = await recalcVencimiento(tx, v.id);
  if (cuenta) {
    // pagoId viaja como dato adicional para que el asiento sea idempotente por cobro (ver informe)
    const payload = { vencimientoId: v.id, documentoId: v.documentoId, terceroId: v.terceroId, importe, fecha: input.fecha, cuentaContable: cuenta.cuentaContable, pagoId: p!.id };
    await emit(tx, ctx, v.circuito === 'cobro' ? 'tes.cobro_registrado' : 'tes.pago_registrado', payload);
  }
  return { pago: p!, vencimiento: actualizado };
}

/** Compensa vencimientos positivos y negativos (p. ej. factura y su rectificativa) del mismo tercero. */
export async function compensar(tx: Tx, ctx: Ctx, ids: string[], fecha: string) {
  const vs = await tx
    .select()
    .from(tesVencimientos)
    .where(and(inArray(tesVencimientos.id, ids), eq(tesVencimientos.empresaId, ctx.empresaId)))
    .for('update');
  if (vs.length !== ids.length) throw notFound('Algún vencimiento no existe');
  if (new Set(vs.map((v) => v.terceroId)).size !== 1 || new Set(vs.map((v) => v.circuito)).size !== 1) throw badRequest('Solo se compensan vencimientos del mismo cliente o proveedor y del mismo tipo');
  const pos = vs.filter((v) => pendienteDe(v) > EPS).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const neg = vs.filter((v) => pendienteDe(v) < -EPS);
  if (!pos.length || !neg.length) throw badRequest('Para compensar elige al menos un vencimiento positivo y uno negativo');
  let disponible = round(neg.reduce((a, v) => a - pendienteDe(v), 0));
  const totalPos = round(pos.reduce((a, v) => a + pendienteDe(v), 0));
  const compensado = Math.min(disponible, totalPos);
  // reparte el importe compensado: positivos por fecha, negativos en orden
  let resto = compensado;
  for (const v of pos) {
    if (resto < EPS) break;
    const imp = round(Math.min(resto, pendienteDe(v)));
    await registrarPago(tx, ctx, { vencimientoId: v.id, importe: imp, fecha, medio: 'compensacion', notas: 'Compensación' });
    resto = round(resto - imp);
  }
  resto = compensado;
  for (const v of neg) {
    if (resto < EPS) break;
    const imp = round(Math.min(resto, -pendienteDe(v)));
    await registrarPago(tx, ctx, { vencimientoId: v.id, importe: -imp, fecha, medio: 'compensacion', notas: 'Compensación' });
    resto = round(resto - imp);
  }
  disponible = round(disponible - compensado);
  return { compensado };
}
