import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  DOC_COMPRA,
  DOC_FACTURAS,
  DOC_MODULO,
  DOC_TIPOS,
  calcDocumento,
  isValidNif,
  optionLabel,
  type DocTipo,
  type LineaStock,
} from '@kite/shared';
import type { Tx } from '../db/client';
import { newId } from '../db/helpers';
import { documentoImpuestos, documentoLineas, documentos, empresas, formasPago, terceros } from '../db/schema';
import { audit, diff } from '../core/audit';
import type { Ctx } from '../core/context';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { emit } from '../core/events';
import { nextNumber } from '../core/numbering';
import { notify } from '../core/notify';
import { can, canOnOwner } from '../core/permissions';
import { getAjustes } from '../core/settings';
import { randomToken } from '../core/auth';
import { registrarAlta } from './verifactu';

/* ───────────── Esquemas de entrada ───────────── */

export const lineaSchema = z.object({
  id: z.string().uuid().optional(),
  tipoLinea: z.enum(['articulo', 'texto', 'capitulo']).default('articulo'),
  articuloId: z.string().uuid().nullish(),
  referencia: z.string().nullish(),
  descripcion: z.string().default(''),
  cantidad: z.coerce.number().default(1),
  unidad: z.string().nullish(),
  precio: z.coerce.number().default(0),
  descuento: z.coerce.number().min(0).max(100).default(0),
  ivaTipo: z.coerce.number().min(0).max(100).default(21),
  retencion: z.coerce.number().min(0).max(50).default(0),
  coste: z.coerce.number().min(0).default(0),
  almacenId: z.string().uuid().nullish(),
  lote: z.string().nullish(),
  caducidad: z.string().nullish(),
  series: z.array(z.string()).nullish(),
  lineaOrigenId: z.string().uuid().nullish(),
});
export type LineaInput = z.infer<typeof lineaSchema>;

export const documentoSchema = z.object({
  tipo: z.enum(DOC_TIPOS.map((t) => t.value) as [DocTipo, ...DocTipo[]]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  terceroId: z.string().uuid({ message: 'Elige el cliente o proveedor' }),
  contactoId: z.string().uuid().nullish(),
  comercialId: z.string().uuid().nullish(),
  formaPagoId: z.string().uuid().nullish(),
  tarifaId: z.string().uuid().nullish(),
  serieId: z.string().uuid().nullish(),
  almacenId: z.string().uuid().nullish(),
  proyectoId: z.string().uuid().nullish(),
  fechaValidez: z.string().nullish(),
  fechaEntrega: z.string().nullish(),
  fechaOperacion: z.string().nullish(),
  descuentoGlobal: z.coerce.number().min(0).max(100).default(0),
  titulo: z.string().max(200).nullish(),
  observaciones: z.string().max(5000).nullish(),
  notasInternas: z.string().max(5000).nullish(),
  condiciones: z.string().max(5000).nullish(),
  referenciaExterna: z.string().max(100).nullish(),
  direccionEnvio: z.record(z.unknown()).nullish(),
  origenTipo: z.string().nullish(),
  origenId: z.string().uuid().nullish(),
  documentoOrigenId: z.string().uuid().nullish(),
  lineas: z.array(lineaSchema).max(2000),
});
export type DocumentoInput = z.infer<typeof documentoSchema>;

/* ───────────── Permisos por tipo ───────────── */

export const moduloDe = (tipo: string) => DOC_MODULO[tipo as DocTipo];
export const circuitoDe = (tipo: string) => (DOC_COMPRA.includes(tipo as DocTipo) ? 'compra' : 'venta');
export const esFactura = (tipo: string) => DOC_FACTURAS.includes(tipo as DocTipo);
export const tipoLabel = (tipo: string) => optionLabel(DOC_TIPOS, tipo)?.label ?? tipo;

export function permisoEditar(tipo: string) {
  switch (moduloDe(tipo)) {
    case 'pre':
      return 'pre.editar';
    case 'ped':
      return 'ped.editar';
    case 'fac':
      return 'fac.editar';
    case 'cpr':
      return tipo === 'recepcion' ? 'cpr.recibir' : 'cpr.editar';
    default:
      return 'cfg.gestionar';
  }
}

export function assertModulo(ctx: Ctx, tipo: string) {
  const m = moduloDe(tipo);
  if (!ctx.modules.has(m)) throw forbidden(`El módulo de ${tipoLabel(tipo).toLowerCase()}s no está activo`);
}

export async function puedeVer(ctx: Ctx, d: { tipo: string; comercialId: string | null; empresaId: string }) {
  if (d.empresaId !== ctx.empresaId) return false;
  const m = moduloDe(d.tipo);
  if (!ctx.modules.has(m)) return false;
  return canOnOwner(ctx, `${m}.ver`, d.comercialId);
}

export async function puedeEditar(ctx: Ctx, d: { tipo: string; comercialId: string | null }) {
  const p = permisoEditar(d.tipo);
  if (!can(ctx, p)) return false;
  return canOnOwner(ctx, p, d.comercialId);
}

/* ───────────── Lectura ───────────── */

export async function cargarDocumento(tx: Tx, ctx: Ctx, id: string) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, id));
  if (!d || !(await puedeVer(ctx, d))) throw notFound('Documento no encontrado');
  return d;
}

export async function lineasDe(tx: Tx, documentoId: string) {
  return tx.select().from(documentoLineas).where(eq(documentoLineas.documentoId, documentoId)).orderBy(asc(documentoLineas.orden));
}

/** Cantidad ya trasladada de cada línea a documentos de un tipo (excluye borradores cancelados y archivados). */
export async function cantidadesTrasladadas(tx: Tx, lineaIds: string[], tiposDestino: string[]) {
  if (!lineaIds.length) return new Map<string, number>();
  const rows = await tx
    .select({ origen: documentoLineas.lineaOrigenId, cantidad: sql<number>`sum(${documentoLineas.cantidad})::float` })
    .from(documentoLineas)
    .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
    .where(
      and(
        inArray(documentoLineas.lineaOrigenId, lineaIds),
        inArray(documentos.tipo, tiposDestino),
        isNull(documentos.archivadoEn),
        notInArray(documentos.estado, ['cancelado', 'rechazado']),
      ),
    )
    .groupBy(documentoLineas.lineaOrigenId);
  return new Map(rows.map((r) => [r.origen!, r.cantidad]));
}

/* ───────────── Escritura ───────────── */

async function datosTercero(tx: Tx, empresaId: string, terceroId: string) {
  const [t] = await tx.select().from(terceros).where(and(eq(terceros.id, terceroId), eq(terceros.empresaId, empresaId)));
  if (!t) throw badRequest('El cliente o proveedor no existe');
  return t;
}

function opcionesCalculo(regimen: string) {
  return {
    recargoEquivalencia: regimen === 'recargo',
    exento: regimen === 'exento' || regimen === 'intracomunitario' || regimen === 'exportacion' || regimen === 'isp',
  };
}

async function guardarLineas(tx: Tx, documentoId: string, lineas: LineaInput[], calc: ReturnType<typeof calcDocumento>, exento: boolean) {
  await tx.delete(documentoLineas).where(eq(documentoLineas.documentoId, documentoId));
  if (lineas.length)
    await tx.insert(documentoLineas).values(
      lineas.map((l, i) => ({
        id: l.id && l.id.length === 36 ? l.id : newId(),
        documentoId,
        orden: i,
        tipoLinea: l.tipoLinea,
        articuloId: l.articuloId ?? null,
        referencia: l.referencia ?? null,
        descripcion: l.descripcion ?? '',
        cantidad: l.tipoLinea === 'articulo' ? l.cantidad : 0,
        unidad: l.unidad ?? null,
        precio: l.tipoLinea === 'articulo' ? l.precio : 0,
        descuento: l.descuento ?? 0,
        ivaTipo: exento ? 0 : (l.ivaTipo ?? 21),
        retencion: l.retencion ?? 0,
        coste: l.coste ?? 0,
        subtotal: calc.lineas[i]!.subtotal,
        almacenId: l.almacenId ?? null,
        lote: l.lote ?? null,
        caducidad: l.caducidad || null,
        series: l.series ?? null,
        lineaOrigenId: l.lineaOrigenId ?? null,
      })),
    );
  await tx.delete(documentoImpuestos).where(eq(documentoImpuestos.documentoId, documentoId));
  const imps = calc.impuestos.filter((i) => i.base !== 0 || i.cuota !== 0);
  if (imps.length) await tx.insert(documentoImpuestos).values(imps.map((i) => ({ documentoId, ...i })));
}

function calcular(input: { lineas: LineaInput[]; descuentoGlobal?: number | null }, regimen: string) {
  const o = opcionesCalculo(regimen);
  const calc = calcDocumento(
    input.lineas.map((l) => ({ ...l, esTexto: l.tipoLinea !== 'articulo' })),
    { descuentoGlobal: input.descuentoGlobal, ...o },
  );
  return { calc, ...o };
}

export async function crearDocumento(tx: Tx, ctx: Ctx, input: DocumentoInput, opts: { sinPermisos?: boolean } = {}) {
  assertModulo(ctx, input.tipo);
  const perm = permisoEditar(input.tipo);
  if (!opts.sinPermisos && !can(ctx, perm)) throw forbidden();
  const t = await datosTercero(tx, ctx.empresaId, input.terceroId);
  const circuito = circuitoDe(input.tipo);
  if (circuito === 'compra' && !t.esProveedor) throw badRequest(`${t.nombre} no está marcado como proveedor`);
  // En ventas, el cliente tiene que estar dentro de la cartera visible del usuario
  if (!opts.sinPermisos && circuito === 'venta' && !(await canOnOwner(ctx, 'terceros.ver', t.comercialId)) && !can(ctx, 'terceros.ver', 'todo'))
    throw forbidden('Ese cliente no está en tu cartera');
  // el responsable por defecto: el comercial del cliente, o quien lo crea
  let comercialId = input.comercialId ?? (circuito === 'venta' ? t.comercialId : null) ?? ctx.personaId;
  if (!opts.sinPermisos && ctx.perms.get(perm) === 'propio') comercialId = ctx.personaId;
  if (!opts.sinPermisos && !(await canOnOwner(ctx, perm, comercialId))) throw forbidden('No puedes crear documentos para ese responsable');

  const ajustes = await getAjustes(ctx.empresaId);
  const { calc, recargoEquivalencia } = calcular(input, t.regimenIva);
  const id = newId();
  const { lineas, ...cab } = input;
  const fechaValidez =
    input.tipo === 'presupuesto' && !input.fechaValidez
      ? new Date(Date.parse(input.fecha) + ajustes.validezPresupuestoDias * 86400_000).toISOString().slice(0, 10)
      : input.fechaValidez;

  // Presupuestos y pedidos de venta (y de compra) llevan número desde el principio; las facturas al emitirse.
  let numeracion: { serieId: string; numero: number; codigo: string } | null = null;
  if (!esFactura(input.tipo) && input.tipo !== 'factura_proveedor') numeracion = await nextNumber(tx, ctx.empresaId, input.tipo, input.fecha, { serieId: input.serieId });

  const [d] = await tx
    .insert(documentos)
    .values({
      ...cab,
      id,
      empresaId: ctx.empresaId,
      circuito,
      estado: 'borrador',
      comercialId,
      formaPagoId: input.formaPagoId ?? t.formaPagoId,
      tarifaId: input.tarifaId ?? t.tarifaId,
      fechaValidez: fechaValidez || null,
      fechaEntrega: input.fechaEntrega || null,
      fechaOperacion: input.fechaOperacion || null,
      regimenIva: t.regimenIva,
      recargoEquivalencia,
      sumaLineas: calc.sumaLineas,
      baseImponible: calc.baseImponible,
      totalIva: calc.totalIva,
      totalRecargo: calc.totalRecargo,
      totalRetencion: calc.totalRetencion,
      total: calc.total,
      coste: calc.coste,
      margen: calc.margen,
      condiciones: input.condiciones ?? (input.tipo === 'presupuesto' ? ajustes.condicionesPresupuesto : null),
      serieId: numeracion?.serieId ?? input.serieId ?? null,
      numero: numeracion?.numero ?? null,
      codigo: numeracion?.codigo ?? null,
      grupoId: id,
      creadoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId,
    })
    .returning();
  await guardarLineas(tx, id, lineas, calc, opcionesCalculo(t.regimenIva).exento);
  await audit(tx, ctx, 'crear', 'documento', id, { tipo: input.tipo, codigo: d!.codigo, total: calc.total });
  return d!;
}

const EDITABLES: Record<string, string[]> = {
  presupuesto: ['borrador', 'pendiente_aprobacion'],
  pedido: ['borrador', 'confirmado'],
  albaran: ['borrador'],
  factura: ['borrador'],
  factura_rectificativa: ['borrador'],
  factura_simplificada: ['borrador'],
  proforma: ['borrador', 'enviada'],
  pedido_compra: ['borrador', 'pendiente_aprobacion', 'aprobado'],
  recepcion: ['borrador'],
  factura_proveedor: ['borrador', 'discrepancia'],
};

export async function actualizarDocumento(tx: Tx, ctx: Ctx, id: string, input: Omit<DocumentoInput, 'tipo'>) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, id)).for('update');
  if (!d || !(await puedeVer(ctx, d))) throw notFound('Documento no encontrado');
  if (!(await puedeEditar(ctx, d))) throw forbidden();
  if (d.bloqueado || !EDITABLES[d.tipo]?.includes(d.estado)) throw conflict(`No se puede modificar: el documento está ${d.estado.replace(/_/g, ' ')}`);
  if (d.tipo === 'pedido' && d.estado === 'confirmado') {
    // con un pedido confirmado se liberan y se vuelven a hacer las reservas
    await emit(tx, ctx, 'ventas.pedido_liberado', { documentoId: id });
  }
  const t = await datosTercero(tx, ctx.empresaId, input.terceroId);
  const { calc, recargoEquivalencia, exento } = calcular(input, t.regimenIva);
  const { lineas, ...cab } = input;
  let comercialId = cab.comercialId ?? d.comercialId;
  if (ctx.perms.get(permisoEditar(d.tipo)) === 'propio') comercialId = d.comercialId;
  const [after] = await tx
    .update(documentos)
    .set({
      ...cab,
      comercialId,
      fechaValidez: cab.fechaValidez || null,
      fechaEntrega: cab.fechaEntrega || null,
      fechaOperacion: cab.fechaOperacion || null,
      regimenIva: t.regimenIva,
      recargoEquivalencia,
      sumaLineas: calc.sumaLineas,
      baseImponible: calc.baseImponible,
      totalIva: calc.totalIva,
      totalRecargo: calc.totalRecargo,
      totalRetencion: calc.totalRetencion,
      total: calc.total,
      coste: calc.coste,
      margen: calc.margen,
      // si se edita un presupuesto pendiente de aprobar vuelve a borrador y la aprobación anterior deja de valer
      estado: d.tipo === 'presupuesto' && d.estado === 'pendiente_aprobacion' ? 'borrador' : d.estado,
      aprobadoPor: d.tipo === 'presupuesto' ? null : d.aprobadoPor,
    })
    .where(eq(documentos.id, id))
    .returning();
  await guardarLineas(tx, id, lineas, calc, exento);
  if (d.tipo === 'pedido' && d.estado === 'confirmado') await emitirReservas(tx, ctx, id);
  await audit(tx, ctx, 'editar', 'documento', id, diff(d, after));
  return after!;
}

export async function borrarBorrador(tx: Tx, ctx: Ctx, id: string) {
  const d = await cargarDocumento(tx, ctx, id);
  if (!(await puedeEditar(ctx, d))) throw forbidden();
  if (d.bloqueado || d.estado !== 'borrador') throw conflict('Solo se pueden borrar documentos en borrador. Para el resto, cancélalos o emite una rectificativa.');
  if (d.numero) {
    // un documento numerado no se borra para no dejar huecos: se archiva
    await tx.update(documentos).set({ archivadoEn: new Date(), estado: d.tipo === 'pedido' ? 'cancelado' : d.estado }).where(eq(documentos.id, id));
  } else await tx.delete(documentos).where(eq(documentos.id, id));
  await audit(tx, ctx, 'borrar', 'documento', id, { tipo: d.tipo, codigo: d.codigo });
}

/* ───────────── Conversión entre documentos ───────────── */

const DESTINOS: Record<string, string[]> = {
  presupuesto: ['pedido', 'albaran', 'factura', 'proforma'],
  pedido: ['albaran', 'factura', 'proforma'],
  albaran: ['factura'],
  proforma: ['factura'],
  factura: ['factura_rectificativa'],
  factura_simplificada: ['factura_rectificativa'],
  pedido_compra: ['recepcion', 'factura_proveedor'],
  recepcion: ['factura_proveedor'],
};

/** Tipos que "consumen" cantidad de cada origen para calcular lo pendiente. */
const CONSUMIDORES: Record<string, string[]> = {
  pedido: ['pedido'],
  albaran: ['albaran'],
  factura: ['factura', 'factura_simplificada'],
  proforma: ['proforma'],
  recepcion: ['recepcion'],
  factura_proveedor: ['factura_proveedor'],
};

export async function convertir(tx: Tx, ctx: Ctx, origenId: string, destino: string, seleccion?: { lineaId: string; cantidad: number }[]) {
  const o = await cargarDocumento(tx, ctx, origenId);
  if (!DESTINOS[o.tipo]?.includes(destino)) throw badRequest(`Un ${tipoLabel(o.tipo).toLowerCase()} no se puede convertir en ${tipoLabel(destino).toLowerCase()}`);
  if (destino === 'factura_rectificativa') return crearRectificativa(tx, ctx, origenId, 'diferencias');
  if (o.tipo !== 'factura' && !o.bloqueado && ['borrador'].includes(o.estado) && o.tipo !== 'presupuesto')
    throw conflict('Confirma el documento antes de convertirlo');
  const lineas = await lineasDe(tx, origenId);
  const ya = await cantidadesTrasladadas(tx, lineas.map((l) => l.id), CONSUMIDORES[destino] ?? [destino]);
  const sel = seleccion ? new Map(seleccion.map((s) => [s.lineaId, s.cantidad])) : null;
  const nuevas: LineaInput[] = [];
  for (const l of lineas) {
    if (l.tipoLinea !== 'articulo') {
      nuevas.push({ tipoLinea: l.tipoLinea as 'texto', descripcion: l.descripcion, cantidad: 0, precio: 0, descuento: 0, ivaTipo: l.ivaTipo, retencion: 0, coste: 0 });
      continue;
    }
    const pendiente = Math.round((l.cantidad - (ya.get(l.id) ?? 0)) * 10000) / 10000;
    const cantidad = sel ? Math.min(sel.get(l.id) ?? 0, pendiente) : pendiente;
    if (cantidad <= 0) continue;
    nuevas.push({
      tipoLinea: 'articulo',
      articuloId: l.articuloId,
      referencia: l.referencia,
      descripcion: l.descripcion,
      cantidad,
      unidad: l.unidad,
      precio: l.precio,
      descuento: l.descuento,
      ivaTipo: l.ivaTipo,
      retencion: l.retencion,
      coste: l.coste,
      almacenId: l.almacenId ?? o.almacenId,
      lote: l.lote,
      caducidad: l.caducidad,
      series: l.series,
      lineaOrigenId: l.id,
    });
  }
  if (!nuevas.some((l) => l.tipoLinea === 'articulo')) throw conflict('No queda nada pendiente de convertir en este documento');
  const hoy = new Date().toISOString().slice(0, 10);
  const d = await crearDocumento(tx, ctx, {
    tipo: destino as DocTipo,
    fecha: hoy,
    terceroId: o.terceroId,
    contactoId: o.contactoId,
    comercialId: o.comercialId,
    formaPagoId: o.formaPagoId,
    tarifaId: o.tarifaId,
    almacenId: o.almacenId,
    proyectoId: o.proyectoId,
    descuentoGlobal: o.descuentoGlobal,
    titulo: o.titulo,
    observaciones: o.observaciones,
    referenciaExterna: o.referenciaExterna,
    direccionEnvio: o.direccionEnvio,
    origenTipo: o.origenTipo,
    origenId: o.origenId,
    documentoOrigenId: o.id,
    lineas: nuevas,
  });
  if (o.tipo === 'presupuesto' && o.estado !== 'aceptado') await marcarAceptado(tx, ctx, o.id, { nombre: ctx.nombre, interno: true });
  return d;
}

/** Agrupa varios albaranes entregados de un mismo cliente en una factura. */
export async function facturarAlbaranes(tx: Tx, ctx: Ctx, ids: string[]) {
  if (!ids.length) throw badRequest('Selecciona al menos un albarán');
  const albs = await tx.select().from(documentos).where(and(inArray(documentos.id, ids), eq(documentos.empresaId, ctx.empresaId)));
  if (albs.length !== ids.length) throw notFound('Algún albarán no existe');
  const tercero = albs[0]!.terceroId;
  for (const a of albs) {
    if (a.tipo !== 'albaran') throw badRequest(`${a.codigo} no es un albarán`);
    if (a.terceroId !== tercero) throw badRequest('Todos los albaranes deben ser del mismo cliente');
    if (a.estado !== 'entregado') throw conflict(`El albarán ${a.codigo} no está entregado o ya está facturado`);
    if (!(await puedeVer(ctx, a))) throw forbidden();
  }
  const nuevas: LineaInput[] = [];
  for (const a of albs.sort((x, y) => x.fecha.localeCompare(y.fecha))) {
    nuevas.push({ tipoLinea: 'capitulo', descripcion: `Albarán ${a.codigo} del ${a.fecha.split('-').reverse().join('/')}${a.referenciaExterna ? ` · Su ref. ${a.referenciaExterna}` : ''}`, cantidad: 0, precio: 0, descuento: 0, ivaTipo: 21, retencion: 0, coste: 0 });
    for (const l of await lineasDe(tx, a.id)) {
      if (l.tipoLinea !== 'articulo') continue;
      nuevas.push({ tipoLinea: 'articulo', articuloId: l.articuloId, referencia: l.referencia, descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, precio: l.precio, descuento: l.descuento, ivaTipo: l.ivaTipo, retencion: l.retencion, coste: l.coste, lineaOrigenId: l.id });
    }
  }
  const first = albs[0]!;
  return crearDocumento(tx, ctx, {
    tipo: 'factura',
    fecha: new Date().toISOString().slice(0, 10),
    terceroId: tercero,
    comercialId: first.comercialId,
    formaPagoId: first.formaPagoId,
    descuentoGlobal: 0,
    documentoOrigenId: albs.length === 1 ? first.id : null,
    proyectoId: first.proyectoId,
    origenTipo: albs.length === 1 ? first.origenTipo : null,
    origenId: albs.length === 1 ? first.origenId : null,
    lineas: nuevas,
  });
}

/* ───────────── Acciones de estado ───────────── */

async function setEstado(tx: Tx, ctx: Ctx, id: string, estado: string, extra: Record<string, unknown> = {}) {
  const [after] = await tx.update(documentos).set({ estado, ...extra }).where(eq(documentos.id, id)).returning();
  await audit(tx, ctx, `estado_${estado}`, 'documento', id, extra && Object.keys(extra).length ? extra : null);
  return after!;
}

async function lineasStock(tx: Tx, documentoId: string, almacenDefecto: string | null): Promise<LineaStock[]> {
  const ls = await lineasDe(tx, documentoId);
  return ls
    .filter((l) => l.tipoLinea === 'articulo' && l.articuloId && l.cantidad !== 0)
    .map((l) => ({ lineaId: l.id, articuloId: l.articuloId!, almacenId: l.almacenId ?? almacenDefecto, cantidad: l.cantidad, coste: l.coste, lote: l.lote, caducidad: l.caducidad, series: l.series }));
}

async function emitirReservas(tx: Tx, ctx: Ctx, id: string) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, id));
  const ls = await lineasStock(tx, id, d!.almacenId);
  const ya = await cantidadesTrasladadas(tx, ls.map((l) => l.lineaId!), ['albaran']);
  const pendientes = ls.map((l) => ({ ...l, cantidad: l.cantidad - (ya.get(l.lineaId!) ?? 0) })).filter((l) => l.cantidad > 0);
  if (pendientes.length) await emit(tx, ctx, 'ventas.pedido_confirmado', { documentoId: id, lineas: pendientes });
}

/** Recalcula el estado de un pedido (venta o compra) según lo servido/recibido. */
async function actualizarEstadoOrigen(tx: Tx, ctx: Ctx, origenId: string | null) {
  if (!origenId) return;
  const [o] = await tx.select().from(documentos).where(eq(documentos.id, origenId));
  if (!o || !['pedido', 'pedido_compra'].includes(o.tipo) || ['cancelado', 'borrador'].includes(o.estado)) return;
  const ls = (await lineasDe(tx, o.id)).filter((l) => l.tipoLinea === 'articulo');
  const destino = o.tipo === 'pedido' ? ['albaran'] : ['recepcion'];
  const rows = await tx
    .select({ origen: documentoLineas.lineaOrigenId, cantidad: sql<number>`sum(${documentoLineas.cantidad})::float` })
    .from(documentoLineas)
    .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
    .where(and(inArray(documentoLineas.lineaOrigenId, ls.map((l) => l.id)), inArray(documentos.tipo, destino), inArray(documentos.estado, ['entregado', 'facturado', 'confirmada'])))
    .groupBy(documentoLineas.lineaOrigenId);
  const hecho = new Map(rows.map((r) => [r.origen!, r.cantidad]));
  const total = ls.every((l) => (hecho.get(l.id) ?? 0) >= l.cantidad - 0.00001);
  const algo = ls.some((l) => (hecho.get(l.id) ?? 0) > 0);
  const nuevo = o.tipo === 'pedido' ? (total ? 'servido' : algo ? 'parcial' : o.estado) : total ? 'recibido' : algo ? 'parcial' : o.estado;
  if (nuevo !== o.estado) {
    await setEstado(tx, ctx, o.id, nuevo);
    if (o.tipo === 'pedido' && nuevo === 'servido') await emit(tx, ctx, 'ventas.pedido_liberado', { documentoId: o.id });
  }
}

export async function marcarAceptado(tx: Tx, ctx: Ctx, id: string, by: { nombre: string; firma?: string | null; interno?: boolean }) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, id));
  if (!d) throw notFound();
  if (d.estado === 'aceptado') return d;
  const after = await setEstado(tx, ctx, id, 'aceptado', { aceptadoEn: new Date(), aceptadoPor: by.nombre, firmaImagen: by.firma ?? null });
  await emit(tx, ctx, 'ventas.presupuesto_aceptado', { documentoId: id, terceroId: d.terceroId, oportunidadId: d.origenTipo === 'oportunidad' ? d.origenId : null });
  if (!by.interno)
    await notify(tx, ctx, { modulo: 'pre', tipo: 'aceptado', titulo: `Presupuesto ${d.codigo} aceptado por el cliente`, cuerpo: `Firmado por ${by.nombre}`, enlace: `/documentos/${id}`, personaIds: [d.comercialId], email: true, excluirActor: false });
  return after;
}

export async function prepararEnvioPublico(tx: Tx, id: string) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, id));
  if (d!.tokenPublico) return d!.tokenPublico;
  const token = randomToken(24);
  await tx.update(documentos).set({ tokenPublico: token }).where(eq(documentos.id, id));
  return token;
}

/** Riesgo: lo pendiente de cobro más este documento frente al riesgo máximo del cliente. */
export async function comprobarRiesgo(tx: Tx, ctx: Ctx, terceroId: string, importe: number, excluirId?: string) {
  const [t] = await tx.select({ riesgo: terceros.riesgoMax, nombre: terceros.nombre }).from(terceros).where(eq(terceros.id, terceroId));
  if (!t?.riesgo) return null;
  const [p] = await tx
    .select({ pendiente: sql<number>`coalesce(sum(${documentos.total}), 0)::float` })
    .from(documentos)
    .where(
      and(
        eq(documentos.terceroId, terceroId),
        inArray(documentos.tipo, DOC_FACTURAS),
        eq(documentos.bloqueado, true),
        inArray(sql`coalesce(${documentos.estadoPago}, 'pendiente')`, ['pendiente', 'parcial', 'impagado']),
        excluirId ? ne(documentos.id, excluirId) : undefined,
      ),
    );
  const total = (p?.pendiente ?? 0) + importe;
  if (total <= t.riesgo) return null;
  const ajustes = await getAjustes(ctx.empresaId);
  const msg = `${t.nombre} superaría su riesgo máximo (${t.riesgo.toFixed(2)} €): pendiente ${(p?.pendiente ?? 0).toFixed(2)} € + este documento ${importe.toFixed(2)} €`;
  if (ajustes.bloquearRiesgo) throw conflict(msg);
  return msg;
}

export async function ejecutarAccion(tx: Tx, ctx: Ctx, id: string, accion: string, datos: Record<string, any> = {}) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, id)).for('update');
  if (!d || !(await puedeVer(ctx, d))) throw notFound('Documento no encontrado');
  assertModulo(ctx, d.tipo);
  const editar = await puedeEditar(ctx, d);
  const requiere = (cond: boolean, msg = 'No tienes permiso para esta acción') => {
    if (!cond) throw forbidden(msg);
  };
  const estadoEn = (...estados: string[]) => {
    if (!estados.includes(d.estado)) throw conflict(`No se puede ${accion.replace(/_/g, ' ')}: el documento está ${d.estado.replace(/_/g, ' ')}`);
  };
  let aviso: string | null = null;

  switch (`${d.tipo}:${accion}`) {
    /* ── Presupuestos ── */
    case 'presupuesto:enviar':
    case 'presupuesto:marcar_enviado': {
      requiere(editar);
      estadoEn('borrador', 'enviado', 'visto');
      const ajustes = await getAjustes(ctx.empresaId);
      const margenPct = d.baseImponible ? (d.margen / d.baseImponible) * 100 : 100;
      // un presupuesto ya aprobado por dirección puede enviarse aunque el margen sea bajo
      if (d.estado === 'borrador' && !d.aprobadoPor && d.coste > 0 && margenPct < ajustes.margenMinimoPresupuesto && !can(ctx, 'pre.aprobar')) {
        await setEstado(tx, ctx, id, 'pendiente_aprobacion');
        await notify(tx, ctx, { modulo: 'pre', tipo: 'aprobar', titulo: `Presupuesto ${d.codigo} pendiente de aprobar`, cuerpo: `Margen ${margenPct.toFixed(1)} % (mínimo ${ajustes.margenMinimoPresupuesto} %)`, enlace: `/documentos/${id}`, permiso: 'pre.aprobar' });
        return { estado: 'pendiente_aprobacion', aviso: `El margen (${margenPct.toFixed(1)} %) está por debajo del mínimo: se ha enviado a aprobación.` };
      }
      aviso = await comprobarRiesgo(tx, ctx, d.terceroId, d.total);
      await prepararEnvioPublico(tx, id);
      await setEstado(tx, ctx, id, d.estado === 'borrador' ? 'enviado' : d.estado, { enviadoEn: new Date() });
      break;
    }
    case 'presupuesto:aprobar':
      requiere(can(ctx, 'pre.aprobar'));
      estadoEn('pendiente_aprobacion');
      await setEstado(tx, ctx, id, 'borrador', { aprobadoPor: ctx.usuarioId });
      await notify(tx, ctx, { modulo: 'pre', tipo: 'aprobado', titulo: `Presupuesto ${d.codigo} aprobado`, cuerpo: 'Ya puedes enviarlo al cliente', enlace: `/documentos/${id}`, personaIds: [d.comercialId] });
      break;
    case 'presupuesto:aceptar':
      requiere(editar);
      estadoEn('borrador', 'enviado', 'visto', 'rechazado', 'caducado');
      await marcarAceptado(tx, ctx, id, { nombre: datos.nombre || ctx.nombre, interno: true });
      break;
    case 'presupuesto:rechazar':
      requiere(editar);
      estadoEn('borrador', 'enviado', 'visto', 'pendiente_aprobacion');
      await setEstado(tx, ctx, id, 'rechazado', { rechazoMotivo: datos.motivo ?? null });
      break;
    case 'presupuesto:reabrir':
      requiere(editar);
      estadoEn('rechazado', 'caducado', 'enviado', 'visto');
      await setEstado(tx, ctx, id, 'borrador');
      break;
    case 'presupuesto:nueva_version': {
      requiere(editar);
      const ls = await lineasDe(tx, id);
      const [maxV] = await tx.select({ v: sql<number>`max(${documentos.version})::int` }).from(documentos).where(eq(documentos.grupoId, d.grupoId ?? d.id));
      const nuevo = await crearDocumento(tx, ctx, {
        tipo: 'presupuesto',
        fecha: new Date().toISOString().slice(0, 10),
        terceroId: d.terceroId,
        contactoId: d.contactoId,
        comercialId: d.comercialId,
        formaPagoId: d.formaPagoId,
        tarifaId: d.tarifaId,
        descuentoGlobal: d.descuentoGlobal,
        titulo: d.titulo,
        observaciones: d.observaciones,
        notasInternas: d.notasInternas,
        condiciones: d.condiciones,
        origenTipo: d.origenTipo,
        origenId: d.origenId,
        proyectoId: d.proyectoId,
        lineas: ls.map((l) => ({ ...l, id: undefined, lineaOrigenId: null, series: l.series ?? undefined, tipoLinea: l.tipoLinea as 'articulo' })),
      });
      await tx.update(documentos).set({ grupoId: d.grupoId ?? d.id, version: (maxV?.v ?? 1) + 1, codigo: `${d.codigo?.replace(/-v\d+$/, '')}-v${(maxV?.v ?? 1) + 1}` }).where(eq(documentos.id, nuevo.id));
      if (['enviado', 'visto', 'borrador', 'pendiente_aprobacion'].includes(d.estado)) await setEstado(tx, ctx, id, 'rechazado', { rechazoMotivo: `Sustituido por la versión ${(maxV?.v ?? 1) + 1}` });
      return { id: nuevo.id };
    }

    /* ── Pedidos de venta ── */
    case 'pedido:confirmar':
      requiere(editar);
      estadoEn('borrador');
      aviso = await comprobarRiesgo(tx, ctx, d.terceroId, d.total);
      await setEstado(tx, ctx, id, 'confirmado');
      await emitirReservas(tx, ctx, id);
      await notify(tx, ctx, { modulo: 'ped', tipo: 'pedido', titulo: `Nuevo pedido ${d.codigo} para preparar`, enlace: `/documentos/${id}`, permiso: 'ped.preparar' });
      break;
    case 'pedido:preparar':
      requiere(can(ctx, 'ped.preparar') || editar);
      estadoEn('confirmado', 'parcial');
      await setEstado(tx, ctx, id, 'en_preparacion');
      break;
    case 'pedido:cancelar':
      requiere(editar);
      estadoEn('borrador', 'confirmado', 'en_preparacion', 'parcial');
      await setEstado(tx, ctx, id, 'cancelado');
      await emit(tx, ctx, 'ventas.pedido_liberado', { documentoId: id });
      break;

    /* ── Albaranes ── */
    case 'albaran:entregar': {
      requiere(can(ctx, 'ped.preparar') || editar);
      estadoEn('borrador');
      await setEstado(tx, ctx, id, 'entregado', { aceptadoEn: new Date(), aceptadoPor: datos.receptor ?? null, firmaImagen: datos.firma ?? null });
      const ls = await lineasStock(tx, id, d.almacenId);
      await emit(tx, ctx, 'ventas.albaran_entregado', { documentoId: id, terceroId: d.terceroId, origenTipo: d.origenTipo, origenId: d.origenId, lineas: ls });
      await actualizarEstadoOrigen(tx, ctx, d.documentoOrigenId);
      break;
    }

    /* ── Facturas ── */
    case 'factura:emitir':
    case 'factura_simplificada:emitir':
    case 'factura_rectificativa:emitir':
      requiere(can(ctx, 'fac.emitir'), 'Solo quien puede emitir facturas puede hacerlo');
      estadoEn('borrador');
      await emitirFactura(tx, ctx, d, datos.serieId ?? null);
      return { estado: 'emitida' };
    case 'factura:rectificar':
    case 'factura_simplificada:rectificar': {
      requiere(can(ctx, 'fac.emitir'));
      estadoEn('emitida');
      const r = await crearRectificativa(tx, ctx, id, datos.modo === 'total' ? 'total' : 'diferencias', datos.motivo);
      return { id: r.id };
    }
    case 'proforma:enviar':
      requiere(editar);
      await prepararEnvioPublico(tx, id);
      await setEstado(tx, ctx, id, 'enviada', { enviadoEn: new Date() });
      break;

    /* ── Compras ── */
    case 'pedido_compra:solicitar_aprobacion':
    case 'pedido_compra:confirmar': {
      requiere(editar);
      estadoEn('borrador');
      const ajustes = await getAjustes(ctx.empresaId);
      if (d.total > ajustes.umbralAprobacionCompra && !can(ctx, 'cpr.aprobar', 'todo')) {
        await setEstado(tx, ctx, id, 'pendiente_aprobacion');
        await notify(tx, ctx, { modulo: 'cpr', tipo: 'aprobar', titulo: `Pedido de compra ${d.codigo} pendiente de aprobar`, cuerpo: `Importe ${d.total.toFixed(2)} €`, enlace: `/documentos/${id}`, permiso: 'cpr.aprobar' });
        return { estado: 'pendiente_aprobacion', aviso: `Supera ${ajustes.umbralAprobacionCompra} €: se ha enviado a aprobación.` };
      }
      await setEstado(tx, ctx, id, 'aprobado', { aprobadoPor: ctx.usuarioId });
      break;
    }
    case 'pedido_compra:aprobar':
      requiere(can(ctx, 'cpr.aprobar'));
      estadoEn('pendiente_aprobacion');
      await setEstado(tx, ctx, id, 'aprobado', { aprobadoPor: ctx.usuarioId });
      await notify(tx, ctx, { modulo: 'cpr', tipo: 'aprobado', titulo: `Pedido de compra ${d.codigo} aprobado`, enlace: `/documentos/${id}`, personaIds: [d.comercialId] });
      break;
    case 'pedido_compra:rechazar':
      requiere(can(ctx, 'cpr.aprobar'));
      estadoEn('pendiente_aprobacion');
      await setEstado(tx, ctx, id, 'cancelado', { rechazoMotivo: datos.motivo ?? null });
      await notify(tx, ctx, { modulo: 'cpr', tipo: 'rechazado', titulo: `Pedido de compra ${d.codigo} rechazado`, cuerpo: datos.motivo ?? null, enlace: `/documentos/${id}`, personaIds: [d.comercialId] });
      break;
    case 'pedido_compra:marcar_enviado':
      requiere(editar);
      estadoEn('aprobado');
      await setEstado(tx, ctx, id, 'enviado', { enviadoEn: new Date() });
      break;
    case 'pedido_compra:cancelar':
      requiere(editar);
      estadoEn('borrador', 'pendiente_aprobacion', 'aprobado', 'enviado');
      await setEstado(tx, ctx, id, 'cancelado');
      break;
    case 'recepcion:confirmar': {
      requiere(can(ctx, 'cpr.recibir') || editar);
      estadoEn('borrador');
      await setEstado(tx, ctx, id, 'confirmada', { aceptadoEn: new Date(), aceptadoPor: ctx.nombre });
      const ls = await lineasStock(tx, id, d.almacenId);
      await emit(tx, ctx, 'compras.recepcion_confirmada', { documentoId: id, terceroId: d.terceroId, lineas: ls });
      await actualizarEstadoOrigen(tx, ctx, d.documentoOrigenId);
      await notify(tx, ctx, { modulo: 'cpr', tipo: 'recibido', titulo: `Mercancía recibida: ${d.codigo}`, enlace: `/documentos/${id}`, personaIds: [d.comercialId] });
      break;
    }
    case 'factura_proveedor:registrar': {
      requiere(can(ctx, 'cpr.editar'));
      estadoEn('borrador', 'discrepancia');
      if (!d.referenciaExterna) throw badRequest('Indica el número de factura del proveedor');
      const dup = await tx
        .select({ id: documentos.id })
        .from(documentos)
        .where(and(eq(documentos.terceroId, d.terceroId), eq(documentos.tipo, 'factura_proveedor'), eq(documentos.referenciaExterna, d.referenciaExterna), ne(documentos.id, id), eq(documentos.bloqueado, true)));
      if (dup.length) throw conflict(`Ya está registrada la factura ${d.referenciaExterna} de este proveedor`);
      const disc = await discrepanciasCompra(tx, id);
      if (disc.length && !datos.forzar) {
        await setEstado(tx, ctx, id, 'discrepancia');
        return { estado: 'discrepancia', aviso: disc.join('. '), discrepancias: disc };
      }
      const num = await nextNumber(tx, ctx.empresaId, 'factura_proveedor', d.fecha);
      const t = await datosTercero(tx, ctx.empresaId, d.terceroId);
      await tx
        .update(documentos)
        .set({ ...num, estado: 'registrada', bloqueado: true, emitidoEn: new Date(), estadoPago: 'pendiente', datosTercero: snapshotTercero(t) })
        .where(eq(documentos.id, id));
      await audit(tx, ctx, 'registrar', 'documento', id, { codigo: num.codigo });
      await emit(tx, ctx, 'compras.factura_registrada', { documentoId: id, terceroId: d.terceroId, total: d.total, fecha: d.fecha });
      return { estado: 'registrada' };
    }
    default:
      throw badRequest(`Acción no disponible para ${tipoLabel(d.tipo).toLowerCase()}: ${accion}`);
  }
  const [after] = await tx.select({ estado: documentos.estado }).from(documentos).where(eq(documentos.id, id));
  return { estado: after!.estado, aviso };
}

function snapshotTercero(t: typeof terceros.$inferSelect) {
  return {
    nombre: t.nombre,
    razonSocial: t.razonSocial ?? t.nombre,
    nif: t.nif,
    direccion: t.direccion,
    codigoPostal: t.codigoPostal,
    localidad: t.localidad,
    provincia: t.provincia,
    pais: t.pais,
    email: t.email,
    iban: t.iban,
    mandatoSepa: t.mandatoSepa,
    mandatoFecha: t.mandatoFecha,
  };
}

async function discrepanciasCompra(tx: Tx, facturaId: string) {
  const ls = (await lineasDe(tx, facturaId)).filter((l) => l.tipoLinea === 'articulo');
  const out: string[] = [];
  const origenIds = ls.map((l) => l.lineaOrigenId).filter(Boolean) as string[];
  if (!origenIds.length) return out;
  const orig = await tx.select().from(documentoLineas).where(inArray(documentoLineas.id, origenIds));
  for (const l of ls) {
    const o = orig.find((x) => x.id === l.lineaOrigenId);
    if (!o) continue;
    if (Math.abs(o.precio - l.precio) > 0.005) out.push(`${l.descripcion}: precio facturado ${l.precio} € y pedido ${o.precio} €`);
    if (l.cantidad - o.cantidad > 0.0001) out.push(`${l.descripcion}: se facturan ${l.cantidad} y se recibieron ${o.cantidad}`);
  }
  return out;
}

export async function emitirFactura(tx: Tx, ctx: Ctx, d: typeof documentos.$inferSelect, serieId: string | null) {
  const [emp] = await tx.select().from(empresas).where(eq(empresas.id, ctx.empresaId));
  if (!emp?.nif) throw badRequest('Configura el NIF de la empresa antes de emitir facturas (Configuración → Empresa)');
  const t = await datosTercero(tx, ctx.empresaId, d.terceroId);
  const ls = await lineasDe(tx, d.id);
  if (!ls.some((l) => l.tipoLinea === 'articulo')) throw badRequest('La factura no tiene líneas');
  if (d.tipo === 'factura' && (!t.nif || (t.pais === 'ES' && !isValidNif(t.nif))))
    throw badRequest(`${t.nombre} no tiene un NIF válido. Corrígelo en su ficha o emite una factura simplificada.`);
  if (d.tipo === 'factura_simplificada' && d.total > 3000) throw badRequest('Una factura simplificada no puede superar 3.000 € (IVA incluido)');
  if (d.tipo !== 'factura_rectificativa' && d.total < 0) throw badRequest('El total no puede ser negativo: usa una factura rectificativa');

  const num = await nextNumber(tx, ctx.empresaId, d.tipo, d.fecha, { serieId: serieId ?? d.serieId });
  // Correlatividad: no puede haber facturas de la serie con fecha posterior
  const [posterior] = await tx
    .select({ codigo: documentos.codigo, fecha: documentos.fecha })
    .from(documentos)
    .where(and(eq(documentos.serieId, num.serieId), eq(documentos.bloqueado, true), sql`${documentos.fecha} > ${d.fecha}`))
    .limit(1);
  if (posterior) throw conflict(`La factura ${posterior.codigo} de esta serie tiene fecha ${posterior.fecha}: no se puede emitir con fecha anterior`);

  const snap = snapshotTercero(t);
  const formaPago = d.formaPagoId ? (await tx.select().from(formasPago).where(eq(formasPago.id, d.formaPagoId)))[0] : null;
  await tx
    .update(documentos)
    .set({ ...num, estado: 'emitida', bloqueado: true, emitidoEn: new Date(), datosTercero: { ...snap, formaPago: formaPago?.nombre ?? null }, estadoPago: d.total > 0 ? 'pendiente' : 'pagado' })
    .where(eq(documentos.id, d.id));

  let rectificada: { numSerie: string; fechaIso: string } | null = null;
  if (d.rectificaId) {
    const [r] = await tx.select().from(documentos).where(eq(documentos.id, d.rectificaId));
    if (r) {
      rectificada = { numSerie: r.codigo!, fechaIso: r.fecha };
      await tx.update(documentos).set({ estado: 'rectificada' }).where(eq(documentos.id, r.id));
    }
  }
  const imps = await tx.select().from(documentoImpuestos).where(eq(documentoImpuestos.documentoId, d.id));
  await registrarAlta(tx, {
    empresaId: ctx.empresaId,
    documentoId: d.id,
    nifEmisor: emp.nif,
    razonSocialEmisor: emp.razonSocial ?? emp.nombre,
    numSerie: num.codigo,
    fechaIso: d.fecha,
    tipoFactura: d.tipo === 'factura_simplificada' ? 'F2' : d.tipo === 'factura_rectificativa' ? (d.tipoRectificativa ?? 'R1') : 'F1',
    tipoRectificativa: d.tipo === 'factura_rectificativa' ? 'I' : null,
    descripcion: d.titulo ?? ls.find((l) => l.tipoLinea === 'articulo')?.descripcion ?? 'Venta',
    destinatario: d.tipo === 'factura_simplificada' ? null : { nif: t.nif, nombre: t.razonSocial ?? t.nombre },
    desglose: imps.map((i) => ({ ivaTipo: i.ivaTipo, base: i.base, cuota: i.cuota, recargoPct: i.recargoPct, cuotaRecargo: i.cuotaRecargo })),
    cuotaTotal: Math.round((d.totalIva + d.totalRecargo) * 100) / 100,
    importeTotal: d.total,
    rectificada,
  });
  await audit(tx, ctx, 'emitir', 'documento', d.id, { codigo: num.codigo, total: d.total });

  // Albaranes origen pasan a facturados
  const origenLineas = ls.map((l) => l.lineaOrigenId).filter(Boolean) as string[];
  if (origenLineas.length) {
    const albs = await tx
      .selectDistinct({ id: documentos.id })
      .from(documentoLineas)
      .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
      .where(and(inArray(documentoLineas.id, origenLineas), eq(documentos.tipo, 'albaran')));
    if (albs.length) await tx.update(documentos).set({ estado: 'facturado' }).where(inArray(documentos.id, albs.map((a) => a.id)));
  }
  await emit(tx, ctx, 'ventas.factura_emitida', { documentoId: d.id, terceroId: d.terceroId, total: d.total, fecha: d.fecha });
}

export async function crearRectificativa(tx: Tx, ctx: Ctx, facturaId: string, modo: 'total' | 'diferencias', motivo?: string) {
  const f = await cargarDocumento(tx, ctx, facturaId);
  if (!esFactura(f.tipo) || f.tipo === 'factura_rectificativa') throw badRequest('Solo se rectifican facturas emitidas');
  if (!f.bloqueado) throw conflict('La factura aún es un borrador: edítala directamente');
  const [existente] = await tx
    .select({ id: documentos.id, codigo: documentos.codigo })
    .from(documentos)
    .where(and(eq(documentos.rectificaId, facturaId), eq(documentos.estado, 'borrador')));
  if (existente) return { id: existente.id };
  const ls = await lineasDe(tx, facturaId);
  const d = await crearDocumento(tx, ctx, {
    tipo: 'factura_rectificativa',
    fecha: new Date().toISOString().slice(0, 10),
    terceroId: f.terceroId,
    comercialId: f.comercialId,
    formaPagoId: f.formaPagoId,
    descuentoGlobal: f.descuentoGlobal,
    titulo: `Rectifica a ${f.codigo}`,
    observaciones: motivo ?? null,
    documentoOrigenId: f.id,
    lineas: ls.map((l) => ({
      tipoLinea: l.tipoLinea as 'articulo',
      articuloId: l.articuloId,
      referencia: l.referencia,
      descripcion: l.descripcion,
      cantidad: modo === 'total' ? -l.cantidad : -l.cantidad,
      unidad: l.unidad,
      precio: l.precio,
      descuento: l.descuento,
      ivaTipo: l.ivaTipo,
      retencion: l.retencion,
      coste: l.coste,
    })),
  });
  await tx.update(documentos).set({ rectificaId: f.id, motivoRectificacion: motivo ?? null, tipoRectificativa: 'R1' }).where(eq(documentos.id, d.id));
  return d;
}

/* ───────────── Consultas de apoyo ───────────── */

export async function relacionados(tx: Tx, d: typeof documentos.$inferSelect) {
  const ids = new Set<string>();
  // hacia atrás
  let cur: string | null = d.documentoOrigenId;
  const anteriores: (typeof documentos.$inferSelect)[] = [];
  while (cur && !ids.has(cur)) {
    ids.add(cur);
    const [p] = await tx.select().from(documentos).where(eq(documentos.id, cur));
    if (!p) break;
    anteriores.unshift(p);
    cur = p.documentoOrigenId;
  }
  // por líneas (albaranes agrupados en factura, etc.)
  const ls = await lineasDe(tx, d.id);
  const origenL = ls.map((l) => l.lineaOrigenId).filter(Boolean) as string[];
  if (origenL.length) {
    const extra = await tx
      .selectDistinct({ doc: documentos })
      .from(documentoLineas)
      .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
      .where(inArray(documentoLineas.id, origenL));
    for (const e of extra) if (!ids.has(e.doc.id)) {
      ids.add(e.doc.id);
      anteriores.push(e.doc);
    }
  }
  // hacia delante
  const hijosDirectos = await tx.select().from(documentos).where(and(eq(documentos.documentoOrigenId, d.id), isNull(documentos.archivadoEn)));
  const hijosLinea = ls.length
    ? await tx
        .selectDistinct({ doc: documentos })
        .from(documentoLineas)
        .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
        .where(and(inArray(documentoLineas.lineaOrigenId, ls.map((l) => l.id)), isNull(documentos.archivadoEn)))
    : [];
  const posteriores = [...hijosDirectos];
  for (const h of hijosLinea) if (!posteriores.some((p) => p.id === h.doc.id)) posteriores.push(h.doc);
  const rect = await tx.select().from(documentos).where(eq(documentos.rectificaId, d.id));
  for (const r of rect) if (!posteriores.some((p) => p.id === r.id)) posteriores.push(r);
  const versiones = d.grupoId ? await tx.select({ id: documentos.id, codigo: documentos.codigo, version: documentos.version, estado: documentos.estado }).from(documentos).where(eq(documentos.grupoId, d.grupoId)).orderBy(desc(documentos.version)) : [];
  const map = (x: typeof documentos.$inferSelect) => ({ id: x.id, tipo: x.tipo, codigo: x.codigo, estado: x.estado, fecha: x.fecha, total: x.total });
  return { anteriores: anteriores.map(map), posteriores: posteriores.filter((p) => p.id !== d.id).map(map), versiones: versiones.length > 1 ? versiones : [] };
}

export async function pendientesPorLinea(tx: Tx, d: typeof documentos.$inferSelect) {
  const ls = (await lineasDe(tx, d.id)).filter((l) => l.tipoLinea === 'articulo');
  const tipos: Record<string, string[]> = {
    presupuesto: ['pedido', 'albaran', 'factura'],
    pedido: ['albaran'],
    albaran: ['factura'],
    pedido_compra: ['recepcion'],
    recepcion: ['factura_proveedor'],
  };
  const dest = tipos[d.tipo];
  if (!dest) return {};
  const ya = await cantidadesTrasladadas(tx, ls.map((l) => l.id), dest);
  return Object.fromEntries(ls.map((l) => [l.id, { hecho: ya.get(l.id) ?? 0, pendiente: Math.max(0, l.cantidad - (ya.get(l.id) ?? 0)) }]));
}

export { DESTINOS };
