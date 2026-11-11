import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { LineaStock, stkShared } from '@kite/shared';
type MovimientoTipoStk = stkShared.MovimientoTipo;
import type { DbOrTx, Tx } from '../../db/client';
import { articulos } from '../../db/schema/core';
import type { Ctx } from '../../core/context';
import { notify } from '../../core/notify';
import { stkAlmacenes, stkAvisos, stkKitComponentes, stkLotes, stkMovimientos, stkReservas, stkSaldos, stkSeries } from './schema';

const SISTEMA = '00000000-0000-0000-0000-000000000000';
export const usuarioDe = (ctx: Ctx) => (ctx.usuarioId === SISTEMA ? null : ctx.usuarioId);
export const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Almacén principal de la empresa. Si no hay ninguno se crea, para que un documento nunca falle por falta de almacén. */
export async function almacenDefecto(tx: DbOrTx, empresaId: string): Promise<string> {
  const [def] = await tx
    .select({ id: stkAlmacenes.id })
    .from(stkAlmacenes)
    .where(and(eq(stkAlmacenes.empresaId, empresaId), eq(stkAlmacenes.activo, true), isNull(stkAlmacenes.archivadoEn)))
    .orderBy(desc(stkAlmacenes.porDefecto), asc(sql`CASE WHEN ${stkAlmacenes.tipo} = 'almacen' THEN 0 ELSE 1 END`), asc(stkAlmacenes.creadoEn))
    .limit(1);
  if (def) return def.id;
  const [nuevo] = await tx.insert(stkAlmacenes).values({ empresaId, nombre: 'Almacén principal', tipo: 'almacen', porDefecto: true }).returning({ id: stkAlmacenes.id });
  return nuevo!.id;
}

/** Comprueba que el almacén es de la empresa; si no se indica devuelve el principal. */
export async function resolverAlmacen(tx: DbOrTx, empresaId: string, almacenId: string | null | undefined, cache?: Map<string, string>) {
  if (!almacenId) {
    const k = `__def`;
    if (cache?.has(k)) return cache.get(k)!;
    const id = await almacenDefecto(tx, empresaId);
    cache?.set(k, id);
    return id;
  }
  if (cache?.has(almacenId)) return cache.get(almacenId)!;
  const [a] = await tx.select({ id: stkAlmacenes.id }).from(stkAlmacenes).where(and(eq(stkAlmacenes.id, almacenId), eq(stkAlmacenes.empresaId, empresaId)));
  const id = a?.id ?? (await almacenDefecto(tx, empresaId));
  cache?.set(almacenId, id);
  return id;
}

export interface LineaExpandida extends LineaStock {
  /** Artículo vendido cuando la línea procede de un kit. */
  kitId?: string | null;
}

/**
 * Filtra las líneas que mueven stock (artículos con control de stock) y sustituye los kits por sus componentes.
 * Un kit sin componentes definidos se trata como un artículo normal.
 */
export async function expandir(tx: DbOrTx, lineas: LineaStock[]): Promise<LineaExpandida[]> {
  const ids = [...new Set(lineas.map((l) => l.articuloId).filter(Boolean))];
  if (!ids.length) return [];
  const arts = await tx.select({ id: articulos.id, tipo: articulos.tipo, controlaStock: articulos.controlaStock }).from(articulos).where(inArray(articulos.id, ids));
  const byId = new Map(arts.map((a) => [a.id, a]));
  const kitIds = arts.filter((a) => a.tipo === 'kit').map((a) => a.id);
  const comps = kitIds.length
    ? await tx
        .select({ kitId: stkKitComponentes.kitId, componenteId: stkKitComponentes.componenteId, cantidad: stkKitComponentes.cantidad, controlaStock: articulos.controlaStock, tipo: articulos.tipo })
        .from(stkKitComponentes)
        .innerJoin(articulos, eq(articulos.id, stkKitComponentes.componenteId))
        .where(inArray(stkKitComponentes.kitId, kitIds))
    : [];
  const out: LineaExpandida[] = [];
  for (const l of lineas) {
    const a = byId.get(l.articuloId);
    if (!a) continue;
    const cs = comps.filter((c) => c.kitId === a.id);
    if (a.tipo === 'kit' && cs.length) {
      for (const c of cs) {
        if (!c.controlaStock || c.tipo === 'servicio') continue;
        out.push({ ...l, articuloId: c.componenteId, cantidad: r4(l.cantidad * c.cantidad), lote: null, caducidad: null, series: null, coste: null, kitId: a.id });
      }
      continue;
    }
    if (!a.controlaStock || a.tipo === 'servicio') continue;
    out.push(l);
  }
  return out;
}

export interface MovInput {
  tipo: MovimientoTipoStk;
  articuloId: string;
  almacenId: string;
  cantidad: number; // con signo
  costeUnitario?: number | null;
  lote?: string | null;
  documentoId?: string | null;
  lineaId?: string | null;
  origenTipo?: string | null;
  origenId?: string | null;
  series?: string[] | null;
  motivo?: string | null;
  momento?: Date;
}

/** Inserta movimientos (el disparador actualiza saldos y PMP) y avisa si algún saldo queda negativo. */
export async function registrarMovimientos(tx: Tx, ctx: Ctx, movs: MovInput[]) {
  const validos = movs.filter((m) => m.cantidad && Math.abs(m.cantidad) > 0.00001);
  if (!validos.length) return [];
  const rows = await tx
    .insert(stkMovimientos)
    .values(
      validos.map((m) => ({
        empresaId: ctx.empresaId,
        tipo: m.tipo,
        articuloId: m.articuloId,
        almacenId: m.almacenId,
        lote: m.lote ?? '',
        cantidad: r4(m.cantidad),
        costeUnitario: m.costeUnitario ?? null,
        documentoId: m.documentoId ?? null,
        lineaId: m.lineaId ?? null,
        origenTipo: m.origenTipo ?? null,
        origenId: m.origenId ?? null,
        series: m.series?.length ? m.series : null,
        motivo: m.motivo ?? null,
        usuarioId: usuarioDe(ctx),
        personaId: ctx.personaId,
        ...(m.momento ? { momento: m.momento } : {}),
      })),
    )
    .returning();
  const negativos = rows.filter((r) => (r.saldo ?? 0) < -0.00001);
  if (negativos.length) await avisarNegativos(tx, ctx, negativos);
  return rows;
}

/** El stock negativo se permite (no se bloquea la entrega) pero se avisa al almacén una vez al día por artículo y almacén. */
async function avisarNegativos(tx: Tx, ctx: Ctx, rows: (typeof stkMovimientos.$inferSelect)[]) {
  const hoy = new Date().toISOString().slice(0, 10);
  const nuevos = await tx
    .insert(stkAvisos)
    .values(rows.map((r) => ({ empresaId: ctx.empresaId, articuloId: r.articuloId, almacenId: r.almacenId, tipo: 'negativo', fecha: hoy })))
    .onConflictDoNothing()
    .returning();
  if (!nuevos.length) return;
  const arts = await tx.select({ id: articulos.id, ref: articulos.referencia, nombre: articulos.nombre }).from(articulos).where(inArray(articulos.id, nuevos.map((n) => n.articuloId)));
  const lista = arts.map((a) => `${a.ref} ${a.nombre}`).join(', ');
  await notify(tx, ctx, {
    modulo: 'stk',
    tipo: 'stock_negativo',
    titulo: nuevos.length === 1 ? `Stock negativo: ${arts[0]?.ref ?? ''}` : `Stock negativo en ${nuevos.length} artículos`,
    cuerpo: `${lista}. Revisa las entradas pendientes o regulariza con un ajuste.`,
    enlace: '/stock?negativo=1',
    permiso: 'stk.gestionar',
    excluirActor: false,
  });
}

/** Saldo físico de un artículo en un almacén (y lote, si se indica). */
export async function saldoDe(tx: DbOrTx, articuloId: string, almacenId: string, lote?: string | null) {
  const [r] = await tx
    .select({ cantidad: sql<number>`coalesce(sum(${stkSaldos.cantidad}), 0)::float`, coste: sql<number>`coalesce(max(${stkSaldos.costeMedio}), 0)::float` })
    .from(stkSaldos)
    .where(and(eq(stkSaldos.articuloId, articuloId), eq(stkSaldos.almacenId, almacenId), lote !== undefined && lote !== null ? eq(stkSaldos.lote, lote) : undefined));
  return { cantidad: r?.cantidad ?? 0, costeMedio: r?.coste ?? 0 };
}

/** Físico, reservado y disponible por artículo (opcionalmente en un almacén). */
export async function disponibilidad(tx: DbOrTx, empresaId: string, articuloIds: string[], almacenId?: string | null) {
  const out: Record<string, { fisico: number; reservado: number; disponible: number }> = {};
  for (const id of articuloIds) out[id] = { fisico: 0, reservado: 0, disponible: 0 };
  if (!articuloIds.length) return out;
  const rows = await tx
    .select({
      articuloId: stkSaldos.articuloId,
      fisico: sql<number>`coalesce(sum(${stkSaldos.cantidad}), 0)::float`,
      reservado: sql<number>`coalesce(sum(${stkSaldos.reservado}), 0)::float`,
    })
    .from(stkSaldos)
    .where(and(eq(stkSaldos.empresaId, empresaId), inArray(stkSaldos.articuloId, articuloIds), almacenId ? eq(stkSaldos.almacenId, almacenId) : undefined))
    .groupBy(stkSaldos.articuloId);
  for (const r of rows) out[r.articuloId] = { fisico: r4(r.fisico), reservado: r4(r.reservado), disponible: r4(r.fisico - r.reservado) };
  return out;
}

/* ───────────── Reacciones a documentos ───────────── */

export async function reservar(tx: Tx, ctx: Ctx, documentoId: string, lineas: LineaStock[]) {
  const exp = await expandir(tx, lineas);
  if (!exp.length) return;
  const cache = new Map<string, string>();
  // una reserva por línea y artículo: si ya existe se sustituye (re-confirmación)
  const agrupadas = new Map<string, { lineaId: string; articuloId: string; almacenId: string; cantidad: number }>();
  for (const l of exp) {
    if (!l.lineaId || l.cantidad <= 0) continue;
    const almacenId = await resolverAlmacen(tx, ctx.empresaId, l.almacenId, cache);
    const k = `${l.lineaId}:${l.articuloId}`;
    const prev = agrupadas.get(k);
    agrupadas.set(k, { lineaId: l.lineaId, articuloId: l.articuloId, almacenId, cantidad: r4((prev?.cantidad ?? 0) + l.cantidad) });
  }
  if (!agrupadas.size) return;
  await tx.delete(stkReservas).where(and(eq(stkReservas.documentoId, documentoId), inArray(stkReservas.lineaId, [...new Set([...agrupadas.values()].map((a) => a.lineaId))])));
  await tx.insert(stkReservas).values([...agrupadas.values()].map((a) => ({ empresaId: ctx.empresaId, documentoId, ...a })));
}

export async function liberar(tx: Tx, documentoId: string) {
  await tx.delete(stkReservas).where(eq(stkReservas.documentoId, documentoId));
}

/** Reduce las reservas de las líneas de pedido de las que procede lo entregado. */
export async function consumirReservas(tx: Tx, consumos: { lineaId: string; articuloId: string; cantidad: number }[]) {
  for (const c of consumos) {
    const [r] = await tx.select().from(stkReservas).where(and(eq(stkReservas.lineaId, c.lineaId), eq(stkReservas.articuloId, c.articuloId)));
    if (!r) continue;
    const resto = r4(r.cantidad - c.cantidad);
    if (resto <= 0.00001) await tx.delete(stkReservas).where(eq(stkReservas.id, r.id));
    else await tx.update(stkReservas).set({ cantidad: resto }).where(eq(stkReservas.id, r.id));
  }
}

/** Alta de lotes y números de serie recibidos. */
export async function registrarLoteYSeries(
  tx: Tx,
  ctx: Ctx,
  l: { articuloId: string; lote?: string | null; caducidad?: string | null; series?: string[] | null; almacenId: string },
  extra: { proveedorId?: string | null; documentoId?: string | null; fecha: string },
) {
  if (l.lote) {
    await tx
      .insert(stkLotes)
      .values({ empresaId: ctx.empresaId, articuloId: l.articuloId, lote: l.lote, caducidad: l.caducidad || null, proveedorId: extra.proveedorId ?? null, documentoId: extra.documentoId ?? null })
      .onConflictDoUpdate({ target: [stkLotes.articuloId, stkLotes.lote], set: { caducidad: sql`coalesce(excluded.caducidad, ${stkLotes.caducidad})` } });
  }
  for (const s of l.series ?? []) {
    const numero = s.trim();
    if (!numero) continue;
    await tx
      .insert(stkSeries)
      .values({ empresaId: ctx.empresaId, articuloId: l.articuloId, numeroSerie: numero, estado: 'en_stock', almacenId: l.almacenId, lote: l.lote || null, documentoEntradaId: extra.documentoId ?? null, fechaEntrada: extra.fecha })
      .onConflictDoUpdate({ target: [stkSeries.articuloId, stkSeries.numeroSerie], set: { estado: 'en_stock', almacenId: l.almacenId, documentoEntradaId: extra.documentoId ?? null, fechaEntrada: extra.fecha, terceroId: null } });
  }
}

export async function marcarSeriesSalida(tx: Tx, articuloId: string, series: string[] | null | undefined, datos: { terceroId?: string | null; documentoId?: string | null; fecha: string; estado: string }) {
  const nums = (series ?? []).map((s) => s.trim()).filter(Boolean);
  if (!nums.length) return;
  await tx
    .update(stkSeries)
    .set({ estado: datos.estado, terceroId: datos.terceroId ?? null, documentoSalidaId: datos.documentoId ?? null, fechaSalida: datos.fecha })
    .where(and(eq(stkSeries.articuloId, articuloId), inArray(stkSeries.numeroSerie, nums)));
}

/** Artículos por debajo del mínimo (suma de todos los almacenes de tipo almacén y furgoneta). */
export async function bajoMinimo(tx: DbOrTx, empresaId: string, limit = 500) {
  const rows = await tx.execute<{ articulo_id: string; referencia: string; nombre: string; stock_min: number; fisico: number }>(sql`
    SELECT c.articulo_id, a.referencia, a.nombre, c.stock_min::float AS stock_min, coalesce(sum(s.cantidad), 0)::float AS fisico
      FROM stk_articulo_config c
      JOIN articulos a ON a.id = c.articulo_id
      LEFT JOIN stk_saldos s ON s.articulo_id = c.articulo_id
     WHERE c.empresa_id = ${empresaId} AND c.stock_min IS NOT NULL AND c.stock_min > 0 AND a.archivado_en IS NULL AND a.activo
     GROUP BY c.articulo_id, a.referencia, a.nombre, c.stock_min
    HAVING coalesce(sum(s.cantidad), 0) < c.stock_min
     ORDER BY (coalesce(sum(s.cantidad), 0) / c.stock_min) ASC
     LIMIT ${limit}`);
  return rows.map((r) => ({ articuloId: r.articulo_id, referencia: r.referencia, nombre: r.nombre, stockMin: r.stock_min, fisico: r.fisico }));
}
