import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { fmtDate, fmtMoney, round } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { empresas, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { emailLayout, queueEmail } from '../../core/mail';
import { notify } from '../../core/notify';
import { getAjustes } from '../../core/settings';
import { tesCuentas, tesMovimientos, tesPagos, tesVencimientos } from './schema';
import { pendienteDe, syncEstadoPago } from './service';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);

/* ───────────── Saldos ───────────── */

/**
 * Saldo de cada cuenta: saldo inicial + cobros − pagos registrados en ella
 * + movimientos del banco que aún no se han conciliado (comisiones, ingresos sin registrar…).
 */
export async function saldosCuentas(empresaId: string) {
  const cuentas = await db.select().from(tesCuentas).where(and(eq(tesCuentas.empresaId, empresaId), isNull(tesCuentas.archivadoEn)));
  const pagos = await db
    .select({ cuentaId: tesPagos.cuentaId, s: sql<string>`coalesce(sum(CASE WHEN ${tesVencimientos.circuito} = 'cobro' THEN ${tesPagos.importe} ELSE -${tesPagos.importe} END), 0)` })
    .from(tesPagos)
    .innerJoin(tesVencimientos, eq(tesVencimientos.id, tesPagos.vencimientoId))
    .where(eq(tesPagos.empresaId, empresaId))
    .groupBy(tesPagos.cuentaId);
  const movs = await db
    .select({ cuentaId: tesMovimientos.cuentaId, s: sql<string>`coalesce(sum(${tesMovimientos.importe}), 0)`, ultimo: sql<string | null>`max(${tesMovimientos.fecha})` })
    .from(tesMovimientos)
    .where(and(eq(tesMovimientos.empresaId, empresaId), inArray(tesMovimientos.estado, ['pendiente', 'ignorado'])))
    .groupBy(tesMovimientos.cuentaId);
  const banco = await db
    .select({ cuentaId: tesMovimientos.cuentaId, s: sql<string>`coalesce(sum(${tesMovimientos.importe}), 0)`, n: sql<number>`count(*)::int`, pend: sql<number>`count(*) FILTER (WHERE ${tesMovimientos.estado} = 'pendiente')::int` })
    .from(tesMovimientos)
    .where(eq(tesMovimientos.empresaId, empresaId))
    .groupBy(tesMovimientos.cuentaId);
  return cuentas.map((c) => {
    const p = Number(pagos.find((x) => x.cuentaId === c.id)?.s ?? 0);
    const m = Number(movs.find((x) => x.cuentaId === c.id)?.s ?? 0);
    const b = banco.find((x) => x.cuentaId === c.id);
    return {
      ...c,
      saldo: round(c.saldoInicial + p + m),
      saldoExtracto: b ? round(c.saldoInicial + Number(b.s)) : null,
      movimientos: b?.n ?? 0,
      sinConciliar: b?.pend ?? 0,
    };
  });
}

/* ───────────── Previsión de 13 semanas ───────────── */

export async function prevision(empresaId: string, semanas = 13) {
  const hoy = hoyISO();
  const d = new Date(hoy + 'T12:00:00Z');
  const lunes = addDays(hoy, -((d.getUTCDay() + 6) % 7));
  const fin = addDays(lunes, semanas * 7 - 1);
  const cuentas = await saldosCuentas(empresaId);
  const saldoActual = round(cuentas.filter((c) => c.activo).reduce((a, c) => a + c.saldo, 0));
  const vs = await db
    .select({ v: tesVencimientos, tercero: terceros.nombre })
    .from(tesVencimientos)
    .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
    .where(and(eq(tesVencimientos.empresaId, empresaId), inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'remesado', 'devuelto', 'impagado']), sql`${tesVencimientos.fecha} <= ${fin}`));
  const rows = Array.from({ length: semanas }, (_, i) => {
    const desde = addDays(lunes, i * 7);
    return { semana: i + 1, desde, hasta: addDays(desde, 6), etiqueta: desde.slice(8, 10) + '/' + desde.slice(5, 7), cobros: 0, pagos: 0, neto: 0, saldo: 0, vencidoCobros: 0, vencidoPagos: 0 };
  });
  for (const { v } of vs) {
    const pend = pendienteDe(v);
    if (Math.abs(pend) < 0.005) continue;
    // lo vencido y no cobrado se prevé en la primera semana; los impagados no se esperan
    if (v.estado === 'impagado') continue;
    const idx = v.fecha < lunes ? 0 : Math.floor((Date.parse(v.fecha) - Date.parse(lunes)) / (7 * 86400_000));
    const r = rows[Math.min(Math.max(idx, 0), semanas - 1)]!;
    if (v.circuito === 'cobro') {
      r.cobros = round(r.cobros + pend);
      if (v.fecha < hoy) r.vencidoCobros = round(r.vencidoCobros + pend);
    } else {
      r.pagos = round(r.pagos + pend);
      if (v.fecha < hoy) r.vencidoPagos = round(r.vencidoPagos + pend);
    }
  }
  let saldo = saldoActual;
  let minimo = { saldo: saldoActual, semana: 0 };
  for (const r of rows) {
    r.neto = round(r.cobros - r.pagos);
    saldo = round(saldo + r.neto);
    r.saldo = saldo;
    if (saldo < minimo.saldo) minimo = { saldo, semana: r.semana };
  }
  return { saldoActual, cuentas, semanas: rows, minimo, impagados: round(vs.filter((x) => x.v.estado === 'impagado').reduce((a, x) => a + pendienteDe(x.v), 0)) };
}

/* ───────────── Recordatorios de impago ───────────── */

/**
 * Tarea diaria: a los días de ajustes.recordatoriosImpagoDias (por defecto 7, 15 y 30) desde el vencimiento
 * se envía un recordatorio al cliente y se avisa a su comercial. Tras el último, el vencimiento pasa a impagado.
 */
export async function procesarImpagos(tx: Tx, ctx: Ctx, hoy = hoyISO()) {
  const ajustes = await getAjustes(ctx.empresaId);
  const diasAviso = ([...(ajustes.recordatoriosImpagoDias ?? [7, 15, 30])] as number[]).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (!diasAviso.length) return { recordatorios: 0, impagados: 0 };
  const [emp] = await tx.select().from(empresas).where(eq(empresas.id, ctx.empresaId));
  const vs = await tx
    .select({ v: tesVencimientos, t: terceros, doc: documentos })
    .from(tesVencimientos)
    .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
    .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
    .where(
      and(
        eq(tesVencimientos.empresaId, ctx.empresaId),
        eq(tesVencimientos.circuito, 'cobro'),
        inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'devuelto']),
        lt(tesVencimientos.fecha, hoy),
        sql`${tesVencimientos.importe} > 0`,
      ),
    );
  let recordatorios = 0;
  let impagados = 0;
  for (const { v, t, doc } of vs) {
    const retraso = Math.floor((Date.parse(hoy) - Date.parse(v.fecha)) / 86400_000);
    if (v.recordatorios >= diasAviso.length || retraso < diasAviso[v.recordatorios]!) continue;
    if (v.ultimoRecordatorio === hoy) continue;
    const n = v.recordatorios + 1;
    const ultimo = n >= diasAviso.length;
    const pend = pendienteDe(v);
    const snap = (doc?.datosTercero ?? {}) as Record<string, any>;
    const email = (snap.email as string) || t?.email;
    const titulo = ultimo ? `Último aviso: factura ${doc?.codigo ?? ''} pendiente de pago` : `Recordatorio: factura ${doc?.codigo ?? ''} pendiente de pago`;
    if (email) {
      await queueEmail(tx, {
        empresaId: ctx.empresaId,
        para: email,
        asunto: `${titulo} · ${emp?.nombre ?? ''}`.trim(),
        html: emailLayout({
          empresa: emp?.nombre ?? 'KiteERP',
          titulo,
          cuerpo: `<p>Hola${t?.nombre ? `, ${escapeHtml(t.nombre)}` : ''}:</p>
<p>Según nuestros registros, el importe de <strong>${fmtMoney(pend)}</strong> de la factura <strong>${escapeHtml(doc?.codigo ?? v.concepto ?? '')}</strong>, con vencimiento el ${fmtDate(v.fecha)}, sigue pendiente de pago (${retraso} días de retraso).</p>
${emp?.iban ? `<p>Puedes hacer la transferencia a la cuenta <strong>${escapeHtml(emp.iban.replace(/(.{4})/g, '$1 ').trim())}</strong> indicando el número de factura.</p>` : ''}
<p>Si ya lo has pagado, no tengas en cuenta este mensaje. Para cualquier duda, responde a este correo${emp?.telefono ? ` o llámanos al ${escapeHtml(emp.telefono)}` : ''}.</p>
<p>Gracias,<br>${escapeHtml(emp?.nombre ?? '')}</p>`,
        }),
      });
    }
    await notify(tx, ctx, {
      modulo: 'tes',
      tipo: ultimo ? 'impagado' : 'recordatorio_impago',
      titulo: ultimo ? `Impagado: ${t?.nombre ?? 'cliente'} · ${fmtMoney(pend)}` : `Recordatorio ${n} enviado a ${t?.nombre ?? 'cliente'} · ${fmtMoney(pend)}`,
      cuerpo: `${doc?.codigo ?? v.concepto ?? ''}, vencida el ${fmtDate(v.fecha)} (${retraso} días).${email ? '' : ' El cliente no tiene email: llámale.'}`,
      enlace: v.terceroId ? `/terceros/${v.terceroId}?tab=tes-cobros` : '/tesoreria/vencimientos',
      personaIds: [t?.comercialId],
      permiso: ultimo ? 'tes.gestionar' : undefined,
    });
    await tx
      .update(tesVencimientos)
      .set({ recordatorios: n, ultimoRecordatorio: hoy, ...(ultimo ? { estado: 'impagado' } : {}) })
      .where(eq(tesVencimientos.id, v.id));
    if (ultimo && v.documentoId) await syncEstadoPago(tx, v.documentoId);
    await audit(tx, ctx, ultimo ? 'marcar_impagado' : 'recordatorio_impago', 'tes_vencimiento', v.id, { recordatorio: n, retraso, email: email ?? null });
    recordatorios++;
    if (ultimo) impagados++;
  }
  return { recordatorios, impagados };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

