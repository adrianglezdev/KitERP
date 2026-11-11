/**
 * Ejecución de informes sobre el catálogo cerrado de conjuntos de datos (packages/shared/src/modules/bi.ts).
 * Cada conjunto es una consulta fija; los filtros, columnas y agrupaciones se aplican sobre ella.
 * Se respetan el módulo activo, el permiso y su alcance (un comercial solo ve lo suyo).
 */
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { biShared, round, type biShared as BiNs } from '@kite/shared';
import { db } from '../../db/client';
import { articulos, familias, personas, terceros } from '../../db/schema/core';
import { documentoLineas, documentos } from '../../db/schema/documentos';
import type { Ctx } from '../../core/context';
import { forbidden } from '../../core/errors';
import { can, scopeCondition } from '../../core/permissions';
import { cntApuntes, cntAsientos, cntCentrosCoste, cntCuentas } from '../cnt/schema';
import { gasGastos } from '../gas/schema';
import { tesVencimientos } from '../tes/schema';

type Row = Record<string, string | number | null>;
const LIMITE = 50000;
const nombrePersona = sql<string | null>`nullif(trim(coalesce(${personas.nombre}, '') || ' ' || coalesce(${personas.apellidos}, '')), '')`;
const mes = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM')`;
const FACTURAS = ['factura', 'factura_rectificativa', 'factura_simplificada'];

async function scope(ctx: Ctx, perm: string, col: Parameters<typeof scopeCondition>[2]) {
  const s = ctx.perms.get(perm);
  if (!s) throw forbidden();
  return scopeCondition(ctx, s, col);
}

async function consultar(ctx: Ctx, key: string, desde: string, hasta: string): Promise<Row[]> {
  const e = ctx.empresaId;
  switch (key) {
    case 'facturas_venta':
      return db
        .select({ fecha: documentos.fecha, mes: mes(documentos.fecha), codigo: documentos.codigo, cliente: terceros.nombre, comercial: nombrePersona, estadoPago: documentos.estadoPago, base: documentos.baseImponible, iva: sql<number>`(${documentos.totalIva} + ${documentos.totalRecargo})::float`, total: documentos.total })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .leftJoin(personas, eq(personas.id, documentos.comercialId))
        .where(and(eq(documentos.empresaId, e), inArray(documentos.tipo, FACTURAS), eq(documentos.bloqueado, true), gte(documentos.fecha, desde), lte(documentos.fecha, hasta), await scope(ctx, 'fac.ver', documentos.comercialId)))
        .orderBy(asc(documentos.fecha))
        .limit(LIMITE);
    case 'ventas_articulos':
      return db
        .select({
          fecha: documentos.fecha,
          mes: mes(documentos.fecha),
          cliente: terceros.nombre,
          referencia: sql<string>`coalesce(${articulos.referencia}, ${documentoLineas.referencia}, '')`,
          articulo: sql<string>`coalesce(${articulos.nombre}, ${documentoLineas.descripcion})`,
          familia: sql<string>`coalesce(${familias.nombre}, 'Sin familia')`,
          comercial: nombrePersona,
          cantidad: documentoLineas.cantidad,
          importe: sql<number>`round(${documentoLineas.subtotal} * (1 - ${documentos.descuentoGlobal} / 100), 2)::float`,
        })
        .from(documentoLineas)
        .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .leftJoin(personas, eq(personas.id, documentos.comercialId))
        .leftJoin(articulos, eq(articulos.id, documentoLineas.articuloId))
        .leftJoin(familias, eq(familias.id, articulos.familiaId))
        .where(and(eq(documentos.empresaId, e), inArray(documentos.tipo, FACTURAS), eq(documentos.bloqueado, true), eq(documentoLineas.tipoLinea, 'articulo'), gte(documentos.fecha, desde), lte(documentos.fecha, hasta), await scope(ctx, 'fac.ver', documentos.comercialId)))
        .orderBy(asc(documentos.fecha))
        .limit(LIMITE);
    case 'presupuestos':
      return db
        .select({ fecha: documentos.fecha, mes: mes(documentos.fecha), codigo: documentos.codigo, cliente: terceros.nombre, comercial: nombrePersona, estado: documentos.estado, base: documentos.baseImponible, total: documentos.total })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .leftJoin(personas, eq(personas.id, documentos.comercialId))
        .where(and(eq(documentos.empresaId, e), eq(documentos.tipo, 'presupuesto'), gte(documentos.fecha, desde), lte(documentos.fecha, hasta), sql`${documentos.archivadoEn} IS NULL`, await scope(ctx, 'pre.ver', documentos.comercialId)))
        .orderBy(asc(documentos.fecha))
        .limit(LIMITE);
    case 'facturas_compra':
      return db
        .select({ fecha: documentos.fecha, mes: mes(documentos.fecha), codigo: documentos.codigo, numeroProveedor: documentos.referenciaExterna, proveedor: terceros.nombre, estadoPago: documentos.estadoPago, base: documentos.baseImponible, iva: documentos.totalIva, total: documentos.total })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .where(and(eq(documentos.empresaId, e), eq(documentos.tipo, 'factura_proveedor'), eq(documentos.bloqueado, true), gte(documentos.fecha, desde), lte(documentos.fecha, hasta), await scope(ctx, 'cpr.ver', documentos.comercialId)))
        .orderBy(asc(documentos.fecha))
        .limit(LIMITE);
    case 'vencimientos':
      if (!can(ctx, 'tes.ver')) throw forbidden();
      return db
        .select({ fecha: tesVencimientos.fecha, mes: mes(tesVencimientos.fecha), circuito: tesVencimientos.circuito, tercero: sql<string>`coalesce(${terceros.nombre}, ${tesVencimientos.concepto})`, documento: documentos.codigo, estado: tesVencimientos.estado, importe: tesVencimientos.importe, pendiente: sql<number>`(${tesVencimientos.importe} - ${tesVencimientos.importePagado})::float` })
        .from(tesVencimientos)
        .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
        .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
        .where(and(eq(tesVencimientos.empresaId, e), gte(tesVencimientos.fecha, desde), lte(tesVencimientos.fecha, hasta)))
        .orderBy(asc(tesVencimientos.fecha))
        .limit(LIMITE);
    case 'gastos': {
      const cond: SQL | undefined = can(ctx, 'gas.liquidar') ? undefined : await scope(ctx, 'gas.ver', gasGastos.personaId);
      return db
        .select({ fecha: gasGastos.fecha, mes: mes(gasGastos.fecha), persona: nombrePersona, tipo: gasGastos.tipo, categoria: sql<string>`coalesce(${gasGastos.categoria}, 'otros')`, comercio: gasGastos.comercio, estado: gasGastos.estado, iva: gasGastos.iva, total: gasGastos.total })
        .from(gasGastos)
        .innerJoin(personas, eq(personas.id, gasGastos.personaId))
        .where(and(eq(gasGastos.empresaId, e), gte(gasGastos.fecha, desde), lte(gasGastos.fecha, hasta), cond))
        .orderBy(asc(gasGastos.fecha))
        .limit(LIMITE);
    }
    case 'apuntes':
      if (!can(ctx, 'cnt.ver')) throw forbidden();
      return db
        .select({ fecha: cntAsientos.fecha, mes: mes(cntAsientos.fecha), asiento: cntAsientos.numero, cuenta: cntApuntes.cuenta, nombreCuenta: cntCuentas.nombre, grupo: sql<string>`left(${cntApuntes.cuenta}, 1)`, concepto: sql<string>`coalesce(${cntApuntes.concepto}, ${cntAsientos.concepto})`, centroCoste: cntCentrosCoste.codigo, debe: cntApuntes.debe, haber: cntApuntes.haber })
        .from(cntApuntes)
        .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
        .innerJoin(cntCuentas, eq(cntCuentas.id, cntApuntes.cuentaId))
        .leftJoin(cntCentrosCoste, eq(cntCentrosCoste.id, cntApuntes.centroCosteId))
        .where(and(eq(cntAsientos.empresaId, e), gte(cntAsientos.fecha, desde), lte(cntAsientos.fecha, hasta)))
        .orderBy(asc(cntAsientos.fecha), asc(cntAsientos.numero))
        .limit(LIMITE);
    default:
      throw forbidden('Conjunto de datos no disponible');
  }
}

export interface DefinicionInforme {
  dataset: string;
  filtros: BiNs.BiFiltros;
  columnas: string[];
  agruparPor?: string | null;
  orden?: string | null;
}

/** ¿Puede el usuario usar este conjunto de datos? (módulo activo y permiso) */
export function datasetPermitido(ctx: Ctx, key: string) {
  const d = biShared.biDataset(key);
  return !!d && ctx.modules.has(d.module) && can(ctx, d.perm);
}

export async function ejecutarInforme(ctx: Ctx, def: DefinicionInforme, hoy = new Date().toISOString().slice(0, 10)) {
  const ds = biShared.biDataset(def.dataset);
  if (!ds || !datasetPermitido(ctx, def.dataset)) throw forbidden('No tienes acceso a este conjunto de datos');
  const { desde, hasta } = biShared.rangoPeriodo(def.filtros, hoy);
  let filas = await consultar(ctx, ds.key, desde, hasta);
  // filtros por columna (igualdad en enumerados, contiene en textos)
  for (const [k, v] of Object.entries(def.filtros.campos ?? {})) {
    const col = ds.columns.find((c) => c.key === k && c.filter);
    if (!col || v === '' || v === null || v === undefined) continue;
    const needle = String(v).toLowerCase();
    filas = filas.filter((f) => (col.type === 'enum' ? String(f[k] ?? '') === v : String(f[k] ?? '').toLowerCase().includes(needle)));
  }
  const elegidas = (def.columnas.length ? def.columnas : ds.columns.map((c) => c.key)).filter((k) => ds.columns.some((c) => c.key === k));
  const numericas = ds.columns.filter((c) => c.type === 'money' || c.type === 'number');
  let columnas = ds.columns.filter((c) => elegidas.includes(c.key));
  const agrupar = def.agruparPor ? ds.columns.find((c) => c.key === def.agruparPor && c.group) : null;
  let out: Row[];
  if (agrupar) {
    const map = new Map<string, Row>();
    for (const f of filas) {
      const k = String(f[agrupar.key] ?? '—');
      const cur = map.get(k) ?? { [agrupar.key]: k, registros: 0, ...Object.fromEntries(numericas.filter((c) => elegidas.includes(c.key)).map((c) => [c.key, 0])) };
      cur.registros = (cur.registros as number) + 1;
      for (const c of numericas) if (elegidas.includes(c.key)) cur[c.key] = round((cur[c.key] as number) + Number(f[c.key] ?? 0), c.type === 'money' ? 2 : 4);
      map.set(k, cur);
    }
    out = [...map.values()];
    columnas = [agrupar, { key: 'registros', label: 'Registros', type: 'number' }, ...numericas.filter((c) => elegidas.includes(c.key))];
  } else out = filas.map((f) => Object.fromEntries(columnas.map((c) => [c.key, f[c.key] ?? null])));
  // etiquetas de enumerados
  for (const c of columnas) if (c.type === 'enum' && c.options) for (const f of out) f[c.key] = c.options.find((o) => o.value === f[c.key])?.label ?? f[c.key];
  // orden
  const ordenCol = def.orden?.replace(/^-/, '');
  if (ordenCol && columnas.some((c) => c.key === ordenCol)) {
    const desc = def.orden!.startsWith('-');
    out.sort((a, b) => {
      const x = a[ordenCol];
      const y = b[ordenCol];
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'es');
      return desc ? -r : r;
    });
  } else if (agrupar) {
    const m = numericas.find((c) => c.type === 'money' && elegidas.includes(c.key));
    if (agrupar.key === 'mes') out.sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
    else if (m) out.sort((a, b) => Number(b[m.key]) - Number(a[m.key]));
  }
  const totales: Row = {};
  for (const c of columnas) if (c.type === 'money' || c.type === 'number') totales[c.key] = round(out.reduce((a, f) => a + Number(f[c.key] ?? 0), 0), c.type === 'money' ? 2 : 4);
  return { dataset: ds, columnas, filas: out, totales, desde, hasta, truncado: filas.length >= LIMITE };
}
