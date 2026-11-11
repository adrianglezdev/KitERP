/**
 * Modelos tributarios calculados a partir de las facturas (núcleo), los gastos y las nóminas contabilizadas.
 * No se genera el fichero oficial: se muestran las casillas que hay que trasladar a la sede de la AEAT,
 * con el desglose que las justifica.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { round, type cntShared } from '@kite/shared';
import { db } from '../../db/client';
import { articulos, personas, terceros } from '../../db/schema/core';
import { documentoImpuestos, documentoLineas, documentos } from '../../db/schema/documentos';
import type { Ctx } from '../../core/context';
import { gasGastos } from '../gas/schema';
import { cntApuntes, cntAsientos, cntTercerosFiscal } from './schema';

type Casilla = cntShared.CasillaModelo;
const VENTAS = ['factura', 'factura_rectificativa', 'factura_simplificada'];

export function rangoTrimestre(anio: number, t: number) {
  const m1 = (t - 1) * 3 + 1;
  const fin = new Date(Date.UTC(anio, m1 + 2, 0)).toISOString().slice(0, 10);
  return { desde: `${anio}-${String(m1).padStart(2, '0')}-01`, hasta: fin };
}
const trimestreDe = (fecha: string) => Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1;
const c = (casilla: string, concepto: string, importe: number, tipo: Casilla['tipo'] = 'cuota', destacado = false): Casilla => ({ casilla, concepto, importe: round(importe), tipo, destacado });

/** Facturas (con su desglose de IVA) de un periodo. */
async function facturasConImpuestos(empresaId: string, tipos: string[], desde: string, hasta: string) {
  return db
    .select({
      id: documentos.id,
      tipo: documentos.tipo,
      fecha: documentos.fecha,
      codigo: documentos.codigo,
      regimen: documentos.regimenIva,
      terceroId: documentos.terceroId,
      total: documentos.total,
      base: documentos.baseImponible,
      retencion: documentos.totalRetencion,
      datos: documentos.datosTercero,
      nombre: terceros.nombre,
      nif: terceros.nif,
      pais: terceros.pais,
      imps: sql<{ ivaTipo: number; base: number; cuota: number; recargoPct: number; cuotaRecargo: number }[]>`coalesce((SELECT json_agg(json_build_object('ivaTipo', i.iva_tipo::float, 'base', i.base::float, 'cuota', i.cuota::float, 'recargoPct', i.recargo_pct::float, 'cuotaRecargo', i.cuota_recargo::float)) FROM ${documentoImpuestos} i WHERE i.documento_id = ${documentos.id}), '[]'::json)`,
    })
    .from(documentos)
    .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
    .where(and(eq(documentos.empresaId, empresaId), inArray(documentos.tipo, tipos), eq(documentos.bloqueado, true), gte(documentos.fecha, desde), lte(documentos.fecha, hasta)));
}

async function tiposRetencion(empresaId: string) {
  const rows = await db.select().from(cntTercerosFiscal).where(eq(cntTercerosFiscal.empresaId, empresaId));
  return new Map(rows.map((r) => [r.terceroId, r]));
}

/* ───────────── 303: IVA trimestral ───────────── */

export async function modelo303(ctx: Ctx, anio: number, t: number, depth = 0): Promise<{ casillas: Casilla[]; detalle: Record<string, unknown>; resultado: number; tipoResultado: string }> {
  const { desde, hasta } = rangoTrimestre(anio, t);
  const ventas = await facturasConImpuestos(ctx.empresaId, VENTAS, desde, hasta);
  const compras = await facturasConImpuestos(ctx.empresaId, ['factura_proveedor'], desde, hasta);
  const dev: Record<string, { base: number; cuota: number }> = {};
  const add = (k: string, base: number, cuota: number) => {
    dev[k] = { base: round((dev[k]?.base ?? 0) + base), cuota: round((dev[k]?.cuota ?? 0) + cuota) };
  };
  let entregasIntra = 0;
  let exportaciones = 0;
  let ispVentas = 0;
  for (const f of ventas) {
    if (f.regimen === 'intracomunitario') {
      entregasIntra += f.base;
      continue;
    }
    if (f.regimen === 'exportacion') {
      exportaciones += f.base;
      continue;
    }
    if (f.regimen === 'isp') {
      ispVentas += f.base;
      continue;
    }
    for (const i of f.imps) {
      if (f.tipo === 'factura_rectificativa') {
        add('rect', i.base, i.cuota);
        if (i.cuotaRecargo) add('rectRE', i.base, i.cuotaRecargo);
        continue;
      }
      add(`iva${i.ivaTipo}`, i.base, i.cuota);
      if (i.recargoPct) add(`re${i.recargoPct}`, i.base, i.cuotaRecargo);
    }
  }
  // Soportado deducible
  let dedBase = 0;
  let dedCuota = 0;
  let intraBase = 0;
  let ispBase = 0;
  for (const f of compras) {
    if (f.regimen === 'intracomunitario') {
      intraBase += f.base;
      continue;
    }
    if (f.regimen === 'isp') {
      ispBase += f.base;
      continue;
    }
    for (const i of f.imps) {
      dedBase += i.base;
      dedCuota += i.cuota + i.cuotaRecargo;
    }
  }
  let gastosBase = 0;
  let gastosIva = 0;
  if (ctx.modules.has('gas')) {
    const [g] = await db
      .select({ base: sql<string>`coalesce(sum(${gasGastos.base}), 0)`, iva: sql<string>`coalesce(sum(${gasGastos.iva}), 0)` })
      .from(gasGastos)
      .where(and(eq(gasGastos.empresaId, ctx.empresaId), eq(gasGastos.estado, 'liquidado'), sql`${gasGastos.iva} > 0`, gte(gasGastos.fecha, desde), lte(gasGastos.fecha, hasta)));
    gastosBase = round(Number(g?.base ?? 0));
    gastosIva = round(Number(g?.iva ?? 0));
    dedBase += gastosBase;
    dedCuota += gastosIva;
  }
  const autoIntra = round(intraBase * 0.21);
  const autoIsp = round(ispBase * 0.21);
  const g = (k: string) => dev[k] ?? { base: 0, cuota: 0 };
  const otrosTipos = Object.keys(dev).filter((k) => k.startsWith('iva') && !['iva4', 'iva10', 'iva21', 'iva0'].includes(k));
  const otros = otrosTipos.reduce((a, k) => ({ base: a.base + dev[k]!.base, cuota: a.cuota + dev[k]!.cuota }), { base: 0, cuota: 0 });
  const total27 = round(g('iva4').cuota + g('iva10').cuota + g('iva21').cuota + otros.cuota + autoIntra + autoIsp + g('rect').cuota + g('re0.5').cuota + g('re1.4').cuota + g('re5.2').cuota + g('rectRE').cuota);
  const total45 = round(dedCuota + autoIntra + autoIsp);
  const r46 = round(total27 - total45);

  // cuotas a compensar de trimestres anteriores del mismo año
  let aCompensar = 0;
  if (t > 1 && depth === 0) {
    let arrastre = 0;
    for (let q = 1; q < t; q++) {
      const prev = await modelo303(ctx, anio, q, 1);
      const neto = round(prev.resultado + 0);
      arrastre = round(Math.min(0, neto + arrastre));
    }
    aCompensar = round(-arrastre);
  }
  const r69 = round(r46 - Math.min(aCompensar, Math.max(r46, 0)));
  const resultado = depth ? r46 : r69;
  const casillas: Casilla[] = [
    c('01', 'Régimen general 4 %: base imponible', g('iva4').base, 'base'),
    c('03', 'Régimen general 4 %: cuota', g('iva4').cuota),
    c('04', 'Régimen general 10 %: base imponible', g('iva10').base, 'base'),
    c('06', 'Régimen general 10 %: cuota', g('iva10').cuota),
    c('07', 'Régimen general 21 %: base imponible', g('iva21').base, 'base'),
    c('09', 'Régimen general 21 %: cuota', g('iva21').cuota),
    ...(otros.base ? [c('153', 'Otros tipos: base imponible', otros.base, 'base'), c('155', 'Otros tipos: cuota', otros.cuota)] : []),
    c('10', 'Adquisiciones intracomunitarias: base', intraBase, 'base'),
    c('11', 'Adquisiciones intracomunitarias: cuota (autoliquidada al 21 %)', autoIntra),
    c('12', 'Otras operaciones con inversión del sujeto pasivo: base', ispBase, 'base'),
    c('13', 'Otras operaciones con inversión del sujeto pasivo: cuota', autoIsp),
    c('14', 'Modificación de bases (rectificativas)', g('rect').base, 'base'),
    c('15', 'Modificación de cuotas (rectificativas)', g('rect').cuota),
    c('16', 'Recargo de equivalencia 0,5 %: base', g('re0.5').base, 'base'),
    c('18', 'Recargo de equivalencia 0,5 %: cuota', g('re0.5').cuota),
    c('19', 'Recargo de equivalencia 1,4 %: base', g('re1.4').base, 'base'),
    c('21', 'Recargo de equivalencia 1,4 %: cuota', g('re1.4').cuota),
    c('22', 'Recargo de equivalencia 5,2 %: base', g('re5.2').base, 'base'),
    c('24', 'Recargo de equivalencia 5,2 %: cuota', g('re5.2').cuota),
    c('25', 'Modificación recargo de equivalencia: base', g('rectRE').base, 'base'),
    c('26', 'Modificación recargo de equivalencia: cuota', g('rectRE').cuota),
    c('27', 'Total cuota devengada', total27, 'total', true),
    c('28', 'IVA deducible en operaciones interiores corrientes: base', round(dedBase + ispBase), 'base'),
    c('29', 'IVA deducible en operaciones interiores corrientes: cuota', round(dedCuota + autoIsp)),
    c('36', 'IVA deducible en adquisiciones intracomunitarias corrientes: base', intraBase, 'base'),
    c('37', 'IVA deducible en adquisiciones intracomunitarias corrientes: cuota', autoIntra),
    c('45', 'Total a deducir', total45, 'total', true),
    c('46', 'Resultado régimen general (27 − 45)', r46, 'total', true),
    c('59', 'Entregas intracomunitarias de bienes y servicios', entregasIntra, 'base'),
    c('60', 'Exportaciones y operaciones asimiladas', exportaciones, 'base'),
    c('122', 'Operaciones sujetas con inversión del sujeto pasivo', ispVentas, 'base'),
    c('64', 'Suma de resultados', r46, 'total'),
    c('65', '% atribuible a la Administración del Estado', 100, 'porcentaje'),
    c('66', 'Atribuible a la Administración del Estado', r46, 'total'),
    c('110', 'Cuotas a compensar pendientes de periodos anteriores', aCompensar),
    c('78', 'Cuotas a compensar aplicadas en este periodo', Math.min(aCompensar, Math.max(r46, 0))),
    c('69', 'Resultado', r69, 'total', true),
    c('71', 'Resultado de la liquidación', r69, 'total', true),
  ];
  const tipoResultado = r69 > 0 ? 'A ingresar' : r69 < 0 ? (t === 4 ? 'A devolver o a compensar' : 'A compensar en el siguiente trimestre') : 'Sin actividad / cero';
  return {
    casillas,
    resultado,
    tipoResultado,
    detalle: {
      periodo: { desde, hasta },
      facturasEmitidas: ventas.length,
      facturasRecibidas: compras.length,
      gastosEmpleados: { base: gastosBase, iva: gastosIva },
    },
  };
}

/* ───────────── 390: resumen anual de IVA ───────────── */

export async function modelo390(ctx: Ctx, anio: number) {
  const trimestres: { trimestre: number; devengado: number; deducible: number; resultado: number; base21: number; base10: number; base4: number; entregasIntra: number; exportaciones: number }[] = [];
  for (let t = 1; t <= 4; t++) {
    const m = await modelo303(ctx, anio, t, 1);
    const v = (k: string) => m.casillas.find((x) => x.casilla === k)?.importe ?? 0;
    trimestres.push({ trimestre: t, devengado: v('27'), deducible: v('45'), resultado: v('46'), base21: v('07'), base10: v('04'), base4: v('01'), entregasIntra: v('59'), exportaciones: v('60') });
  }
  const s = (k: keyof (typeof trimestres)[number]) => round(trimestres.reduce((a, x) => a + (x[k] as number), 0));
  const volumen = round(s('base21') + s('base10') + s('base4') + s('entregasIntra') + s('exportaciones'));
  const casillas: Casilla[] = [
    c('01', 'Base imponible al 4 %', s('base4'), 'base'),
    c('03', 'Base imponible al 10 %', s('base10'), 'base'),
    c('05', 'Base imponible al 21 %', s('base21'), 'base'),
    c('47', 'Total cuotas de IVA devengado', s('devengado'), 'total', true),
    c('64', 'Total cuotas deducibles', s('deducible'), 'total', true),
    c('65', 'Resultado régimen general', s('resultado'), 'total', true),
    c('99', 'Entregas intracomunitarias exentas', s('entregasIntra'), 'base'),
    c('103', 'Exportaciones', s('exportaciones'), 'base'),
    c('108', 'Total volumen de operaciones', volumen, 'total', true),
  ];
  return { casillas, trimestres, resultado: s('resultado') };
}

/* ───────────── Retenciones: 111, 115, 180, 190 ───────────── */

async function retencionesProveedores(ctx: Ctx, desde: string, hasta: string) {
  const fiscal = await tiposRetencion(ctx.empresaId);
  const rows = (await facturasConImpuestos(ctx.empresaId, ['factura_proveedor'], desde, hasta)).filter((f) => Math.abs(f.retencion) > 0.004);
  const por = (tipo: 'profesional' | 'alquiler') => {
    const map = new Map<string, { terceroId: string; nif: string | null; nombre: string; base: number; retencion: number; facturas: number; trimestres: Record<number, { base: number; retencion: number }> }>();
    for (const f of rows) {
      const tr = fiscal.get(f.terceroId)?.tipoRetencion ?? 'profesional';
      if ((tipo === 'alquiler') !== (tr === 'alquiler')) continue;
      const cur = map.get(f.terceroId) ?? { terceroId: f.terceroId, nif: f.nif, nombre: f.nombre, base: 0, retencion: 0, facturas: 0, trimestres: {} };
      cur.base = round(cur.base + f.base);
      cur.retencion = round(cur.retencion + f.retencion);
      cur.facturas++;
      const q = trimestreDe(f.fecha);
      cur.trimestres[q] = { base: round((cur.trimestres[q]?.base ?? 0) + f.base), retencion: round((cur.trimestres[q]?.retencion ?? 0) + f.retencion) };
      map.set(f.terceroId, cur);
    }
    return [...map.values()].sort((a, b) => b.base - a.base);
  };
  return { profesionales: por('profesional'), alquileres: por('alquiler') };
}

/** Nóminas contabilizadas (asientos de origen nom): bruto en 640 y retenciones en 4751. */
async function retencionesTrabajo(ctx: Ctx, desde: string, hasta: string) {
  const [r] = await db
    .select({
      bruto: sql<string>`coalesce(sum(CASE WHEN ${cntApuntes.cuenta} LIKE '640%' THEN ${cntApuntes.debe} - ${cntApuntes.haber} ELSE 0 END), 0)`,
      irpf: sql<string>`coalesce(sum(CASE WHEN ${cntApuntes.cuenta} LIKE '4751%' THEN ${cntApuntes.haber} - ${cntApuntes.debe} ELSE 0 END), 0)`,
      meses: sql<number>`count(DISTINCT ${cntAsientos.id})::int`,
    })
    .from(cntApuntes)
    .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
    .where(and(eq(cntAsientos.empresaId, ctx.empresaId), eq(cntAsientos.origen, 'nom'), gte(cntAsientos.fecha, desde), lte(cntAsientos.fecha, hasta)));
  const [p] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(personas)
    .where(and(eq(personas.empresaId, ctx.empresaId), eq(personas.activo, true), isNull(personas.archivadoEn)));
  return { bruto: round(Number(r?.bruto ?? 0)), irpf: round(Number(r?.irpf ?? 0)), nominas: r?.meses ?? 0, perceptores: Number(r?.bruto ?? 0) > 0 ? (p?.n ?? 0) : 0 };
}

export async function modelo111(ctx: Ctx, anio: number, t: number) {
  const { desde, hasta } = rangoTrimestre(anio, t);
  const trabajo = await retencionesTrabajo(ctx, desde, hasta);
  const { profesionales } = await retencionesProveedores(ctx, desde, hasta);
  const base = round(profesionales.reduce((a, p) => a + p.base, 0));
  const ret = round(profesionales.reduce((a, p) => a + p.retencion, 0));
  const total = round(trabajo.irpf + ret);
  return {
    casillas: [
      c('01', 'Rendimientos del trabajo (dinerarios): nº de perceptores', trabajo.perceptores, 'numero'),
      c('02', 'Rendimientos del trabajo: importe de las percepciones', trabajo.bruto, 'base'),
      c('03', 'Rendimientos del trabajo: importe de las retenciones', trabajo.irpf),
      c('07', 'Actividades económicas (profesionales): nº de perceptores', profesionales.length, 'numero'),
      c('08', 'Actividades económicas: importe de las percepciones', base, 'base'),
      c('09', 'Actividades económicas: importe de las retenciones', ret),
      c('28', 'Total liquidación (suma de retenciones)', total, 'total', true),
      c('30', 'Resultado a ingresar', total, 'total', true),
    ],
    detalle: { periodo: { desde, hasta }, nominasContabilizadas: trabajo.nominas, profesionales, avisoPerceptores: 'El nº de perceptores del trabajo se estima con las personas activas: compruébalo con el resumen de Nóminas.' },
    resultado: total,
    tipoResultado: total > 0 ? 'A ingresar' : 'Sin retenciones',
  };
}

export async function modelo115(ctx: Ctx, anio: number, t: number) {
  const { desde, hasta } = rangoTrimestre(anio, t);
  const { alquileres } = await retencionesProveedores(ctx, desde, hasta);
  const base = round(alquileres.reduce((a, p) => a + p.base, 0));
  const ret = round(alquileres.reduce((a, p) => a + p.retencion, 0));
  return {
    casillas: [
      c('01', 'Nº de perceptores (arrendadores)', alquileres.length, 'numero'),
      c('02', 'Base de las retenciones', base, 'base'),
      c('03', 'Retenciones e ingresos a cuenta', ret),
      c('05', 'Resultado a ingresar', ret, 'total', true),
    ],
    detalle: { periodo: { desde, hasta }, arrendadores: alquileres, aviso: alquileres.length ? null : 'Marca los proveedores que te alquilan locales en Contabilidad → Terceros (retención: alquiler).' },
    resultado: ret,
    tipoResultado: ret > 0 ? 'A ingresar' : 'Sin retenciones',
  };
}

export async function modelo180(ctx: Ctx, anio: number) {
  const { alquileres } = await retencionesProveedores(ctx, `${anio}-01-01`, `${anio}-12-31`);
  const base = round(alquileres.reduce((a, p) => a + p.base, 0));
  const ret = round(alquileres.reduce((a, p) => a + p.retencion, 0));
  return {
    casillas: [c('01', 'Nº total de perceptores', alquileres.length, 'numero'), c('02', 'Base de las retenciones', base, 'base'), c('03', 'Retenciones e ingresos a cuenta', ret, 'total', true)],
    perceptores: alquileres.map((p) => ({ nif: p.nif, nombre: p.nombre, clave: 'Arrendamiento de inmueble urbano', base: p.base, retencion: p.retencion, porcentaje: p.base ? round((p.retencion / p.base) * 100, 2) : 0 })),
    resultado: ret,
  };
}

export async function modelo190(ctx: Ctx, anio: number) {
  const trabajo = await retencionesTrabajo(ctx, `${anio}-01-01`, `${anio}-12-31`);
  const { profesionales } = await retencionesProveedores(ctx, `${anio}-01-01`, `${anio}-12-31`);
  const perceptores = [
    ...(trabajo.bruto ? [{ nif: null, nombre: 'Trabajadores (detalle por persona en Nóminas)', clave: 'A · Rendimientos del trabajo', base: trabajo.bruto, retencion: trabajo.irpf }] : []),
    ...profesionales.map((p) => ({ nif: p.nif, nombre: p.nombre, clave: 'G · Actividades profesionales', base: p.base, retencion: p.retencion })),
  ];
  const base = round(perceptores.reduce((a, p) => a + p.base, 0));
  const ret = round(perceptores.reduce((a, p) => a + p.retencion, 0));
  return {
    casillas: [c('01', 'Nº total de perceptores (aprox.)', trabajo.perceptores + profesionales.length, 'numero'), c('02', 'Importe total de las percepciones', base, 'base'), c('03', 'Importe total de las retenciones', ret, 'total', true)],
    perceptores,
    resultado: ret,
  };
}

/* ───────────── 347: operaciones con terceros > 3.005,06 € ───────────── */

export async function modelo347(ctx: Ctx, anio: number) {
  const fiscal = await tiposRetencion(ctx.empresaId);
  const docs = await facturasConImpuestos(ctx.empresaId, ['factura', 'factura_rectificativa', 'factura_proveedor'], `${anio}-01-01`, `${anio}-12-31`);
  const map = new Map<string, { terceroId: string; nif: string | null; nombre: string; clave: string; total: number; trimestres: [number, number, number, number] }>();
  for (const d of docs) {
    if (['intracomunitario', 'exportacion'].includes(d.regimen)) continue; // van en el 349
    if (Math.abs(d.retencion) > 0.004) continue; // declaradas en 190/180
    if (fiscal.get(d.terceroId)?.excluir347) continue;
    const clave = d.tipo === 'factura_proveedor' ? 'A' : 'B';
    const k = `${d.terceroId}:${clave}`;
    const cur = map.get(k) ?? { terceroId: d.terceroId, nif: (d.datos as any)?.nif ?? d.nif, nombre: (d.datos as any)?.razonSocial ?? d.nombre, clave, total: 0, trimestres: [0, 0, 0, 0] as [number, number, number, number] };
    cur.total = round(cur.total + d.total);
    const q = trimestreDe(d.fecha) - 1;
    cur.trimestres[q] = round(cur.trimestres[q] + d.total);
    map.set(k, cur);
  }
  const declarados = [...map.values()].filter((x) => Math.abs(x.total) > 3005.06).sort((a, b) => a.clave.localeCompare(b.clave) || b.total - a.total);
  return {
    umbral: 3005.06,
    declarados: declarados.map((d) => ({ ...d, claveTexto: d.clave === 'A' ? 'A · Adquisiciones (compras)' : 'B · Entregas (ventas)' })),
    casillas: [
      c('01', 'Nº total de personas y entidades', declarados.length, 'numero'),
      c('02', 'Importe total anual de las operaciones', round(declarados.reduce((a, d) => a + d.total, 0)), 'total', true),
    ],
    resultado: declarados.length,
  };
}

/* ───────────── 349: operaciones intracomunitarias ───────────── */

export async function modelo349(ctx: Ctx, anio: number, t?: number | null) {
  const { desde, hasta } = t ? rangoTrimestre(anio, t) : { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  const docs = (await facturasConImpuestos(ctx.empresaId, ['factura', 'factura_rectificativa', 'factura_proveedor'], desde, hasta)).filter((d) => d.regimen === 'intracomunitario');
  // servicios: todas las líneas son artículos de tipo servicio o sin artículo con unidad hora/servicio
  const ids = docs.map((d) => d.id);
  const lineas = ids.length
    ? await db
        .select({ documentoId: documentoLineas.documentoId, tipo: articulos.tipo, unidad: documentoLineas.unidad })
        .from(documentoLineas)
        .leftJoin(articulos, eq(articulos.id, documentoLineas.articuloId))
        .where(and(inArray(documentoLineas.documentoId, ids), eq(documentoLineas.tipoLinea, 'articulo')))
    : [];
  const esServicio = (id: string) => {
    const ls = lineas.filter((l) => l.documentoId === id);
    return ls.length > 0 && ls.every((l) => l.tipo === 'servicio' || (!l.tipo && ['h', 'servicio'].includes(l.unidad ?? '')));
  };
  const map = new Map<string, { nif: string | null; nombre: string; pais: string; clave: string; base: number }>();
  for (const d of docs) {
    const serv = esServicio(d.id);
    const clave = d.tipo === 'factura_proveedor' ? (serv ? 'I' : 'A') : serv ? 'S' : 'E';
    const k = `${d.terceroId}:${clave}`;
    const cur = map.get(k) ?? { nif: d.nif, nombre: d.nombre, pais: d.pais, clave, base: 0 };
    cur.base = round(cur.base + d.base);
    map.set(k, cur);
  }
  const operadores = [...map.values()].sort((a, b) => a.clave.localeCompare(b.clave) || b.base - a.base);
  return {
    periodo: { desde, hasta },
    operadores: operadores.map((o) => ({ ...o, claveTexto: { E: 'E · Entregas de bienes', S: 'S · Prestaciones de servicios', A: 'A · Adquisiciones de bienes', I: 'I · Adquisiciones de servicios' }[o.clave] })),
    casillas: [c('01', 'Nº total de operadores intracomunitarios', operadores.length, 'numero'), c('02', 'Importe de las operaciones intracomunitarias', round(operadores.reduce((a, o) => a + o.base, 0)), 'total', true)],
    resultado: operadores.length,
  };
}
