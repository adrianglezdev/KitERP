/**
 * Asientos automáticos a partir de los eventos de otros módulos.
 * Todos son idempotentes (origen + refClave) y crean al vuelo el plan de cuentas,
 * el ejercicio y las subcuentas de clientes y proveedores que necesitan.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { gasShared, round, type EventMap } from '@kite/shared';
import type { Tx } from '../../db/client';
import { articulos, familias, personas, terceros } from '../../db/schema/core';
import { documentoImpuestos, documentoLineas, documentos } from '../../db/schema/documentos';
import type { Ctx } from '../../core/context';
import { gasGastos, gasTarjetas } from '../gas/schema';
import { tesCuentas, tesVencimientos } from '../tes/schema';
import { cntApuntes, cntAsientos, cntTercerosFiscal } from './schema';
import { crearAsiento, ensureCuenta, subcodigo, subcuentaTercero, type LineaAsiento } from './service';

const pctCode = (n: number) => String(Math.round(n)).padStart(4, '0');
export const cuentaIva = (lado: 'repercutido' | 'soportado', tipo: number) => `${lado === 'repercutido' ? '477' : '472'}${pctCode(tipo)}`;
export const cuentaRecargo = (pct: number) => `4771${String(Math.round(pct * 10)).padStart(3, '0')}`;
const nombreIva = (lado: 'repercutido' | 'soportado', tipo: number) => `H.P. IVA ${lado} ${String(tipo).replace('.', ',')} %`;

/** Ajusta los céntimos de redondeo en la línea de mayor importe para que el asiento cuadre. */
function cuadrar(lineas: LineaAsiento[]) {
  const debe = round(lineas.reduce((a, l) => a + (l.debe ?? 0), 0));
  const haber = round(lineas.reduce((a, l) => a + (l.haber ?? 0), 0));
  const dif = round(debe - haber);
  if (dif === 0) return lineas;
  if (Math.abs(dif) > 0.05) throw new Error(`Descuadre de ${dif} € al generar el asiento automático`);
  const conHaber = lineas.filter((l) => l.haber).sort((a, b) => Math.abs(b.haber!) - Math.abs(a.haber!));
  const conDebe = lineas.filter((l) => l.debe).sort((a, b) => Math.abs(b.debe!) - Math.abs(a.debe!));
  if (conHaber[0]) conHaber[0].haber = round(conHaber[0].haber! + dif);
  else if (conDebe[0]) conDebe[0].debe = round(conDebe[0].debe! - dif);
  return lineas;
}

/** Bases imponibles agrupadas por cuenta de ventas o compras. */
async function basesPorCuenta(tx: Tx, d: typeof documentos.$inferSelect, circuito: 'venta' | 'compra', cuentaDefecto: (l: { tipoArticulo: string | null; unidad: string | null }) => string) {
  const ls = await tx
    .select({ subtotal: documentoLineas.subtotal, tipoLinea: documentoLineas.tipoLinea, unidad: documentoLineas.unidad, tipoArticulo: articulos.tipo, cv: familias.cuentaVentas, cc: familias.cuentaCompras })
    .from(documentoLineas)
    .leftJoin(articulos, eq(articulos.id, documentoLineas.articuloId))
    .leftJoin(familias, eq(familias.id, articulos.familiaId))
    .where(eq(documentoLineas.documentoId, d.id));
  const dg = 1 - (d.descuentoGlobal ?? 0) / 100;
  const map = new Map<string, number>();
  for (const l of ls) {
    if (l.tipoLinea !== 'articulo' || !l.subtotal) continue;
    const fam = circuito === 'venta' ? l.cv : l.cc;
    const cuenta = subcodigo(fam || cuentaDefecto({ tipoArticulo: l.tipoArticulo, unidad: l.unidad }));
    map.set(cuenta, (map.get(cuenta) ?? 0) + l.subtotal * dg);
  }
  const out = [...map.entries()].map(([cuenta, b]) => ({ cuenta, base: round(b) }));
  // los céntimos que se pierdan al repartir el descuento global van a la base mayor
  const dif = round(d.baseImponible - out.reduce((a, x) => a + x.base, 0));
  if (out.length && dif !== 0) out.sort((a, b) => Math.abs(b.base) - Math.abs(a.base))[0]!.base = round(out[0]!.base + dif);
  if (!out.length && d.baseImponible) out.push({ cuenta: subcodigo(cuentaDefecto({ tipoArticulo: null, unidad: null })), base: d.baseImponible });
  return out;
}

async function fiscalTercero(tx: Tx, empresaId: string, terceroId: string) {
  const [f] = await tx.select().from(cntTercerosFiscal).where(and(eq(cntTercerosFiscal.empresaId, empresaId), eq(cntTercerosFiscal.terceroId, terceroId)));
  return f ?? null;
}

/* ───────────── Facturas emitidas ───────────── */

export async function asientoFacturaVenta(tx: Tx, ctx: Ctx, p: EventMap['ventas.factura_emitida']) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, p.documentoId));
  if (!d) return;
  const [t] = await tx.select({ nombre: terceros.nombre }).from(terceros).where(eq(terceros.id, d.terceroId));
  const cliente = await subcuentaTercero(tx, ctx.empresaId, d.terceroId, 'cliente');
  const bases = await basesPorCuenta(tx, d, 'venta', (l) => (l.tipoArticulo === 'servicio' || (!l.tipoArticulo && ['h', 'servicio'].includes(l.unidad ?? '')) ? '705' : '700'));
  const imps = await tx.select().from(documentoImpuestos).where(eq(documentoImpuestos.documentoId, d.id));
  const concepto = `${d.tipo === 'factura_rectificativa' ? 'Rectificativa' : 'Factura'} ${d.codigo ?? ''} · ${t?.nombre ?? ''}`.trim();
  const lineas: LineaAsiento[] = [{ cuentaId: cliente.id, debe: d.total, terceroId: d.terceroId, concepto }];
  if (d.totalRetencion) lineas.push({ cuenta: '4730000', debe: d.totalRetencion, concepto: 'Retención IRPF practicada por el cliente' });
  for (const b of bases) lineas.push({ cuenta: b.cuenta, haber: b.base, concepto });
  for (const i of imps) {
    if (i.cuota) {
      const c = await ensureCuenta(tx, ctx.empresaId, cuentaIva('repercutido', i.ivaTipo), nombreIva('repercutido', i.ivaTipo));
      lineas.push({ cuentaId: c.id, haber: i.cuota, concepto: `IVA ${i.ivaTipo} % s/ ${i.base.toFixed(2)}` });
    }
    if (i.cuotaRecargo) {
      const c = await ensureCuenta(tx, ctx.empresaId, cuentaRecargo(i.recargoPct), `H.P. recargo de equivalencia ${String(i.recargoPct).replace('.', ',')} %`);
      lineas.push({ cuentaId: c.id, haber: i.cuotaRecargo, concepto: `Recargo ${i.recargoPct} %` });
    }
  }
  await crearAsiento(tx, ctx, { fecha: d.fecha, concepto, origen: 'fac', refClave: d.id, refTipo: 'documento', refId: d.id, documentoId: d.id, lineas: cuadrar(lineas) });
}

/* ───────────── Facturas de proveedor ───────────── */

export async function asientoFacturaCompra(tx: Tx, ctx: Ctx, p: EventMap['compras.factura_registrada']) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, p.documentoId));
  if (!d) return;
  const [t] = await tx.select({ nombre: terceros.nombre }).from(terceros).where(eq(terceros.id, d.terceroId));
  const fiscal = await fiscalTercero(tx, ctx.empresaId, d.terceroId);
  const tipoRet = fiscal?.tipoRetencion ?? 'ninguna';
  const acreedor = tipoRet !== 'ninguna';
  const proveedor = await subcuentaTercero(tx, ctx.empresaId, d.terceroId, acreedor ? 'acreedor' : 'proveedor');
  const defecto = (l: { tipoArticulo: string | null }) =>
    fiscal?.cuentaGasto || (tipoRet === 'alquiler' ? '621' : tipoRet === 'profesional' ? '623' : l.tipoArticulo === 'servicio' ? '607' : l.tipoArticulo ? '600' : '602');
  const bases = await basesPorCuenta(tx, d, 'compra', defecto);
  const imps = await tx.select().from(documentoImpuestos).where(eq(documentoImpuestos.documentoId, d.id));
  const concepto = `Fra. proveedor ${d.referenciaExterna ?? d.codigo ?? ''} · ${t?.nombre ?? ''}`.trim();
  const lineas: LineaAsiento[] = [];
  for (const b of bases) lineas.push({ cuenta: b.cuenta, debe: b.base, concepto });
  for (const i of imps) {
    const cuota = round(i.cuota + i.cuotaRecargo);
    if (!cuota) continue;
    const c = await ensureCuenta(tx, ctx.empresaId, cuentaIva('soportado', i.ivaTipo), nombreIva('soportado', i.ivaTipo));
    lineas.push({ cuentaId: c.id, debe: cuota, concepto: `IVA ${i.ivaTipo} % s/ ${i.base.toFixed(2)}` });
  }
  lineas.push({ cuentaId: proveedor.id, haber: d.total, terceroId: d.terceroId, concepto });
  if (d.totalRetencion) lineas.push({ cuenta: '4751000', haber: d.totalRetencion, concepto: tipoRet === 'alquiler' ? 'Retención alquiler (115)' : 'Retención IRPF (111)' });
  await crearAsiento(tx, ctx, { fecha: d.fecha, concepto, origen: 'cpr', refClave: d.id, refTipo: 'documento', refId: d.id, documentoId: d.id, lineas: cuadrar(lineas) });
}

/* ───────────── Cobros y pagos ───────────── */

/** Cuenta del tercero usada en el asiento de la factura (430/400/410), para que el cobro o pago la salde. */
async function cuentaTerceroDeFactura(tx: Tx, empresaId: string, documentoId: string, prefijos: string[]) {
  const rows = await tx
    .select({ cuentaId: cntApuntes.cuentaId, cuenta: cntApuntes.cuenta })
    .from(cntApuntes)
    .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
    .where(and(eq(cntAsientos.empresaId, empresaId), eq(cntAsientos.documentoId, documentoId)));
  return rows.find((r) => prefijos.some((p) => r.cuenta.startsWith(p)))?.cuentaId ?? null;
}

export async function asientoCobroPago(tx: Tx, ctx: Ctx, circuito: 'cobro' | 'pago', p: EventMap['tes.cobro_registrado'] & { pagoId?: string }) {
  const [v] = await tx.select().from(tesVencimientos).where(eq(tesVencimientos.id, p.vencimientoId));
  const terceroId = p.terceroId ?? v?.terceroId ?? null;
  let contrapartidaId: string | null = null;
  if (v?.cuentaContrapartida) contrapartidaId = (await ensureCuenta(tx, ctx.empresaId, v.cuentaContrapartida)).id;
  if (!contrapartidaId && p.documentoId) contrapartidaId = await cuentaTerceroDeFactura(tx, ctx.empresaId, p.documentoId, circuito === 'cobro' ? ['430'] : ['400', '410']);
  if (!contrapartidaId) contrapartidaId = (await subcuentaTercero(tx, ctx.empresaId, terceroId, circuito === 'cobro' ? 'cliente' : 'proveedor')).id;
  const banco = await ensureCuenta(tx, ctx.empresaId, p.cuentaContable);
  const [t] = terceroId ? await tx.select({ nombre: terceros.nombre }).from(terceros).where(eq(terceros.id, terceroId)) : [];
  const [d] = p.documentoId ? await tx.select({ codigo: documentos.codigo, ref: documentos.referenciaExterna }).from(documentos).where(eq(documentos.id, p.documentoId)) : [];
  const devolucion = p.importe < 0 && (v?.importe ?? 0) > 0;
  const concepto = `${devolucion ? 'Devolución de cobro' : circuito === 'cobro' ? 'Cobro' : 'Pago'} ${d?.codigo ?? v?.concepto ?? ''}${t?.nombre ? ' · ' + t.nombre : ''}`.trim();
  const lineas: LineaAsiento[] =
    circuito === 'cobro'
      ? [
          { cuentaId: banco.id, debe: p.importe, concepto },
          { cuentaId: contrapartidaId, haber: p.importe, terceroId, concepto },
        ]
      : [
          { cuentaId: contrapartidaId, debe: p.importe, terceroId, concepto },
          { cuentaId: banco.id, haber: p.importe, concepto },
        ];
  const clave = p.pagoId ?? `${p.vencimientoId}:${p.fecha}:${p.importe.toFixed(2)}`;
  await crearAsiento(tx, ctx, { fecha: p.fecha, concepto, origen: 'tes', refClave: clave, refTipo: 'tes_pago', refId: p.pagoId ?? null, documentoId: p.documentoId ?? null, lineas });
}

/* ───────────── Nóminas ───────────── */

export async function asientoNomina(tx: Tx, ctx: Ctx, p: EventMap['nom.periodo_cerrado']) {
  const t = p.totales;
  const fin = new Date(Date.UTC(p.anio, p.mes, 0)).toISOString().slice(0, 10);
  const neto465 = round(t.bruto - t.ssTrabajador - t.irpf);
  const otras = round(neto465 - t.neto); // anticipos y otras deducciones
  const concepto = `Nóminas ${String(p.mes).padStart(2, '0')}/${p.anio}`;
  const lineas: LineaAsiento[] = [
    { cuenta: '6400000', debe: t.bruto, concepto },
    { cuenta: '6420000', debe: t.ssEmpresa, concepto: 'Seguridad Social a cargo de la empresa' },
    { cuenta: '4760000', haber: round(t.ssEmpresa + t.ssTrabajador), concepto: 'Seguridad Social total' },
    { cuenta: '4751000', haber: t.irpf, concepto: 'Retenciones IRPF trabajo' },
    { cuenta: '4650000', haber: t.neto, concepto: 'Líquido a percibir' },
  ];
  if (otras) lineas.push({ cuenta: '4600000', haber: otras, concepto: 'Anticipos y otras deducciones' });
  await crearAsiento(tx, ctx, { fecha: fin, concepto, origen: 'nom', refClave: p.periodoId, refTipo: 'nom_periodo', refId: p.periodoId, lineas });
}

/* ───────────── Gastos de empleados ───────────── */

export async function asientoGasto(tx: Tx, ctx: Ctx, p: EventMap['gas.gasto_liquidado']) {
  const [g] = await tx.select().from(gasGastos).where(eq(gasGastos.id, p.gastoId));
  const [per] = await tx.select({ n: sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))` }).from(personas).where(eq(personas.id, p.personaId));
  const gastoCta = gasShared.cuentaGasto(g?.tipo ?? 'ticket', g?.categoria);
  let credito: string;
  let nombreCredito: string | null = null;
  if (g?.tipo === 'tarjeta' && g.tarjetaId) {
    const [tj] = await tx.select().from(gasTarjetas).where(eq(gasTarjetas.id, g.tarjetaId));
    credito = tj?.cuentaContable ?? '5720001';
  } else if (p.via === 'nomina') {
    credito = '4650000';
  } else {
    // transferencia: sale del banco por defecto de tesorería si existe
    const [c] = await tx
      .select({ c: tesCuentas.cuentaContable, n: tesCuentas.nombre })
      .from(tesCuentas)
      .where(and(eq(tesCuentas.empresaId, ctx.empresaId), eq(tesCuentas.tipo, 'banco')))
      .orderBy(desc(tesCuentas.porDefecto), asc(tesCuentas.creadoEn))
      .limit(1);
    credito = c?.c ?? '5720001';
    nombreCredito = c?.n ?? null;
  }
  const iva = round(p.iva || 0);
  const concepto = [`Gasto ${g?.comercio || g?.concepto || ''}`.trim(), per?.n].filter(Boolean).join(' · ');
  const lineas: LineaAsiento[] = [{ cuenta: gastoCta, debe: round(p.importe - iva), concepto }];
  if (iva) lineas.push({ cuenta: '4720000', debe: iva, concepto: 'IVA soportado en ticket' });
  lineas.push({ cuenta: credito, nombreCuenta: nombreCredito, haber: p.importe, concepto: p.via === 'nomina' ? 'Se paga en la nómina' : 'Pagado por transferencia' });
  await crearAsiento(tx, ctx, { fecha: p.fecha, concepto, origen: 'gas', refClave: p.gastoId, refTipo: 'gas_gasto', refId: p.gastoId, lineas });
}

/* ───────────── Amortizaciones ───────────── */

export async function asientoAmortizacion(tx: Tx, ctx: Ctx, p: EventMap['act.amortizacion']) {
  await crearAsiento(tx, ctx, {
    fecha: p.fecha,
    concepto: p.concepto || 'Amortización del inmovilizado',
    origen: 'act',
    refClave: `${p.activoId}:${p.fecha}`,
    refTipo: 'act_activo',
    refId: p.activoId,
    lineas: [
      { cuenta: p.cuentaGasto || '681', debe: p.importe, concepto: p.concepto },
      { cuenta: p.cuentaAmortizacion || '281', haber: p.importe, concepto: p.concepto },
    ],
  });
}

