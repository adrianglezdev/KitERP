import { and, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { round } from '@kite/shared';
import { db, type DbOrTx, type Tx } from '../../db/client';
import type { Ctx } from '../../core/context';
import { emit } from '../../core/events';
import { notify } from '../../core/notify';
import { actActivos, actAmortizaciones, actRegistros, actVencimientos } from './schema';

export type Activo = typeof actActivos.$inferSelect;

/** Último día de un periodo AAAA-MM. */
export function finDePeriodo(periodo: string) {
  const [y, m] = periodo.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}
export function periodoAnterior(fecha = new Date()) {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}
export function sumarMeses(fecha: string, meses: number) {
  const d = new Date(fecha + 'T12:00:00Z');
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}

/** Datos de amortización lineal de un activo. Empieza el mes siguiente a la compra. */
export function planAmortizacion(a: Pick<Activo, 'valorCompra' | 'valorResidual' | 'vidaUtilMeses' | 'fechaCompra'>) {
  const base = round((a.valorCompra ?? 0) - (a.valorResidual ?? 0));
  if (!a.fechaCompra || !a.vidaUtilMeses || base <= 0) return null;
  const cuota = round(base / a.vidaUtilMeses);
  const inicio = sumarMeses(a.fechaCompra.slice(0, 8) + '01', 1).slice(0, 7);
  const fin = sumarMeses(inicio + '-01', a.vidaUtilMeses - 1).slice(0, 7);
  return { base, cuota, inicio, fin };
}

/**
 * Amortiza un mes: una cuota por activo y periodo (índice único). Si ya existe no se repite, así que
 * se puede lanzar tantas veces como se quiera. Solo emite 'act.amortizacion' por las cuotas nuevas.
 */
export async function amortizarPeriodo(tx: Tx, ctx: Ctx, periodo: string, soloActivoId?: string) {
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error('Periodo no válido');
  const fecha = finDePeriodo(periodo);
  const activos = await tx
    .select()
    .from(actActivos)
    .where(and(eq(actActivos.empresaId, ctx.empresaId), isNull(actActivos.archivadoEn), ne(actActivos.estado, 'baja'), sql`${actActivos.valorCompra} > 0`, sql`${actActivos.vidaUtilMeses} > 0`, lte(actActivos.fechaCompra, fecha), soloActivoId ? eq(actActivos.id, soloActivoId) : undefined));
  let creadas = 0;
  let importeTotal = 0;
  for (const a of activos) {
    const plan = planAmortizacion(a);
    if (!plan || periodo < plan.inicio || periodo > plan.fin) continue;
    const [acc] = await tx.select({ s: sql<number>`coalesce(sum(${actAmortizaciones.importe}), 0)::float` }).from(actAmortizaciones).where(and(eq(actAmortizaciones.activoId, a.id), sql`${actAmortizaciones.periodo} < ${periodo}`));
    const acumuladoPrevio = acc?.s ?? 0;
    const restante = round(plan.base - acumuladoPrevio);
    if (restante <= 0.004) continue;
    // la última cuota ajusta los céntimos del redondeo
    const importe = periodo === plan.fin ? restante : Math.min(plan.cuota, restante);
    const ins = await tx
      .insert(actAmortizaciones)
      .values({ empresaId: ctx.empresaId, activoId: a.id, periodo, fecha, importe, acumulado: round(acumuladoPrevio + importe) })
      .onConflictDoNothing()
      .returning();
    if (!ins.length) continue;
    creadas++;
    importeTotal += importe;
    await emit(tx, ctx, 'act.amortizacion', {
      activoId: a.id,
      importe,
      fecha,
      cuentaGasto: a.cuentaGasto || '681',
      cuentaAmortizacion: a.cuentaAmortizacion || '281',
      concepto: `Amortización ${periodo} · ${a.codigo} ${a.nombre}`,
    });
  }
  return { periodo, creadas, importe: round(importeTotal) };
}

const TIPO_REGISTRO: Record<string, string> = { itv: 'preventivo', revision: 'preventivo', mantenimiento: 'preventivo', calibracion: 'preventivo', seguro: 'otro', otro: 'otro' };

/** Marca un vencimiento como hecho, deja el registro del gasto y crea el siguiente si es periódico. */
export async function completarVencimiento(tx: Tx, ctx: Ctx, v: typeof actVencimientos.$inferSelect, datos: { fecha: string; coste?: number | null; proveedorId?: string | null; km?: number | null; notas?: string | null; archivoId?: string | null }) {
  const [a] = await tx.select().from(actActivos).where(eq(actActivos.id, v.activoId));
  const [reg] = await tx
    .insert(actRegistros)
    .values({
      empresaId: ctx.empresaId,
      activoId: v.activoId,
      tipo: TIPO_REGISTRO[v.tipo] ?? 'otro',
      fecha: datos.fecha,
      descripcion: [v.descripcion || v.tipo.toUpperCase(), datos.notas].filter(Boolean).join(' · '),
      coste: datos.coste ?? null,
      proveedorId: datos.proveedorId ?? null,
      km: datos.km ?? null,
      archivoId: datos.archivoId ?? null,
      vencimientoId: v.id,
      personaId: ctx.personaId,
      creadoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId,
    })
    .returning();
  await tx.update(actVencimientos).set({ estado: 'hecho', completadoEn: datos.fecha, registroId: reg!.id }).where(eq(actVencimientos.id, v.id));
  if (datos.km && a && (a.km ?? 0) < datos.km) await tx.update(actActivos).set({ km: datos.km }).where(eq(actActivos.id, a.id));
  let siguiente: typeof actVencimientos.$inferSelect | null = null;
  if (v.periodicidadMeses && v.periodicidadMeses > 0) {
    // se mantiene el calendario: la siguiente fecha cuenta desde la que vencía (o desde hoy si se hizo tarde)
    const desde = datos.fecha > v.fecha ? datos.fecha : v.fecha;
    [siguiente] = await tx
      .insert(actVencimientos)
      .values({ empresaId: ctx.empresaId, activoId: v.activoId, tipo: v.tipo, descripcion: v.descripcion, fecha: sumarMeses(desde, v.periodicidadMeses), avisoDias: v.avisoDias, periodicidadMeses: v.periodicidadMeses, costeEstimado: v.costeEstimado, anteriorId: v.id })
      .returning();
  }
  return { registro: reg!, siguiente };
}

/** Avisa de los vencimientos que entran en su periodo de aviso (una sola vez cada uno). */
export async function avisarVencimientos(empresaId: string, ctx: Ctx) {
  const hoy = new Date().toISOString().slice(0, 10);
  const pendientes = await db
    .select({ v: actVencimientos, activo: actActivos.nombre, codigo: actActivos.codigo, matricula: actActivos.matricula, asignadoId: actActivos.asignadoId })
    .from(actVencimientos)
    .innerJoin(actActivos, eq(actActivos.id, actVencimientos.activoId))
    .where(and(eq(actVencimientos.empresaId, empresaId), eq(actVencimientos.estado, 'pendiente'), isNull(actVencimientos.avisadoEn), sql`${actVencimientos.fecha} - ${actVencimientos.avisoDias} <= ${hoy}::date`));
  if (!pendientes.length) return 0;
  await db.transaction(async (tx) => {
    for (const p of pendientes) {
      const vencido = p.v.fecha < hoy;
      const titulo = `${vencido ? 'Vencido' : 'Vence pronto'}: ${p.v.descripcion || p.v.tipo.toUpperCase()} de ${p.activo}${p.matricula ? ` (${p.matricula})` : ''}`;
      const cuerpo = `${vencido ? 'Venció' : 'Vence'} el ${p.v.fecha.split('-').reverse().join('/')}`;
      await notify(tx, ctx, { modulo: 'act', tipo: 'vencimiento', titulo, cuerpo, enlace: `/activos/${p.v.activoId}?tab=vencimientos`, permiso: 'act.gestionar', personaIds: [p.asignadoId], email: true });
    }
    await tx.update(actVencimientos).set({ avisadoEn: new Date() }).where(inArray(actVencimientos.id, pendientes.map((p) => p.v.id)));
  });
  return pendientes.length;
}

/** Resumen económico de un activo: amortización, valor neto contable y costes de uso. */
export async function resumenActivo(tx: DbOrTx, a: Activo) {
  const plan = planAmortizacion(a);
  const [am] = await tx.select({ s: sql<number>`coalesce(sum(${actAmortizaciones.importe}), 0)::float`, n: sql<number>`count(*)::int`, ultimo: sql<string | null>`max(${actAmortizaciones.periodo})` }).from(actAmortizaciones).where(eq(actAmortizaciones.activoId, a.id));
  const [c] = await tx
    .select({
      total: sql<number>`coalesce(sum(${actRegistros.coste}), 0)::float`,
      anio: sql<number>`coalesce(sum(${actRegistros.coste}) FILTER (WHERE ${actRegistros.fecha} >= (current_date - interval '1 year')), 0)::float`,
      combustible: sql<number>`coalesce(sum(${actRegistros.coste}) FILTER (WHERE ${actRegistros.tipo} = 'combustible'), 0)::float`,
      litros: sql<number>`coalesce(sum(${actRegistros.litros}) FILTER (WHERE ${actRegistros.tipo} = 'combustible'), 0)::float`,
      kmMin: sql<number | null>`min(${actRegistros.km})`,
      kmMax: sql<number | null>`max(${actRegistros.km})`,
    })
    .from(actRegistros)
    .where(eq(actRegistros.activoId, a.id));
  const kmRecorridos = c?.kmMin != null && c?.kmMax != null ? Math.max(0, (a.km ?? c.kmMax) - c.kmMin) : 0;
  const amortizado = round(am?.s ?? 0);
  return {
    amortizacion: plan ? { ...plan, amortizado, pendiente: round(plan.base - amortizado), cuotas: am?.n ?? 0, ultimoPeriodo: am?.ultimo ?? null, valorNeto: round((a.valorCompra ?? 0) - amortizado) } : null,
    costes: { total: round(c?.total ?? 0), ultimoAnio: round(c?.anio ?? 0), combustible: round(c?.combustible ?? 0), litros: round(c?.litros ?? 0, 2), kmRecorridos, costeKm: kmRecorridos > 0 ? round((c?.total ?? 0) / kmRecorridos, 3) : null, consumo100: kmRecorridos > 0 && c?.litros ? round((c.litros / kmRecorridos) * 100, 2) : null },
  };
}
