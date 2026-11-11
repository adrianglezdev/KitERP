/**
 * Panel de dirección: indicadores calculados sobre las tablas del núcleo (documentos, líneas, terceros,
 * artículos y personas). Cada bloque se calcula solo si el usuario tiene el permiso y el módulo activo,
 * y siempre limitado a su alcance (un comercial ve sus propias ventas).
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { round } from '@kite/shared';
import { db } from '../../db/client';
import { articulos, personas, terceros } from '../../db/schema/core';
import { documentoLineas, documentos } from '../../db/schema/documentos';
import type { Ctx } from '../../core/context';
import { can, scopeCondition } from '../../core/permissions';

const FACTURAS = ['factura', 'factura_rectificativa', 'factura_simplificada'];
const al = alias(documentoLineas, 'al');
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

export interface FiltrosPanel {
  desde: string;
  hasta: string;
  comercialId?: string | null;
  familiaId?: string | null;
}

async function alcance(ctx: Ctx, mod: string): Promise<{ ok: boolean; cond?: SQL }> {
  const s = ctx.perms.get(`${mod}.ver`);
  if (!s || !ctx.modules.has(mod)) return { ok: false };
  return { ok: true, cond: await scopeCondition(ctx, s, documentos.comercialId) };
}

const addYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;
const pctDelta = (a: number, b: number) => (b ? round(((a - b) / Math.abs(b)) * 100, 1) : null);

export async function panelDireccion(ctx: Ctx, f: FiltrosPanel) {
  const e = ctx.empresaId;
  const fac = await alcance(ctx, 'fac');
  const pre = await alcance(ctx, 'pre');
  const ped = await alcance(ctx, 'ped');
  const cpr = await alcance(ctx, 'cpr');
  const verMargen = fac.ok && (can(ctx, 'pre.editar') || can(ctx, 'pre.aprobar'));
  const verCobros = fac.ok || (can(ctx, 'tes.ver') && ctx.modules.has('tes'));
  const comercial = f.comercialId ? eq(documentos.comercialId, f.comercialId) : undefined;
  const familia = f.familiaId ? sql`${articulos.familiaId} = ${f.familiaId}` : undefined;
  const out: Record<string, unknown> = { filtros: f, permisos: { ventas: fac.ok, presupuestos: pre.ok, pedidos: ped.ok, compras: cpr.ok, margen: verMargen, cobros: verCobros } };

  /* ── Ventas ── */
  if (fac.ok) {
    const baseFacturas = and(eq(documentos.empresaId, e), inArray(documentos.tipo, FACTURAS), eq(documentos.bloqueado, true), fac.cond, comercial);
    // importe por línea si se filtra por familia; si no, base de la factura
    const ventasEntre = async (desde: string, hasta: string) => {
      if (f.familiaId) {
        const [r] = await db
          .select({ base: sql<string>`coalesce(sum(${documentoLineas.subtotal} * (1 - ${documentos.descuentoGlobal} / 100)), 0)`, margen: sql<string>`coalesce(sum(${documentoLineas.subtotal} * (1 - ${documentos.descuentoGlobal} / 100) - ${documentoLineas.cantidad} * ${documentoLineas.coste}), 0)`, n: sql<number>`count(DISTINCT ${documentos.id})::int` })
          .from(documentoLineas)
          .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
          .innerJoin(articulos, eq(articulos.id, documentoLineas.articuloId))
          .where(and(baseFacturas, familia, gte(documentos.fecha, desde), lte(documentos.fecha, hasta)));
        return { base: round(Number(r?.base ?? 0)), margen: round(Number(r?.margen ?? 0)), n: r?.n ?? 0, total: 0 };
      }
      const [r] = await db
        .select({ base: sql<string>`coalesce(sum(${documentos.baseImponible}), 0)`, margen: sql<string>`coalesce(sum(${documentos.margen}), 0)`, total: sql<string>`coalesce(sum(${documentos.total}), 0)`, n: sql<number>`count(*)::int` })
        .from(documentos)
        .where(and(baseFacturas, gte(documentos.fecha, desde), lte(documentos.fecha, hasta)));
      return { base: round(Number(r?.base ?? 0)), margen: round(Number(r?.margen ?? 0)), n: r?.n ?? 0, total: round(Number(r?.total ?? 0)) };
    };
    const actual = await ventasEntre(f.desde, f.hasta);
    const anterior = await ventasEntre(addYears(f.desde, -1), addYears(f.hasta, -1));
    out.ventas = {
      base: actual.base,
      facturas: actual.n,
      ticketMedio: actual.n ? round(actual.base / actual.n) : 0,
      anterior: anterior.base,
      delta: pctDelta(actual.base, anterior.base),
      margen: verMargen ? actual.margen : null,
      margenPct: verMargen && actual.base ? round((actual.margen / actual.base) * 100, 1) : null,
    };

    // por mes: año de "hasta" frente al anterior
    const anio = Number(f.hasta.slice(0, 4));
    const porMes = async (y: number) => {
      const q = f.familiaId
        ? db
            .select({ m: sql<number>`extract(month from ${documentos.fecha})::int`, base: sql<string>`sum(${documentoLineas.subtotal} * (1 - ${documentos.descuentoGlobal} / 100))`, margen: sql<string>`sum(${documentoLineas.subtotal} * (1 - ${documentos.descuentoGlobal} / 100) - ${documentoLineas.cantidad} * ${documentoLineas.coste})` })
            .from(documentoLineas)
            .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
            .innerJoin(articulos, eq(articulos.id, documentoLineas.articuloId))
            .where(and(baseFacturas, familia, gte(documentos.fecha, `${y}-01-01`), lte(documentos.fecha, `${y}-12-31`)))
            .groupBy(sql`extract(month from ${documentos.fecha})`)
        : db
            .select({ m: sql<number>`extract(month from ${documentos.fecha})::int`, base: sql<string>`sum(${documentos.baseImponible})`, margen: sql<string>`sum(${documentos.margen})` })
            .from(documentos)
            .where(and(baseFacturas, gte(documentos.fecha, `${y}-01-01`), lte(documentos.fecha, `${y}-12-31`)))
            .groupBy(sql`extract(month from ${documentos.fecha})`);
      return q;
    };
    const [a1, a0] = await Promise.all([porMes(anio), porMes(anio - 1)]);
    out.ventasMes = MESES.map((mes, i) => {
      const r1 = a1.find((r) => Number(r.m) === i + 1);
      const r0 = a0.find((r) => Number(r.m) === i + 1);
      const base = round(Number(r1?.base ?? 0));
      const margen = round(Number(r1?.margen ?? 0));
      return { mes, actual: base, anterior: round(Number(r0?.base ?? 0)), ...(verMargen ? { margen, margenPct: base ? round((margen / base) * 100, 1) : 0 } : {}) };
    });
    out.anio = anio;

    const periodo = and(baseFacturas, gte(documentos.fecha, f.desde), lte(documentos.fecha, f.hasta));
    out.topClientes = (
      await db
        .select({ id: terceros.id, nombre: terceros.nombre, base: sql<string>`sum(${documentos.baseImponible})`, n: sql<number>`count(*)::int` })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .where(periodo)
        .groupBy(terceros.id, terceros.nombre)
        .orderBy(desc(sql`sum(${documentos.baseImponible})`))
        .limit(10)
    ).map((r) => ({ id: r.id, nombre: r.nombre, importe: round(Number(r.base)), facturas: r.n }));
    out.topArticulos = (
      await db
        .select({ id: articulos.id, referencia: articulos.referencia, nombre: articulos.nombre, importe: sql<string>`sum(${documentoLineas.subtotal} * (1 - ${documentos.descuentoGlobal} / 100))`, cantidad: sql<string>`sum(${documentoLineas.cantidad})` })
        .from(documentoLineas)
        .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
        .innerJoin(articulos, eq(articulos.id, documentoLineas.articuloId))
        .where(and(periodo, familia))
        .groupBy(articulos.id, articulos.referencia, articulos.nombre)
        .orderBy(desc(sql`sum(${documentoLineas.subtotal} * (1 - ${documentos.descuentoGlobal} / 100))`))
        .limit(10)
    ).map((r) => ({ id: r.id, referencia: r.referencia, nombre: r.nombre, importe: round(Number(r.importe)), cantidad: round(Number(r.cantidad), 2) }));
    out.topComerciales = (
      await db
        .select({ id: personas.id, nombre: nombrePersona, base: sql<string>`sum(${documentos.baseImponible})`, margen: sql<string>`sum(${documentos.margen})`, n: sql<number>`count(*)::int` })
        .from(documentos)
        .innerJoin(personas, eq(personas.id, documentos.comercialId))
        .where(periodo)
        .groupBy(personas.id, personas.nombre, personas.apellidos)
        .orderBy(desc(sql`sum(${documentos.baseImponible})`))
        .limit(10)
    ).map((r) => ({ id: r.id, nombre: r.nombre, importe: round(Number(r.base)), margen: verMargen ? round(Number(r.margen)) : null, facturas: r.n }));
  }

  /* ── Pendiente de cobro y DSO ── */
  if (verCobros) {
    const cond = fac.ok ? fac.cond : undefined;
    const pagadoSub = ctx.modules.has('tes') ? sql`coalesce((SELECT sum(v.importe_pagado) FROM tes_vencimientos v WHERE v.documento_id = ${documentos.id}), 0)` : sql`0`;
    const rows = await db
      .select({ id: documentos.id, fecha: documentos.fecha, total: documentos.total, pagado: sql<string>`${pagadoSub}`, estadoPago: documentos.estadoPago })
      .from(documentos)
      .where(and(eq(documentos.empresaId, e), inArray(documentos.tipo, FACTURAS), eq(documentos.bloqueado, true), inArray(documentos.estadoPago, ['pendiente', 'parcial', 'impagado']), cond, comercial));
    const hoy = new Date().toISOString().slice(0, 10);
    const tramos = [
      { tramo: '0-30 días', importe: 0 },
      { tramo: '31-60 días', importe: 0 },
      { tramo: '61-90 días', importe: 0 },
      { tramo: 'Más de 90', importe: 0 },
    ];
    let pendiente = 0;
    let impagado = 0;
    for (const r of rows) {
      const p = round(r.total - Number(r.pagado));
      if (p <= 0) continue;
      pendiente += p;
      if (r.estadoPago === 'impagado') impagado += p;
      const dias = Math.floor((Date.parse(hoy) - Date.parse(r.fecha)) / 86400_000);
      tramos[dias <= 30 ? 0 : dias <= 60 ? 1 : dias <= 90 ? 2 : 3]!.importe = round(tramos[dias <= 30 ? 0 : dias <= 60 ? 1 : dias <= 90 ? 2 : 3]!.importe + p);
    }
    const hace90 = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const [v90] = await db
      .select({ t: sql<string>`coalesce(sum(${documentos.total}), 0)` })
      .from(documentos)
      .where(and(eq(documentos.empresaId, e), inArray(documentos.tipo, FACTURAS), eq(documentos.bloqueado, true), gte(documentos.fecha, hace90), cond, comercial));
    const ventas90 = Number(v90?.t ?? 0);
    out.cobros = { pendiente: round(pendiente), impagado: round(impagado), facturas: rows.length, dso: ventas90 > 0 ? Math.round((pendiente / ventas90) * 90) : null, tramos };
  }

  /* ── Cartera de pedidos ── */
  if (ped.ok) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int`, base: sql<string>`coalesce(sum(${documentos.baseImponible}), 0)` })
      .from(documentos)
      .where(and(eq(documentos.empresaId, e), eq(documentos.tipo, 'pedido'), inArray(documentos.estado, ['confirmado', 'en_preparacion', 'parcial']), isNull(documentos.archivadoEn), ped.cond, comercial));
    // lo ya servido de los pedidos parciales (líneas trasladadas a albaranes)
    const [serv] = await db
      .select({ s: sql<string>`coalesce(sum(${al.subtotal}), 0)` })
      .from(documentoLineas)
      .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
      .innerJoin(al, eq(al.lineaOrigenId, documentoLineas.id))
      .where(and(eq(documentos.empresaId, e), eq(documentos.tipo, 'pedido'), eq(documentos.estado, 'parcial'), ped.cond, comercial));
    out.cartera = { pedidos: r?.n ?? 0, importe: round(Number(r?.base ?? 0) - Number(serv?.s ?? 0)) };
  }

  /* ── Presupuestos: embudo y tasa de aceptación ── */
  if (pre.ok) {
    const [r] = await db
      .select({
        creados: sql<number>`count(*)::int`,
        enviados: sql<number>`count(*) FILTER (WHERE ${documentos.enviadoEn} IS NOT NULL OR ${documentos.estado} IN ('enviado','visto','aceptado','rechazado','caducado'))::int`,
        vistos: sql<number>`count(*) FILTER (WHERE ${documentos.vistoEn} IS NOT NULL OR ${documentos.estado} IN ('visto','aceptado'))::int`,
        aceptados: sql<number>`count(*) FILTER (WHERE ${documentos.estado} = 'aceptado')::int`,
        rechazados: sql<number>`count(*) FILTER (WHERE ${documentos.estado} IN ('rechazado','caducado'))::int`,
        importeAceptado: sql<string>`coalesce(sum(${documentos.baseImponible}) FILTER (WHERE ${documentos.estado} = 'aceptado'), 0)`,
        importeAbierto: sql<string>`coalesce(sum(${documentos.baseImponible}) FILTER (WHERE ${documentos.estado} IN ('enviado','visto','pendiente_aprobacion')), 0)`,
      })
      .from(documentos)
      .where(
        and(
          eq(documentos.empresaId, e),
          eq(documentos.tipo, 'presupuesto'),
          isNull(documentos.archivadoEn),
          gte(documentos.fecha, f.desde),
          lte(documentos.fecha, f.hasta),
          pre.cond,
          comercial,
          // solo la última versión de cada presupuesto
          sql`${documentos.version} = (SELECT max(d2.version) FROM documentos d2 WHERE d2.grupo_id = ${documentos.grupoId})`,
        ),
      );
    const decididos = (r?.aceptados ?? 0) + (r?.rechazados ?? 0);
    out.presupuestos = {
      embudo: [
        { etapa: 'Creados', n: r?.creados ?? 0 },
        { etapa: 'Enviados', n: r?.enviados ?? 0 },
        { etapa: 'Vistos', n: r?.vistos ?? 0 },
        { etapa: 'Aceptados', n: r?.aceptados ?? 0 },
      ],
      tasaAceptacion: decididos ? round(((r?.aceptados ?? 0) / decididos) * 100, 1) : null,
      importeAceptado: round(Number(r?.importeAceptado ?? 0)),
      importeAbierto: round(Number(r?.importeAbierto ?? 0)),
    };
  }

  /* ── Compras por proveedor ── */
  if (cpr.ok) {
    out.comprasProveedor = (
      await db
        .select({ id: terceros.id, nombre: terceros.nombre, base: sql<string>`sum(${documentos.baseImponible})`, n: sql<number>`count(*)::int` })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .where(and(eq(documentos.empresaId, e), eq(documentos.tipo, 'factura_proveedor'), eq(documentos.bloqueado, true), gte(documentos.fecha, f.desde), lte(documentos.fecha, f.hasta), cpr.cond))
        .groupBy(terceros.id, terceros.nombre)
        .orderBy(desc(sql`sum(${documentos.baseImponible})`))
        .limit(10)
    ).map((r) => ({ id: r.id, nombre: r.nombre, importe: round(Number(r.base)), facturas: r.n }));
  }
  return out;
}

/** Ventas del mes frente al mes anterior (indicador del inicio). */
export async function ventasMes(ctx: Ctx) {
  const s = ctx.perms.get('fac.ver');
  if (!s || !ctx.modules.has('fac')) return null;
  const cond = await scopeCondition(ctx, s, documentos.comercialId);
  const d = new Date();
  const ini = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
  const iniAnt = new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1)).toISOString().slice(0, 10);
  const hoy = d.toISOString().slice(0, 10);
  // mismo número de días del mes anterior, para comparar lo comparable
  const finAnt = new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0)).getUTCDate()))).toISOString().slice(0, 10);
  const suma = async (desde: string, hasta: string) => {
    const [r] = await db
      .select({ b: sql<string>`coalesce(sum(${documentos.baseImponible}), 0)` })
      .from(documentos)
      .where(and(eq(documentos.empresaId, ctx.empresaId), inArray(documentos.tipo, FACTURAS), eq(documentos.bloqueado, true), gte(documentos.fecha, desde), lte(documentos.fecha, hasta), cond));
    return round(Number(r?.b ?? 0));
  };
  const actual = await suma(ini, hoy);
  const anterior = await suma(iniAnt, finAnt);
  return { actual, anterior, delta: pctDelta(actual, anterior) };
}
