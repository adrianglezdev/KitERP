import { and, eq, inArray, sql } from 'drizzle-orm';
import { round, type cprShared } from '@kite/shared';
import type { DbOrTx, Tx } from '../../db/client';
import { articulos, terceros } from '../../db/schema/core';
import type { Ctx } from '../../core/context';
import { badRequest } from '../../core/errors';
import { crearDocumento, type LineaInput } from '../../services/documentos';
import { cprArticuloProveedor } from './schema';

const hoy = () => new Date().toISOString().slice(0, 10);

/** Proveedor preferente de cada artículo: el marcado como preferente, si no el más barato, si no el proveedor habitual del artículo. */
export async function condicionesCompra(tx: DbOrTx, empresaId: string, articuloIds: string[]) {
  const out = new Map<string, { proveedorId: string | null; precio: number; plazoDias: number | null; cantidadMinima: number | null; referenciaProveedor: string | null; descuento: number }>();
  if (!articuloIds.length) return out;
  const arts = await tx.select({ id: articulos.id, proveedorId: articulos.proveedorId, coste: articulos.coste }).from(articulos).where(and(eq(articulos.empresaId, empresaId), inArray(articulos.id, articuloIds)));
  const ofertas = await tx
    .select()
    .from(cprArticuloProveedor)
    .where(and(eq(cprArticuloProveedor.empresaId, empresaId), inArray(cprArticuloProveedor.articuloId, articuloIds)))
    .orderBy(sql`${cprArticuloProveedor.preferente} DESC`, cprArticuloProveedor.precio);
  for (const a of arts) {
    const o = ofertas.find((x) => x.articuloId === a.id);
    if (o) out.set(a.id, { proveedorId: o.proveedorId, precio: o.precio, plazoDias: o.plazoDias, cantidadMinima: o.cantidadMinima, referenciaProveedor: o.referenciaProveedor, descuento: o.descuento ?? 0 });
    else out.set(a.id, { proveedorId: a.proveedorId, precio: a.coste, plazoDias: null, cantidadMinima: null, referenciaProveedor: null, descuento: 0 });
  }
  return out;
}

/** Cantidad pendiente de recibir por artículo en pedidos a proveedor vivos. */
export async function pendienteRecibir(tx: DbOrTx, empresaId: string, estados = ['aprobado', 'enviado', 'parcial']) {
  const rows = await tx.execute<{ articulo_id: string; pendiente: number }>(sql`
    SELECT l.articulo_id, sum(greatest(l.cantidad - coalesce(r.recibido, 0), 0))::float AS pendiente
      FROM documento_lineas l
      JOIN documentos d ON d.id = l.documento_id
      LEFT JOIN (
        SELECT rl.linea_origen_id, sum(rl.cantidad) AS recibido
          FROM documento_lineas rl JOIN documentos rd ON rd.id = rl.documento_id
         WHERE rd.tipo = 'recepcion' AND rd.estado = 'confirmada' AND rd.empresa_id = ${empresaId}
         GROUP BY rl.linea_origen_id
      ) r ON r.linea_origen_id = l.id
     WHERE d.empresa_id = ${empresaId} AND d.tipo = 'pedido_compra' AND d.archivado_en IS NULL
       AND d.estado IN (${sql.join(estados.map((e) => sql`${e}`), sql`, `)})
       AND l.articulo_id IS NOT NULL AND l.tipo_linea = 'articulo'
     GROUP BY l.articulo_id`);
  return new Map(rows.map((r) => [r.articulo_id, r.pendiente]));
}

export interface LineaPropuesta {
  articuloId: string;
  referencia: string;
  nombre: string;
  unidad: string;
  fisico: number;
  reservado: number;
  disponible: number;
  pendiente: number;
  enBorrador: number;
  stockMin: number | null;
  puntoPedido: number;
  cantidadPedido: number | null;
  sugerido: number;
  proveedorId: string | null;
  proveedor: string | null;
  precio: number;
  plazoDias: number | null;
}

/** Artículos cuyo disponible + pendiente de recibir no llega al punto de pedido, con la cantidad sugerida y su proveedor. */
export async function propuestaCompra(tx: DbOrTx, empresaId: string): Promise<LineaPropuesta[]> {
  const rows = await tx.execute<any>(sql`
    SELECT c.articulo_id, a.referencia, a.nombre, a.unidad, c.stock_min::float AS stock_min, c.punto_pedido::float AS punto_pedido, c.cantidad_pedido::float AS cantidad_pedido,
           coalesce(sum(s.cantidad), 0)::float AS fisico, coalesce(sum(s.reservado), 0)::float AS reservado
      FROM stk_articulo_config c
      JOIN articulos a ON a.id = c.articulo_id
      LEFT JOIN stk_saldos s ON s.articulo_id = c.articulo_id
     WHERE c.empresa_id = ${empresaId} AND c.punto_pedido IS NOT NULL AND c.punto_pedido > 0 AND a.activo AND a.archivado_en IS NULL
     GROUP BY c.articulo_id, a.referencia, a.nombre, a.unidad, c.stock_min, c.punto_pedido, c.cantidad_pedido`);
  const pend = await pendienteRecibir(tx, empresaId);
  const borr = await pendienteRecibir(tx, empresaId, ['borrador', 'pendiente_aprobacion']);
  const candidatos = rows.filter((r: any) => r.fisico - r.reservado + (pend.get(r.articulo_id) ?? 0) < r.punto_pedido);
  const cond = await condicionesCompra(tx, empresaId, candidatos.map((c: any) => c.articulo_id));
  const provIds = [...new Set([...cond.values()].map((c) => c.proveedorId).filter(Boolean) as string[])];
  const provs = provIds.length ? await tx.select({ id: terceros.id, nombre: terceros.nombre }).from(terceros).where(inArray(terceros.id, provIds)) : [];
  return candidatos
    .map((r: any) => {
      const disponible = r.fisico - r.reservado;
      const pendiente = pend.get(r.articulo_id) ?? 0;
      const c = cond.get(r.articulo_id);
      const falta = r.punto_pedido - (disponible + pendiente);
      let sugerido = Math.max(r.cantidad_pedido ?? 0, falta, c?.cantidadMinima ?? 0);
      if (['ud', 'caja', 'servicio'].includes(r.unidad)) sugerido = Math.ceil(sugerido - 0.00001);
      else sugerido = round(sugerido, 3);
      return {
        articuloId: r.articulo_id,
        referencia: r.referencia,
        nombre: r.nombre,
        unidad: r.unidad,
        fisico: round(r.fisico, 4),
        reservado: round(r.reservado, 4),
        disponible: round(disponible, 4),
        pendiente: round(pendiente, 4),
        enBorrador: round(borr.get(r.articulo_id) ?? 0, 4),
        stockMin: r.stock_min,
        puntoPedido: r.punto_pedido,
        cantidadPedido: r.cantidad_pedido,
        sugerido,
        proveedorId: c?.proveedorId ?? null,
        proveedor: provs.find((p) => p.id === c?.proveedorId)?.nombre ?? null,
        precio: c?.precio ?? 0,
        plazoDias: c?.plazoDias ?? null,
      };
    })
    .sort((a: LineaPropuesta, b: LineaPropuesta) => (a.proveedor ?? 'zzz').localeCompare(b.proveedor ?? 'zzz') || a.referencia.localeCompare(b.referencia));
}

export interface LineaCompra {
  proveedorId: string;
  articuloId?: string | null;
  descripcion?: string | null;
  cantidad: number;
  precio?: number | null;
  ivaTipo?: number | null;
  proyectoId?: string | null;
  nota?: string | null;
}

/** Crea un pedido a proveedor (borrador) por cada proveedor con sus líneas. */
export async function crearPedidosAgrupados(tx: Tx, ctx: Ctx, lineas: LineaCompra[], opts: { observaciones?: string | null; origenTipo?: string | null } = {}) {
  if (!lineas.length) throw badRequest('No hay nada que pedir');
  const artIds = [...new Set(lineas.map((l) => l.articuloId).filter(Boolean) as string[])];
  const arts = artIds.length ? await tx.select().from(articulos).where(and(eq(articulos.empresaId, ctx.empresaId), inArray(articulos.id, artIds))) : [];
  const ofertas = artIds.length ? await tx.select().from(cprArticuloProveedor).where(and(eq(cprArticuloProveedor.empresaId, ctx.empresaId), inArray(cprArticuloProveedor.articuloId, artIds))) : [];
  const grupos = new Map<string, LineaCompra[]>();
  for (const l of lineas) grupos.set(l.proveedorId, [...(grupos.get(l.proveedorId) ?? []), l]);
  const creados: { id: string; codigo: string | null; proveedorId: string; total: number }[] = [];
  for (const [proveedorId, ls] of grupos) {
    const proyectos = [...new Set(ls.map((l) => l.proyectoId ?? null))];
    const docLineas: LineaInput[] = ls.map((l) => {
      const a = arts.find((x) => x.id === l.articuloId);
      const o = ofertas.find((x) => x.articuloId === l.articuloId && x.proveedorId === proveedorId);
      const precio = l.precio ?? o?.precio ?? a?.coste ?? 0;
      return {
        tipoLinea: 'articulo',
        articuloId: a?.id ?? null,
        referencia: o?.referenciaProveedor ?? a?.referencia ?? null,
        descripcion: [a?.nombre ?? l.descripcion ?? 'Compra', l.nota].filter(Boolean).join(' · '),
        cantidad: l.cantidad,
        unidad: a?.unidad ?? null,
        precio: round(precio, 4),
        descuento: l.precio != null ? 0 : (o?.descuento ?? 0),
        ivaTipo: l.ivaTipo ?? a?.ivaTipo ?? 21,
        retencion: 0,
        coste: 0,
      };
    });
    const plazo = Math.max(0, ...ofertas.filter((o) => o.proveedorId === proveedorId && ls.some((l) => l.articuloId === o.articuloId)).map((o) => o.plazoDias ?? 0));
    const entrega = plazo > 0 ? new Date(Date.now() + plazo * 86400_000).toISOString().slice(0, 10) : null;
    const d = await crearDocumento(tx, ctx, {
      tipo: 'pedido_compra',
      fecha: hoy(),
      terceroId: proveedorId,
      comercialId: ctx.personaId,
      fechaEntrega: entrega,
      proyectoId: proyectos.length === 1 ? proyectos[0] : null,
      descuentoGlobal: 0,
      observaciones: opts.observaciones ?? null,
      origenTipo: opts.origenTipo ?? null,
      lineas: docLineas,
    });
    creados.push({ id: d.id, codigo: d.codigo, proveedorId, total: d.total });
  }
  return creados;
}

/* ───────────── Lectura de facturas de proveedor en PDF ───────────── */

const NIF_RE = /\b(?:ES)?([ABCDEFGHJNPQRSUVW][-\s.]?\d{2}[-\s.]?\d{5}[0-9A-J]|\d{8}[-\s]?[A-HJ-NP-TV-Z]|[XYZ][-\s]?\d{7}[-\s]?[A-HJ-NP-TV-Z])\b/g;
const IMPORTE = String.raw`(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|-?\d+(?:[.,]\d{1,2}))`;

/** "1.234,56" → 1234.56 · "1234.56" → 1234.56 */
export function parseImporte(s: string | null | undefined): number | null {
  if (!s) return null;
  let t = s.replace(/[\s€]/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? round(n) : null;
}

function fechaISO(d: string, m: string, y: string) {
  const anio = y.length === 2 ? 2000 + Number(y) : Number(y);
  const mes = Number(m);
  const dia = Number(d);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || anio < 2000 || anio > 2100) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function ultimoImporte(texto: string, etiqueta: RegExp): number | null {
  const re = new RegExp(`${etiqueta.source}[^\\d\\n-]{0,40}${IMPORTE}`, 'gi');
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(texto))) last = m[m.length - 1]!;
  return parseImporte(last);
}

/**
 * Busca en el texto de una factura española el NIF del emisor, el número, la fecha y los importes.
 * Es una heurística: el usuario siempre revisa los datos antes de crear el borrador.
 */
export function detectarFactura(texto: string, nifPropio?: string | null): Omit<cprShared.FacturaDetectada, 'proveedorId' | 'proveedor'> & { nifs: string[] } {
  const plano = texto.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  const propio = (nifPropio ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const nifs = [...new Set([...plano.toUpperCase().matchAll(NIF_RE)].map((m) => m[1]!.replace(/[-\s.]/g, '')))].filter((n) => n !== propio);

  let numero: string | null = null;
  const numRes = [
    /(?:n[ºo°.]?\s*(?:de\s+)?factura|factura\s*(?:n[ºo°.]*|número|num\.?)|invoice\s*(?:no\.?|number|#))\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/.]{1,24})/i,
    /\bfactura\s*[:#]?\s*([A-Z]{0,4}[-\/]?\d[A-Z0-9\-\/.]{1,20})/i,
    /\bfra\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,20})/i,
  ];
  for (const re of numRes) {
    const m = re.exec(plano);
    if (m && /\d/.test(m[1]!)) {
      numero = m[1]!.replace(/[.\-\/]+$/, '');
      break;
    }
  }

  let fecha: string | null = null;
  const fm = /fecha(?:\s+(?:de\s+)?(?:la\s+)?(?:factura|emisi[oó]n|expedici[oó]n))?\s*[:.]?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i.exec(plano);
  if (fm) fecha = fechaISO(fm[1]!, fm[2]!, fm[3]!);
  if (!fecha) {
    const any = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/.exec(plano);
    if (any) fecha = fechaISO(any[1]!, any[2]!, any[3]!);
  }

  let ivaTipo: number | null = null;
  const tm = /i\.?\s?v\.?\s?a\.?\s*\(?\s*(21|10|4|0)\s*(?:[.,]0+)?\s*%/i.exec(plano) ?? /(21|10|4)\s*%\s*i\.?v\.?a/i.exec(plano);
  if (tm) ivaTipo = Number(tm[1]);

  let base = ultimoImporte(plano, /base\s+imponible|subtotal|importe\s+neto|base/);
  let iva = ultimoImporte(plano, /cuota\s+(?:de\s+)?i\.?v\.?a\.?|total\s+i\.?v\.?a\.?|i\.?v\.?a\.?\s*(?:\(?\s*\d{1,2}\s*(?:[.,]\d+)?\s*%\)?)?/);
  let total = ultimoImporte(plano, /total\s+(?:factura|a\s+pagar|documento)|importe\s+total|total/);

  // coherencia entre importes
  if (base !== null && total !== null && (iva === null || Math.abs(base + iva - total) > 0.05)) {
    const calc = round(total - base);
    if (calc >= 0 && calc <= base * 0.22) iva = calc;
  }
  if (base === null && total !== null && iva !== null) base = round(total - iva);
  if (base !== null && iva !== null && total === null) total = round(base + iva);
  if (base === null && total !== null && ivaTipo !== null) {
    base = round(total / (1 + ivaTipo / 100));
    iva = round(total - base);
  }
  if (ivaTipo === null && base && iva !== null) {
    const pct = (iva / base) * 100;
    ivaTipo = [21, 10, 4, 0].find((t) => Math.abs(t - pct) < 0.6) ?? null;
  }
  return { nif: nifs[0] ?? null, nifs, numero, fecha, base, iva, ivaTipo, total };
}

/** Extrae el texto de un PDF (solo PDF con texto: los escaneados no tienen texto que leer). */
export async function textoPdf(data: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}
