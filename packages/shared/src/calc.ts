/**
 * Cálculo de documentos comerciales (presupuestos, pedidos, albaranes, facturas y compras).
 * Lo usan la web (vista previa en vivo) y la API (cálculo definitivo), así que el resultado es idéntico.
 * Redondeo a 2 decimales por línea y por grupo de impuesto, como exige el Reglamento de facturación.
 */

export const IVA_TIPOS = [
  { value: 21, label: 'General 21 %' },
  { value: 10, label: 'Reducido 10 %' },
  { value: 4, label: 'Superreducido 4 %' },
  { value: 0, label: 'Exento / no sujeto 0 %' },
] as const;

export const RECARGO_EQUIVALENCIA: Record<number, number> = { 21: 5.2, 10: 1.4, 5: 0.62, 4: 0.5, 2: 0.26, 0: 0 };

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

export interface LineaInput {
  cantidad: number;
  precio: number;
  descuento?: number | null; // %
  ivaTipo: number; // %
  retencion?: number | null; // % IRPF
  coste?: number | null; // coste unitario
  esTexto?: boolean; // línea de texto o capítulo sin importe
}

export interface ImpuestoResumen {
  ivaTipo: number;
  base: number;
  cuota: number;
  recargoPct: number;
  cuotaRecargo: number;
}

export interface DocumentoCalc {
  lineas: { subtotal: number; costeTotal: number }[];
  sumaLineas: number;
  descuentoGlobalImporte: number;
  baseImponible: number;
  impuestos: ImpuestoResumen[];
  totalIva: number;
  totalRecargo: number;
  totalRetencion: number;
  total: number;
  coste: number;
  margen: number;
  margenPct: number;
}

export function calcDocumento(
  lineas: LineaInput[],
  opts: { descuentoGlobal?: number | null; recargoEquivalencia?: boolean; exento?: boolean } = {},
): DocumentoCalc {
  const dg = (opts.descuentoGlobal ?? 0) / 100;
  const grupos = new Map<number, number>();
  const retenciones = new Map<number, number>();
  let suma = 0;
  let coste = 0;

  const outLineas = lineas.map((l) => {
    if (l.esTexto) return { subtotal: 0, costeTotal: 0 };
    const cantidad = Number(l.cantidad) || 0;
    const precio = Number(l.precio) || 0;
    const subtotal = round(cantidad * precio * (1 - (Number(l.descuento) || 0) / 100));
    const costeTotal = round(cantidad * (Number(l.coste) || 0));
    suma += subtotal;
    coste += costeTotal;
    const base = subtotal * (1 - dg);
    const iva = opts.exento ? 0 : Number(l.ivaTipo) || 0;
    grupos.set(iva, (grupos.get(iva) ?? 0) + base);
    const ret = Number(l.retencion) || 0;
    if (ret) retenciones.set(ret, (retenciones.get(ret) ?? 0) + base);
    return { subtotal, costeTotal };
  });

  const impuestos: ImpuestoResumen[] = [...grupos.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ivaTipo, baseRaw]) => {
      const base = round(baseRaw);
      const recargoPct = opts.recargoEquivalencia ? (RECARGO_EQUIVALENCIA[ivaTipo] ?? 0) : 0;
      return {
        ivaTipo,
        base,
        cuota: round((base * ivaTipo) / 100),
        recargoPct,
        cuotaRecargo: round((base * recargoPct) / 100),
      };
    });

  const sumaLineas = round(suma);
  const baseImponible = round(impuestos.reduce((a, i) => a + i.base, 0));
  const descuentoGlobalImporte = round(sumaLineas - baseImponible);
  const totalIva = round(impuestos.reduce((a, i) => a + i.cuota, 0));
  const totalRecargo = round(impuestos.reduce((a, i) => a + i.cuotaRecargo, 0));
  const totalRetencion = round([...retenciones.entries()].reduce((a, [pct, b]) => a + round((round(b) * pct) / 100), 0));
  const total = round(baseImponible + totalIva + totalRecargo - totalRetencion);
  const costeR = round(coste);
  const margen = round(baseImponible - costeR);
  return {
    lineas: outLineas,
    sumaLineas,
    descuentoGlobalImporte,
    baseImponible,
    impuestos,
    totalIva,
    totalRecargo,
    totalRetencion,
    total,
    coste: costeR,
    margen,
    margenPct: baseImponible ? round((margen / baseImponible) * 100, 1) : 0,
  };
}

/** Reparte un importe en vencimientos según los plazos de la forma de pago. */
export function calcVencimientos(
  total: number,
  fecha: string,
  plazos: { dias: number; porcentaje: number }[],
  diaPago?: number | null,
): { fecha: string; importe: number }[] {
  const ps = plazos.length ? plazos : [{ dias: 0, porcentaje: 100 }];
  let acumulado = 0;
  return ps.map((p, i) => {
    const importe = i === ps.length - 1 ? round(total - acumulado) : round((total * p.porcentaje) / 100);
    acumulado = round(acumulado + importe);
    const d = new Date(fecha + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + p.dias);
    if (diaPago && diaPago >= 1 && diaPago <= 31) {
      if (d.getUTCDate() > diaPago) d.setUTCMonth(d.getUTCMonth() + 1);
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(diaPago, last));
    }
    return { fecha: d.toISOString().slice(0, 10), importe };
  });
}
