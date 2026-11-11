import { and, asc, eq, inArray } from 'drizzle-orm';
import { isValidIban, round, sepaCreditorId } from '@kite/shared';
import type { Tx } from '../../db/client';
import { empresas, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/errors';
import { saveFile } from '../../core/files';
import { notify } from '../../core/notify';
import { nextCode } from '../../core/numbering';
import { tesCuentas, tesPagos, tesRemesas, tesVencimientos } from './schema';
import { EPS, pendienteDe, recalcVencimiento, registrarPago } from './service';
import { painAdeudos, painTransferencias } from './sepa';

interface DatosBancarios {
  nombre: string;
  iban: string | null;
  mandato: string | null;
  mandatoFecha: string | null;
}

/** IBAN y mandato del tercero: primero la copia fiscal de la factura y, si falta, la ficha actual. */
async function datosBancarios(tx: Tx, v: typeof tesVencimientos.$inferSelect): Promise<DatosBancarios> {
  const [t] = v.terceroId ? await tx.select().from(terceros).where(eq(terceros.id, v.terceroId)) : [];
  const [d] = v.documentoId ? await tx.select({ snap: documentos.datosTercero }).from(documentos).where(eq(documentos.id, v.documentoId)) : [];
  const snap = (d?.snap ?? {}) as Record<string, any>;
  return {
    nombre: String(snap.razonSocial ?? t?.razonSocial ?? t?.nombre ?? 'Sin nombre'),
    iban: (snap.iban as string) || t?.iban || null,
    mandato: (snap.mandatoSepa as string) || t?.mandatoSepa || null,
    mandatoFecha: (snap.mandatoFecha as string) || t?.mandatoFecha || null,
  };
}

/** ¿Se puede incluir el vencimiento en una remesa? Devuelve el motivo si no. */
export async function motivoNoRemesable(tx: Tx, v: typeof tesVencimientos.$inferSelect, tipo: 'cobro' | 'pago'): Promise<string | null> {
  if (v.circuito !== tipo) return 'no es del tipo de la remesa';
  if (!['pendiente', 'parcial', 'devuelto'].includes(v.estado)) return 'no está pendiente';
  if (pendienteDe(v) <= EPS) return 'no tiene importe pendiente';
  const b = await datosBancarios(tx, v);
  if (!b.iban || !isValidIban(b.iban)) return 'el tercero no tiene un IBAN válido';
  if (tipo === 'cobro' && (!b.mandato || !b.mandatoFecha)) return 'el cliente no tiene mandato SEPA firmado';
  return null;
}

export async function crearRemesa(tx: Tx, ctx: Ctx, input: { tipo: 'cobro' | 'pago'; cuentaId: string; fechaCargo: string; vencimientoIds: string[] }) {
  const [cuenta] = await tx.select().from(tesCuentas).where(and(eq(tesCuentas.id, input.cuentaId), eq(tesCuentas.empresaId, ctx.empresaId)));
  if (!cuenta) throw badRequest('Elige la cuenta bancaria de la remesa');
  if (!cuenta.iban || !isValidIban(cuenta.iban)) throw badRequest(`La cuenta ${cuenta.nombre} no tiene un IBAN válido`);
  const [emp] = await tx.select().from(empresas).where(eq(empresas.id, ctx.empresaId));
  if (!emp?.nif) throw badRequest('Configura el NIF de la empresa antes de generar remesas');
  const vs = await tx
    .select()
    .from(tesVencimientos)
    .where(and(inArray(tesVencimientos.id, input.vencimientoIds), eq(tesVencimientos.empresaId, ctx.empresaId)))
    .orderBy(asc(tesVencimientos.fecha))
    .for('update');
  if (!vs.length) throw badRequest('Selecciona al menos un vencimiento');
  const errores: string[] = [];
  for (const v of vs) {
    const m = await motivoNoRemesable(tx, v, input.tipo);
    if (m) errores.push(`${v.concepto ?? v.id}: ${m}`);
  }
  if (errores.length) throw badRequest(`No se puede generar la remesa. ${errores.slice(0, 5).join('. ')}${errores.length > 5 ? '…' : ''}`, { errores });

  const codigo = await nextCode(tx, ctx.empresaId, input.tipo === 'cobro' ? 'tes_remesa_cobro' : 'tes_remesa_pago', input.tipo === 'cobro' ? 'RC' : 'RT', input.fechaCargo);
  const msgId = `${codigo}-${Date.now().toString(36).toUpperCase()}`;
  const total = round(vs.reduce((a, v) => a + pendienteDe(v), 0));
  const [remesa] = await tx
    .insert(tesRemesas)
    .values({ empresaId: ctx.empresaId, codigo, tipo: input.tipo, cuentaId: cuenta.id, fechaCargo: input.fechaCargo, total, numOperaciones: vs.length, msgId, creadoPor: ctx.usuarioId })
    .returning();

  const nombreEmpresa = emp.razonSocial ?? emp.nombre;
  let xml: string;
  if (input.tipo === 'cobro') {
    const recibos = [];
    for (const v of vs) {
      const b = await datosBancarios(tx, v);
      recibos.push({ endToEndId: `${codigo}-${recibos.length + 1}`, importe: pendienteDe(v), mandatoId: b.mandato!, mandatoFecha: b.mandatoFecha!, deudor: { nombre: b.nombre, iban: b.iban! }, concepto: v.concepto ?? 'Recibo' });
    }
    xml = painAdeudos({
      msgId,
      creado: new Date(),
      fechaCobro: input.fechaCargo,
      acreedor: { nombre: nombreEmpresa, iban: cuenta.iban, bic: cuenta.bic, id: sepaCreditorId(emp.nif, cuenta.sufijoSepa || emp.sufijoSepa || '000') },
      recibos,
    });
  } else {
    const pagos = [];
    for (const v of vs) {
      const b = await datosBancarios(tx, v);
      pagos.push({ endToEndId: `${codigo}-${pagos.length + 1}`, importe: pendienteDe(v), beneficiario: { nombre: b.nombre, iban: b.iban! }, concepto: v.concepto ?? 'Pago' });
    }
    xml = painTransferencias({ msgId, creado: new Date(), fechaEjecucion: input.fechaCargo, ordenante: { nombre: nombreEmpresa, iban: cuenta.iban, bic: cuenta.bic, id: `${emp.nif}${cuenta.sufijoSepa || '000'}` }, pagos });
  }
  const archivo = await saveFile(tx, { empresaId: ctx.empresaId, nombre: `${codigo}.xml`, mime: 'application/xml', data: Buffer.from(xml, 'utf8'), subidoPor: ctx.usuarioId });
  await tx.update(tesRemesas).set({ archivoId: archivo.id }).where(eq(tesRemesas.id, remesa!.id));
  await tx.update(tesVencimientos).set({ remesaId: remesa!.id, estado: 'remesado' }).where(inArray(tesVencimientos.id, vs.map((v) => v.id)));
  await audit(tx, ctx, 'crear', 'tes_remesa', remesa!.id, { codigo, tipo: input.tipo, total, operaciones: vs.length });
  return { ...remesa!, archivoId: archivo.id, xml };
}

export async function cargarRemesa(tx: Tx, ctx: Ctx, id: string) {
  const [r] = await tx.select().from(tesRemesas).where(and(eq(tesRemesas.id, id), eq(tesRemesas.empresaId, ctx.empresaId))).for('update');
  if (!r) throw notFound('Remesa no encontrada');
  return r;
}

export async function marcarEnviada(tx: Tx, ctx: Ctx, id: string) {
  const r = await cargarRemesa(tx, ctx, id);
  if (r.estado !== 'generada') throw conflict('La remesa ya se envió');
  await tx.update(tesRemesas).set({ estado: 'enviada' }).where(eq(tesRemesas.id, id));
  await audit(tx, ctx, 'enviar', 'tes_remesa', id);
}

/** El banco ha cargado/abonado la remesa: se registran los cobros o pagos de cada vencimiento. */
export async function cerrarRemesa(tx: Tx, ctx: Ctx, id: string, fecha?: string) {
  const r = await cargarRemesa(tx, ctx, id);
  if (r.estado === 'cobrada') throw conflict('La remesa ya está cerrada');
  const vs = await tx.select().from(tesVencimientos).where(eq(tesVencimientos.remesaId, id));
  await tx.update(tesRemesas).set({ estado: 'cobrada', cerradaEn: new Date() }).where(eq(tesRemesas.id, id));
  let n = 0;
  for (const v of vs) {
    if (pendienteDe(v) <= EPS) {
      await recalcVencimiento(tx, v.id);
      continue;
    }
    await registrarPago(tx, ctx, { vencimientoId: v.id, fecha: fecha ?? r.fechaCargo, cuentaId: r.cuentaId, medio: r.tipo === 'cobro' ? 'recibo' : 'transferencia', remesaId: r.id, notas: `Remesa ${r.codigo}` });
    n++;
  }
  await audit(tx, ctx, 'cerrar', 'tes_remesa', id, { operaciones: n });
  return { operaciones: n };
}

/** Quita un vencimiento de una remesa aún no enviada. */
export async function quitarDeRemesa(tx: Tx, ctx: Ctx, remesaId: string, vencimientoId: string) {
  const r = await cargarRemesa(tx, ctx, remesaId);
  if (r.estado !== 'generada') throw conflict('Solo se pueden quitar recibos de una remesa que aún no se ha enviado');
  await tx.update(tesVencimientos).set({ remesaId: null, estado: 'pendiente' }).where(and(eq(tesVencimientos.id, vencimientoId), eq(tesVencimientos.remesaId, remesaId)));
  await recalcVencimiento(tx, vencimientoId);
  const vs = await tx.select().from(tesVencimientos).where(eq(tesVencimientos.remesaId, remesaId));
  await tx.update(tesRemesas).set({ total: round(vs.reduce((a, v) => a + pendienteDe(v), 0)), numOperaciones: vs.length }).where(eq(tesRemesas.id, remesaId));
  await audit(tx, ctx, 'quitar_recibo', 'tes_remesa', remesaId, { vencimientoId, nota: 'El fichero XML ya generado no cambia: vuelve a generar la remesa si lo necesitas' });
}

/**
 * Devolución de un recibo: se anula el cobro con un pago negativo, el vencimiento queda "devuelto"
 * (se puede volver a remesar o cobrar) y se avisa al comercial del cliente.
 */
export async function devolverRecibo(tx: Tx, ctx: Ctx, vencimientoId: string, input: { fecha: string; motivo?: string | null }) {
  const [v] = await tx.select().from(tesVencimientos).where(and(eq(tesVencimientos.id, vencimientoId), eq(tesVencimientos.empresaId, ctx.empresaId)));
  if (!v) throw notFound('Vencimiento no encontrado');
  if (v.circuito !== 'cobro') throw badRequest('Solo se devuelven recibos de cobro');
  const pagos = await tx.select().from(tesPagos).where(eq(tesPagos.vencimientoId, v.id));
  const cobrado = round(pagos.reduce((a, p) => a + p.importe, 0));
  if (cobrado <= EPS) throw conflict('Este recibo no está cobrado');
  const ultimo = [...pagos].reverse().find((p) => p.importe > 0 && p.cuentaId);
  await registrarPago(tx, ctx, { vencimientoId: v.id, importe: -cobrado, fecha: input.fecha, cuentaId: ultimo?.cuentaId ?? null, medio: 'devolucion', remesaId: ultimo?.remesaId ?? null, notas: input.motivo ? `Devolución: ${input.motivo}` : 'Recibo devuelto' });
  await tx.update(tesVencimientos).set({ motivoDevolucion: input.motivo ?? null, remesaId: null }).where(eq(tesVencimientos.id, v.id));
  const actualizado = await recalcVencimiento(tx, v.id, 'devuelto');
  const [t] = v.terceroId ? await tx.select({ nombre: terceros.nombre, comercialId: terceros.comercialId }).from(terceros).where(eq(terceros.id, v.terceroId)) : [];
  await notify(tx, ctx, {
    modulo: 'tes',
    tipo: 'recibo_devuelto',
    titulo: `Recibo devuelto: ${t?.nombre ?? 'cliente'} (${cobrado.toFixed(2).replace('.', ',')} €)`,
    cuerpo: `${v.concepto ?? ''}${input.motivo ? `. Motivo: ${input.motivo}` : ''}. Contacta con el cliente para regularizarlo.`,
    enlace: v.terceroId ? `/terceros/${v.terceroId}?tab=tes-cobros` : '/tesoreria/vencimientos',
    personaIds: [t?.comercialId],
    email: true,
  });
  await audit(tx, ctx, 'devolver', 'tes_vencimiento', v.id, { importe: cobrado, motivo: input.motivo ?? null });
  return actualizado;
}
