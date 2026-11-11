import { and, desc, eq, gte, inArray, isNull, lte, notExists, sql } from 'drizzle-orm';
import { round } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { newId } from '../../db/helpers';
import { audit } from '../../core/audit';
import { sha256 } from '../../core/auth';
import type { Ctx } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/errors';
import { fileBuffer, getFile } from '../../core/files';
import { tesConciliaciones, tesCuentas, tesMovimientos, tesPagos, tesRemesas, tesVencimientos } from './schema';
import { parseCsvMovimientos, parseNorma43 } from './norma43';
import { EPS, pendienteDe, registrarPago } from './service';
import { cerrarRemesa } from './remesas';

export interface MovimientoNuevo {
  fecha: string;
  fechaValor?: string | null;
  importe: number;
  concepto: string;
  referencia?: string | null;
  conceptoComun?: string | null;
}

/** Inserta movimientos sin duplicar: la huella incluye cuenta, fecha, importe, concepto y su ordinal dentro del lote. */
export async function insertarMovimientos(tx: Tx, ctx: Ctx, cuentaId: string, origen: string, movs: MovimientoNuevo[]) {
  const importacionId = newId();
  const vistos = new Map<string, number>();
  let nuevos = 0;
  let duplicados = 0;
  for (const m of movs) {
    const base = `${cuentaId}|${m.fecha}|${m.importe.toFixed(2)}|${m.concepto.trim().toUpperCase()}|${(m.referencia ?? '').trim()}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    const hash = sha256(Buffer.from(`${base}#${n}`));
    const r = await tx
      .insert(tesMovimientos)
      .values({
        empresaId: ctx.empresaId,
        cuentaId,
        fecha: m.fecha,
        fechaValor: m.fechaValor ?? m.fecha,
        importe: round(m.importe),
        concepto: m.concepto.slice(0, 500),
        referencia: m.referencia || null,
        conceptoComun: m.conceptoComun ?? null,
        origen,
        hash,
        importacionId,
      })
      .onConflictDoNothing()
      .returning({ id: tesMovimientos.id });
    if (r.length) nuevos++;
    else duplicados++;
  }
  await audit(tx, ctx, 'importar', 'tes_movimientos', cuentaId, { origen, nuevos, duplicados });
  return { nuevos, duplicados, importacionId };
}

/** Importa un extracto (Norma 43 o CSV) subido como archivo. */
export async function importarExtracto(tx: Tx, ctx: Ctx, cuentaId: string, archivoId: string) {
  const [cuenta] = await tx.select().from(tesCuentas).where(and(eq(tesCuentas.id, cuentaId), eq(tesCuentas.empresaId, ctx.empresaId)));
  if (!cuenta) throw badRequest('Elige la cuenta bancaria');
  const f = await getFile(tx, archivoId);
  if (f.empresaId !== ctx.empresaId) throw notFound('Archivo no encontrado');
  const buf = await fileBuffer(f.ruta);
  // Norma 43 suele venir en latin1; el CSV en UTF-8
  const utf = buf.toString('utf8');
  const text = utf.includes('�') ? buf.toString('latin1') : utf;
  const first = text.replace(/^﻿/, '').trimStart().slice(0, 2);
  if (first === '11' && /^\d{20}/.test(text.trimStart().slice(0, 20))) {
    const cuentas = parseNorma43(text);
    const avisos = cuentas.flatMap((c) => c.avisos);
    const movs = cuentas.flatMap((c) => c.movimientos.map((m) => ({ fecha: m.fecha, fechaValor: m.fechaValor, importe: m.importe, concepto: m.concepto || m.referencia2 || m.referencia1, referencia: m.referencia1 || m.documento, conceptoComun: m.conceptoComun })));
    const ccc = cuentas[0] ? cuentas[0].entidad + cuentas[0].oficina + cuentas[0].cuenta : '';
    if (cuenta.iban && ccc && !cuenta.iban.replace(/\s/g, '').endsWith(ccc.slice(-10))) avisos.push(`El extracto es de la cuenta …${ccc.slice(-10)}, que no coincide con ${cuenta.nombre}`);
    const r = await insertarMovimientos(tx, ctx, cuentaId, 'n43', movs);
    return { ...r, formato: 'Norma 43', avisos, saldoFinal: cuentas[cuentas.length - 1]?.saldoFinal ?? null };
  }
  const movs = parseCsvMovimientos(text);
  if (!movs.length) throw badRequest('No se han encontrado movimientos. Usa un extracto Norma 43 o un CSV con columnas fecha; concepto; importe');
  const r = await insertarMovimientos(tx, ctx, cuentaId, 'csv', movs);
  return { ...r, formato: 'CSV', avisos: [] as string[], saldoFinal: null };
}

/* ───────────── Sugerencias ───────────── */

export interface Sugerencia {
  tipo: 'vencimiento' | 'pago' | 'remesa';
  id: string;
  titulo: string;
  detalle: string;
  importe: number;
  fecha: string;
  puntuacion: number;
}

const palabras = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= 4 && !['SOCIEDAD', 'LIMITADA', 'TRANSFERENCIA', 'RECIBO', 'FACTURA', 'PAGO', 'COBRO'].includes(w));

function puntuar(concepto: string, candidatos: (string | null | undefined)[], diasDif: number) {
  const c = concepto.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let p = 50 - Math.min(30, Math.abs(diasDif));
  for (const cand of candidatos) {
    if (!cand) continue;
    const limpio = cand.toUpperCase().replace(/\s/g, '');
    if (limpio.length >= 5 && c.replace(/\s/g, '').includes(limpio)) p += 40; // NIF o número de factura en el concepto
    else if (palabras(cand).some((w) => c.includes(w))) p += 25; // nombre del tercero
  }
  return p;
}

const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400_000);

/** Posibles parejas de un movimiento: mismo importe (±0,01), ventana de fechas y nombre/referencia en el concepto. */
export async function sugerencias(ctx: Ctx, mov: typeof tesMovimientos.$inferSelect, ventana = 45): Promise<Sugerencia[]> {
  const abs = Math.abs(mov.importe);
  const circuito = mov.importe > 0 ? 'cobro' : 'pago';
  const desde = new Date(Date.parse(mov.fecha) - ventana * 86400_000).toISOString().slice(0, 10);
  const hasta = new Date(Date.parse(mov.fecha) + ventana * 86400_000).toISOString().slice(0, 10);
  const out: Sugerencia[] = [];

  // 1. Vencimientos pendientes por ese importe
  const vs = await db
    .select({ v: tesVencimientos, tercero: terceros.nombre, nif: terceros.nif, codigo: documentos.codigo, ref: documentos.referenciaExterna })
    .from(tesVencimientos)
    .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
    .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
    .where(
      and(
        eq(tesVencimientos.empresaId, ctx.empresaId),
        eq(tesVencimientos.circuito, circuito),
        inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'devuelto', 'impagado', 'remesado']),
        sql`abs(${tesVencimientos.importe} - ${tesVencimientos.importePagado} - ${abs}) <= 0.01`,
        gte(tesVencimientos.fecha, desde),
        lte(tesVencimientos.fecha, hasta),
      ),
    )
    .limit(20);
  for (const r of vs)
    out.push({
      tipo: 'vencimiento',
      id: r.v.id,
      titulo: `${r.tercero ?? 'Sin tercero'} · ${r.v.concepto ?? ''}`,
      detalle: `Vence el ${r.v.fecha.split('-').reverse().join('/')} · se registrará el ${circuito}`,
      importe: pendienteDe(r.v),
      fecha: r.v.fecha,
      puntuacion: puntuar(mov.concepto + ' ' + (mov.referencia ?? ''), [r.tercero, r.nif, r.codigo, r.ref], dias(mov.fecha, r.v.fecha)),
    });

  // 2. Cobros/pagos ya registrados en esa cuenta y aún sin conciliar
  const ps = await db
    .select({ p: tesPagos, concepto: tesVencimientos.concepto, tercero: terceros.nombre, nif: terceros.nif, circuito: tesVencimientos.circuito })
    .from(tesPagos)
    .innerJoin(tesVencimientos, eq(tesVencimientos.id, tesPagos.vencimientoId))
    .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
    .where(
      and(
        eq(tesPagos.empresaId, ctx.empresaId),
        eq(tesPagos.cuentaId, mov.cuentaId),
        isNull(tesPagos.remesaId),
        gte(tesPagos.fecha, desde),
        lte(tesPagos.fecha, hasta),
        notExists(db.select({ x: sql`1` }).from(tesConciliaciones).where(eq(tesConciliaciones.pagoId, tesPagos.id))),
      ),
    )
    .limit(50);
  for (const r of ps) {
    const signo = (r.circuito === 'cobro' ? 1 : -1) * r.p.importe;
    if (Math.abs(signo - mov.importe) > 0.01) continue;
    out.push({
      tipo: 'pago',
      id: r.p.id,
      titulo: `${r.circuito === 'cobro' ? 'Cobro' : 'Pago'} ya registrado · ${r.tercero ?? ''}`,
      detalle: `${r.concepto ?? ''} · ${r.p.fecha.split('-').reverse().join('/')}`,
      importe: r.p.importe,
      fecha: r.p.fecha,
      puntuacion: puntuar(mov.concepto, [r.tercero, r.nif], dias(mov.fecha, r.p.fecha)) + 10,
    });
  }

  // 3. Remesas por su importe total (el banco abona o carga la remesa en un único apunte)
  const rs = await db
    .select()
    .from(tesRemesas)
    .where(and(eq(tesRemesas.empresaId, ctx.empresaId), eq(tesRemesas.cuentaId, mov.cuentaId), eq(tesRemesas.tipo, circuito), sql`abs(${tesRemesas.total} - ${abs}) <= 0.01`))
    .orderBy(desc(tesRemesas.fechaCargo))
    .limit(5);
  for (const r of rs) {
    const [ya] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tesConciliaciones)
      .innerJoin(tesPagos, eq(tesPagos.id, tesConciliaciones.pagoId))
      .where(eq(tesPagos.remesaId, r.id));
    if ((ya?.n ?? 0) > 0) continue;
    out.push({
      tipo: 'remesa',
      id: r.id,
      titulo: `Remesa ${r.codigo} (${r.numOperaciones} ${r.tipo === 'cobro' ? 'recibos' : 'transferencias'})`,
      detalle: r.estado === 'cobrada' ? 'Remesa cerrada' : 'Se cerrará la remesa y se registrarán sus cobros',
      importe: r.total,
      fecha: r.fechaCargo,
      puntuacion: 60 - Math.min(30, Math.abs(dias(mov.fecha, r.fechaCargo))) + (mov.concepto.toUpperCase().includes(r.codigo) ? 40 : 0),
    });
  }
  return out.sort((a, b) => b.puntuacion - a.puntuacion).slice(0, 4);
}

/* ───────────── Confirmación ───────────── */

async function cargarMovimiento(tx: Tx, ctx: Ctx, id: string) {
  const [m] = await tx.select().from(tesMovimientos).where(and(eq(tesMovimientos.id, id), eq(tesMovimientos.empresaId, ctx.empresaId))).for('update');
  if (!m) throw notFound('Movimiento no encontrado');
  if (m.estado === 'conciliado') throw conflict('Este movimiento ya está conciliado');
  return m;
}

/** Concilia un movimiento con un vencimiento (registra el cobro/pago), con un pago ya registrado o con una remesa. */
export async function conciliar(tx: Tx, ctx: Ctx, movimientoId: string, destino: { tipo: 'vencimiento' | 'pago' | 'remesa'; id: string }) {
  const m = await cargarMovimiento(tx, ctx, movimientoId);
  const abs = Math.abs(m.importe);
  const pagos: { id: string; importe: number; vencimientoId: string }[] = [];
  if (destino.tipo === 'vencimiento') {
    const [v] = await tx.select().from(tesVencimientos).where(and(eq(tesVencimientos.id, destino.id), eq(tesVencimientos.empresaId, ctx.empresaId)));
    if (!v) throw notFound('Vencimiento no encontrado');
    if ((v.circuito === 'cobro') !== m.importe > 0) throw badRequest(m.importe > 0 ? 'Un abono solo puede ser un cobro' : 'Un cargo solo puede ser un pago');
    const imp = Math.min(abs, Math.abs(pendienteDe(v))) * Math.sign(v.importe);
    if (Math.abs(imp) < EPS) throw conflict('El vencimiento ya está pagado');
    const r = await registrarPago(tx, ctx, { vencimientoId: v.id, importe: round(imp), fecha: m.fecha, cuentaId: m.cuentaId, medio: 'transferencia', notas: `Conciliado con el banco: ${m.concepto}`.slice(0, 300) });
    pagos.push({ id: r.pago.id, importe: r.pago.importe, vencimientoId: v.id });
  } else if (destino.tipo === 'pago') {
    const [p] = await tx.select().from(tesPagos).where(and(eq(tesPagos.id, destino.id), eq(tesPagos.empresaId, ctx.empresaId)));
    if (!p) throw notFound('Cobro o pago no encontrado');
    const [ya] = await tx.select({ id: tesConciliaciones.id }).from(tesConciliaciones).where(eq(tesConciliaciones.pagoId, p.id));
    if (ya) throw conflict('Ese cobro o pago ya está conciliado con otro movimiento');
    pagos.push({ id: p.id, importe: p.importe, vencimientoId: p.vencimientoId });
  } else {
    const [r] = await tx.select().from(tesRemesas).where(and(eq(tesRemesas.id, destino.id), eq(tesRemesas.empresaId, ctx.empresaId)));
    if (!r) throw notFound('Remesa no encontrada');
    if (r.estado !== 'cobrada') await cerrarRemesa(tx, ctx, r.id, m.fecha);
    const ps = await tx.select().from(tesPagos).where(eq(tesPagos.remesaId, r.id));
    for (const p of ps.filter((x) => x.importe > 0)) pagos.push({ id: p.id, importe: p.importe, vencimientoId: p.vencimientoId });
  }
  if (pagos.length)
    await tx.insert(tesConciliaciones).values(pagos.map((p) => ({ empresaId: ctx.empresaId, movimientoId: m.id, pagoId: p.id, vencimientoId: p.vencimientoId, importe: p.importe, creadoPor: ctx.usuarioId })));
  await tx.update(tesMovimientos).set({ estado: 'conciliado' }).where(eq(tesMovimientos.id, m.id));
  await audit(tx, ctx, 'conciliar', 'tes_movimiento', m.id, { destino, pagos: pagos.length });
  return { pagos: pagos.length };
}

export async function marcarSinPareja(tx: Tx, ctx: Ctx, movimientoId: string, nota: string | null) {
  const m = await cargarMovimiento(tx, ctx, movimientoId);
  await tx.update(tesMovimientos).set({ estado: 'ignorado', nota }).where(eq(tesMovimientos.id, m.id));
  await audit(tx, ctx, 'ignorar', 'tes_movimiento', m.id, { nota });
}

export async function deshacerConciliacion(tx: Tx, ctx: Ctx, movimientoId: string) {
  const [m] = await tx.select().from(tesMovimientos).where(and(eq(tesMovimientos.id, movimientoId), eq(tesMovimientos.empresaId, ctx.empresaId)));
  if (!m) throw notFound('Movimiento no encontrado');
  await tx.delete(tesConciliaciones).where(eq(tesConciliaciones.movimientoId, m.id));
  await tx.update(tesMovimientos).set({ estado: 'pendiente', nota: null }).where(eq(tesMovimientos.id, m.id));
  await audit(tx, ctx, 'deshacer_conciliacion', 'tes_movimiento', m.id, { nota: 'Los cobros o pagos registrados se mantienen' });
}
