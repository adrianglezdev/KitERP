import { and, asc, eq, gte, inArray, like, lt, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import { round } from '@kite/shared';
import { db } from '../../db/client';
import { terceros } from '../../db/schema/core';
import { documentoImpuestos, documentos } from '../../db/schema/documentos';
import { cntApuntes, cntAsientos, cntCentrosCoste, cntCuentas } from './schema';
import { BALANCE_ACTIVO, BALANCE_PASIVO, PYG, asignador, type Partida } from './estados';

export interface FiltroFechas {
  desde: string;
  hasta: string;
  /** Excluir asientos de estos orígenes (p. ej. cierre en el balance, regularización y cierre en la PyG). */
  excluir?: string[];
}

function condFechas(empresaId: string, f: FiltroFechas): SQL {
  return and(eq(cntAsientos.empresaId, empresaId), gte(cntAsientos.fecha, f.desde), lte(cntAsientos.fecha, f.hasta), f.excluir?.length ? notInArray(cntAsientos.origen, f.excluir) : undefined)!;
}

/** Debe y haber por subcuenta en un periodo. */
export async function saldos(empresaId: string, f: FiltroFechas, prefijo?: string) {
  const rows = await db
    .select({ cuenta: cntApuntes.cuenta, nombre: cntCuentas.nombre, debe: sql<string>`sum(${cntApuntes.debe})`, haber: sql<string>`sum(${cntApuntes.haber})` })
    .from(cntApuntes)
    .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
    .innerJoin(cntCuentas, eq(cntCuentas.id, cntApuntes.cuentaId))
    .where(and(condFechas(empresaId, f), prefijo ? like(cntApuntes.cuenta, `${prefijo}%`) : undefined))
    .groupBy(cntApuntes.cuenta, cntCuentas.nombre)
    .orderBy(asc(cntApuntes.cuenta));
  return rows.map((r) => ({ cuenta: r.cuenta, nombre: r.nombre, debe: round(Number(r.debe)), haber: round(Number(r.haber)), saldo: round(Number(r.debe) - Number(r.haber)) }));
}

/* ───────────── Diario ───────────── */

export async function diario(empresaId: string, f: FiltroFechas & { origen?: string; q?: string }, limit = 100000) {
  const asientos = await db
    .select()
    .from(cntAsientos)
    .where(and(condFechas(empresaId, f), f.origen ? eq(cntAsientos.origen, f.origen) : undefined, f.q ? sql`${cntAsientos.concepto} ILIKE ${'%' + f.q.replace(/[%_]/g, '') + '%'}` : undefined))
    .orderBy(asc(cntAsientos.fecha), asc(cntAsientos.numero))
    .limit(limit);
  if (!asientos.length) return [];
  const lineas = await db
    .select({ a: cntApuntes, nombre: cntCuentas.nombre, centro: cntCentrosCoste.codigo })
    .from(cntApuntes)
    .innerJoin(cntCuentas, eq(cntCuentas.id, cntApuntes.cuentaId))
    .leftJoin(cntCentrosCoste, eq(cntCentrosCoste.id, cntApuntes.centroCosteId))
    .where(inArray(cntApuntes.asientoId, asientos.map((a) => a.id)))
    .orderBy(asc(cntApuntes.orden));
  const by = new Map<string, (typeof lineas)[number][]>();
  for (const l of lineas) by.set(l.a.asientoId, [...(by.get(l.a.asientoId) ?? []), l]);
  return asientos.map((a) => ({
    ...a,
    lineas: (by.get(a.id) ?? []).map((l) => ({ id: l.a.id, cuenta: l.a.cuenta, nombre: l.nombre, concepto: l.a.concepto, debe: l.a.debe, haber: l.a.haber, terceroId: l.a.terceroId, centroCosteId: l.a.centroCosteId, centro: l.centro })),
  }));
}

/* ───────────── Mayor ───────────── */

export async function mayor(empresaId: string, cuenta: string, f: FiltroFechas) {
  const ejIni = `${f.desde.slice(0, 4)}-01-01`;
  // saldo anterior dentro del ejercicio (incluye el asiento de apertura)
  const [ant] =
    f.desde > ejIni
      ? await db
          .select({ s: sql<string>`coalesce(sum(${cntApuntes.debe} - ${cntApuntes.haber}), 0)` })
          .from(cntApuntes)
          .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
          .where(and(eq(cntAsientos.empresaId, empresaId), gte(cntAsientos.fecha, ejIni), lt(cntAsientos.fecha, f.desde), like(cntApuntes.cuenta, `${cuenta}%`), f.excluir?.length ? notInArray(cntAsientos.origen, f.excluir) : undefined))
      : [{ s: '0' }];
  const rows = await db
    .select({ id: cntApuntes.id, asientoId: cntAsientos.id, numero: cntAsientos.numero, fecha: cntAsientos.fecha, origen: cntAsientos.origen, conceptoAsiento: cntAsientos.concepto, concepto: cntApuntes.concepto, cuenta: cntApuntes.cuenta, nombre: cntCuentas.nombre, debe: cntApuntes.debe, haber: cntApuntes.haber, documentoId: cntAsientos.documentoId })
    .from(cntApuntes)
    .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
    .innerJoin(cntCuentas, eq(cntCuentas.id, cntApuntes.cuentaId))
    .where(and(condFechas(empresaId, f), like(cntApuntes.cuenta, `${cuenta}%`)))
    .orderBy(asc(cntAsientos.fecha), asc(cntAsientos.numero), asc(cntApuntes.orden));
  let saldo = round(Number(ant?.s ?? 0));
  const saldoAnterior = saldo;
  const lineas = rows.map((r) => {
    saldo = round(saldo + r.debe - r.haber);
    return { ...r, concepto: r.concepto || r.conceptoAsiento, saldo };
  });
  const debe = round(rows.reduce((a, r) => a + r.debe, 0));
  const haber = round(rows.reduce((a, r) => a + r.haber, 0));
  return { cuenta, saldoAnterior, debe, haber, saldoFinal: saldo, lineas };
}

/* ───────────── Sumas y saldos ───────────── */

export async function sumasYSaldos(empresaId: string, f: FiltroFechas, nivel: number) {
  const base = await saldos(empresaId, f);
  if (nivel >= 7) return base.map((r) => ({ ...r, deudor: r.saldo > 0 ? r.saldo : 0, acreedor: r.saldo < 0 ? -r.saldo : 0 }));
  const nombres = new Map((await db.select({ c: cntCuentas.codigo, n: cntCuentas.nombre }).from(cntCuentas).where(eq(cntCuentas.empresaId, empresaId))).map((x) => [x.c, x.n]));
  const map = new Map<string, { cuenta: string; nombre: string; debe: number; haber: number }>();
  for (const r of base) {
    const k = r.cuenta.slice(0, nivel);
    const cur = map.get(k) ?? { cuenta: k, nombre: nombres.get(k) ?? nombres.get(k.slice(0, 3)) ?? r.nombre, debe: 0, haber: 0 };
    cur.debe = round(cur.debe + r.debe);
    cur.haber = round(cur.haber + r.haber);
    map.set(k, cur);
  }
  return [...map.values()]
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta))
    .map((r) => {
      const s = round(r.debe - r.haber);
      return { ...r, saldo: s, deudor: s > 0 ? s : 0, acreedor: s < 0 ? -s : 0 };
    });
}

/* ───────────── Balance y PyG ───────────── */

export interface LineaEstado {
  id: string;
  titulo: string;
  nivel: number;
  importe: number;
  cuentas?: { cuenta: string; nombre: string; importe: number }[];
}

function evaluar(arbol: Partida[], valores: Map<string, { importe: number; cuentas: { cuenta: string; nombre: string; importe: number }[] }>, nivel = 0): LineaEstado[] {
  const out: LineaEstado[] = [];
  for (const p of arbol) {
    if (p.hijos) {
      const hijos = evaluar(p.hijos, valores, nivel + 1);
      const total = round(hijos.filter((h) => h.nivel === nivel + 1).reduce((a, h) => a + h.importe, 0));
      out.push({ id: p.id, titulo: p.titulo, nivel, importe: total }, ...hijos);
    } else {
      const v = valores.get(p.id);
      out.push({ id: p.id, titulo: p.titulo, nivel, importe: round(v?.importe ?? 0), cuentas: v?.cuentas ?? [] });
    }
  }
  return out;
}

/** Balance de situación abreviado a una fecha (desde el 1 de enero del ejercicio, sin el asiento de cierre). */
export async function balance(empresaId: string, fecha: string) {
  const f = { desde: `${fecha.slice(0, 4)}-01-01`, hasta: fecha, excluir: ['cierre'] };
  const rows = await saldos(empresaId, f);
  const asignar = asignador([BALANCE_ACTIVO, BALANCE_PASIVO]);
  const idsActivo = new Set<string>();
  const collect = (ps: Partida[], set: Set<string>) => ps.forEach((p) => (set.add(p.id), p.hijos && collect(p.hijos, set)));
  collect(BALANCE_ACTIVO, idsActivo);
  const valores = new Map<string, { importe: number; cuentas: { cuenta: string; nombre: string; importe: number }[] }>();
  const sinClasificar: { cuenta: string; nombre: string; saldo: number }[] = [];
  for (const r of rows) {
    if (r.saldo === 0) continue;
    const id = asignar(r.cuenta);
    if (!id) {
      sinClasificar.push({ cuenta: r.cuenta, nombre: r.nombre, saldo: r.saldo });
      continue;
    }
    const imp = idsActivo.has(id) ? r.saldo : -r.saldo;
    const v = valores.get(id) ?? { importe: 0, cuentas: [] };
    v.importe = round(v.importe + imp);
    v.cuentas.push({ cuenta: r.cuenta, nombre: r.nombre, importe: imp });
    valores.set(id, v);
  }
  const activo = evaluar(BALANCE_ACTIVO, valores);
  const pasivo = evaluar(BALANCE_PASIVO, valores);
  const totalActivo = round(activo.filter((l) => l.nivel === 0).reduce((a, l) => a + l.importe, 0));
  const totalPasivo = round(pasivo.filter((l) => l.nivel === 0).reduce((a, l) => a + l.importe, 0));
  return { fecha, activo, pasivo, totalActivo, totalPasivo, cuadra: Math.abs(totalActivo - totalPasivo) < 0.01, sinClasificar };
}

export async function pyg(empresaId: string, desde: string, hasta: string) {
  const rows = await saldos(empresaId, { desde, hasta, excluir: ['regularizacion', 'cierre'] });
  const asignar = asignador([PYG.filter((p) => p.prefijos).map((p) => ({ id: p.id, titulo: p.titulo, prefijos: p.prefijos }))]);
  const valores = new Map<string, number>();
  const cuentas = new Map<string, { cuenta: string; nombre: string; importe: number }[]>();
  for (const r of rows) {
    if (!/^[67]/.test(r.cuenta) || r.saldo === 0) continue;
    const id = asignar(r.cuenta) ?? (r.cuenta[0] === '6' ? '7' : '5');
    const imp = -r.saldo;
    valores.set(id, round((valores.get(id) ?? 0) + imp));
    cuentas.set(id, [...(cuentas.get(id) ?? []), { cuenta: r.cuenta, nombre: r.nombre, importe: imp }]);
  }
  const lineas: LineaEstado[] = [];
  for (const p of PYG) {
    if (p.suma) {
      const v = round(p.suma.reduce((a, id) => a + (valores.get(id) ?? 0), 0));
      valores.set(p.id, v);
      lineas.push({ id: p.id, titulo: p.titulo, nivel: 0, importe: v });
    } else lineas.push({ id: p.id, titulo: p.titulo, nivel: 1, importe: valores.get(p.id) ?? 0, cuentas: cuentas.get(p.id) ?? [] });
  }
  return { desde, hasta, lineas, resultado: valores.get('D') ?? 0 };
}

/* ───────────── Libros registro de IVA ───────────── */

export async function librosIva(empresaId: string, tipo: 'expedidas' | 'recibidas', desde: string, hasta: string) {
  const tipos = tipo === 'expedidas' ? ['factura', 'factura_rectificativa', 'factura_simplificada'] : ['factura_proveedor'];
  const rows = await db
    .select({
      id: documentos.id,
      fecha: documentos.fecha,
      codigo: documentos.codigo,
      tipo: documentos.tipo,
      referenciaExterna: documentos.referenciaExterna,
      datosTercero: documentos.datosTercero,
      nombre: terceros.nombre,
      nif: terceros.nif,
      regimenIva: documentos.regimenIva,
      totalRetencion: documentos.totalRetencion,
      total: documentos.total,
      baseImponible: documentos.baseImponible,
      ivaTipo: documentoImpuestos.ivaTipo,
      base: documentoImpuestos.base,
      cuota: documentoImpuestos.cuota,
      recargoPct: documentoImpuestos.recargoPct,
      cuotaRecargo: documentoImpuestos.cuotaRecargo,
    })
    .from(documentos)
    .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
    .leftJoin(documentoImpuestos, eq(documentoImpuestos.documentoId, documentos.id))
    .where(and(eq(documentos.empresaId, empresaId), inArray(documentos.tipo, tipos), eq(documentos.bloqueado, true), gte(documentos.fecha, desde), lte(documentos.fecha, hasta)))
    .orderBy(asc(documentos.fecha), asc(documentos.codigo), sql`${documentoImpuestos.ivaTipo} DESC NULLS LAST`);
  const vistos = new Set<string>();
  const lineas = rows.map((r) => {
    const snap = (r.datosTercero ?? {}) as Record<string, any>;
    const primera = !vistos.has(r.id);
    vistos.add(r.id);
    return {
      documentoId: r.id,
      fecha: r.fecha,
      numero: r.codigo,
      numeroProveedor: r.referenciaExterna,
      tipo: r.tipo,
      nif: (snap.nif as string) ?? r.nif,
      nombre: (snap.razonSocial as string) ?? r.nombre,
      regimen: r.regimenIva,
      base: r.base ?? r.baseImponible,
      ivaTipo: r.ivaTipo ?? 0,
      cuota: r.cuota ?? 0,
      recargoPct: r.recargoPct ?? 0,
      cuotaRecargo: r.cuotaRecargo ?? 0,
      retencion: primera ? r.totalRetencion : 0,
      total: primera ? r.total : null,
    };
  });
  const totales = {
    base: round(lineas.reduce((a, l) => a + l.base, 0)),
    cuota: round(lineas.reduce((a, l) => a + l.cuota, 0)),
    recargo: round(lineas.reduce((a, l) => a + l.cuotaRecargo, 0)),
    retencion: round(lineas.reduce((a, l) => a + l.retencion, 0)),
    total: round(lineas.reduce((a, l) => a + (l.total ?? 0), 0)),
    facturas: vistos.size,
  };
  return { tipo, desde, hasta, lineas, totales };
}

/* ───────────── Analítica por centro de coste ───────────── */

export async function analitica(empresaId: string, desde: string, hasta: string) {
  const rows = await db
    .select({
      centroId: cntApuntes.centroCosteId,
      codigo: cntCentrosCoste.codigo,
      nombre: cntCentrosCoste.nombre,
      grupo: sql<string>`left(${cntApuntes.cuenta}, 1)`,
      cuenta: sql<string>`left(${cntApuntes.cuenta}, 3)`,
      neto: sql<string>`sum(${cntApuntes.haber} - ${cntApuntes.debe})`,
    })
    .from(cntApuntes)
    .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
    .leftJoin(cntCentrosCoste, eq(cntCentrosCoste.id, cntApuntes.centroCosteId))
    .where(and(condFechas(empresaId, { desde, hasta, excluir: ['regularizacion', 'cierre'] }), sql`left(${cntApuntes.cuenta}, 1) IN ('6','7')`))
    .groupBy(cntApuntes.centroCosteId, cntCentrosCoste.codigo, cntCentrosCoste.nombre, sql`left(${cntApuntes.cuenta}, 1)`, sql`left(${cntApuntes.cuenta}, 3)`);
  const nombres = new Map((await db.select({ c: cntCuentas.codigo, n: cntCuentas.nombre }).from(cntCuentas).where(and(eq(cntCuentas.empresaId, empresaId), sql`length(${cntCuentas.codigo}) = 3`))).map((x) => [x.c, x.n]));
  const map = new Map<string, { centroId: string | null; codigo: string; nombre: string; ingresos: number; gastos: number; resultado: number; detalle: { cuenta: string; nombre: string; importe: number }[] }>();
  for (const r of rows) {
    const k = r.centroId ?? '_';
    const cur = map.get(k) ?? { centroId: r.centroId, codigo: r.codigo ?? '—', nombre: r.nombre ?? 'Sin centro de coste', ingresos: 0, gastos: 0, resultado: 0, detalle: [] };
    const n = round(Number(r.neto));
    if (r.grupo === '7') cur.ingresos = round(cur.ingresos + n);
    else cur.gastos = round(cur.gastos - n);
    cur.resultado = round(cur.ingresos - cur.gastos);
    cur.detalle.push({ cuenta: r.cuenta, nombre: nombres.get(r.cuenta) ?? r.cuenta, importe: n });
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => (a.centroId ? 0 : 1) - (b.centroId ? 0 : 1) || a.codigo.localeCompare(b.codigo));
}
