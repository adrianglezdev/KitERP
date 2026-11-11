import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { optionLabel, stkShared, toZod } from '@kite/shared';
import { db, type DbOrTx, type Tx } from '../../db/client';
import { articulos, personas, terceros, usuarios } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { nextCode } from '../../core/numbering';
import { can, canOnOwner, guard } from '../../core/permissions';
import { stkAlmacenes, stkArticuloConfig, stkInventarioLineas, stkInventarios, stkKitComponentes, stkLotes, stkMovimientos, stkReservas, stkSaldos, stkSeries, stkTraspasos, stkUbicaciones } from './schema';
import { bajoMinimo, disponibilidad, r4, registrarMovimientos, saldoDe, usuarioDe } from './service';

const { almacenResource, ubicacionResource, articuloConfigResource, MOVIMIENTO_TIPOS } = stkShared;
const hoy = () => new Date().toISOString().slice(0, 10);
const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

/** ¿Puede registrar movimientos en este almacén? Con alcance "propio" solo en su furgoneta (o su equipo con "equipo"). */
export async function puedeMoverEn(ctx: Ctx, almacen: { personaId: string | null }) {
  const s = ctx.perms.get('stk.mover');
  if (!s) return false;
  if (s === 'todo') return true;
  return canOnOwner(ctx, 'stk.mover', almacen.personaId);
}

async function cargarAlmacen(tx: DbOrTx, ctx: Ctx, id: string) {
  const [a] = await tx.select().from(stkAlmacenes).where(and(eq(stkAlmacenes.id, id), eq(stkAlmacenes.empresaId, ctx.empresaId)));
  if (!a) throw notFound('Almacén no encontrado');
  return a;
}

async function exigirMoverEn(tx: DbOrTx, ctx: Ctx, almacenId: string) {
  const a = await cargarAlmacen(tx, ctx, almacenId);
  if (!(await puedeMoverEn(ctx, a))) throw forbidden(`No puedes mover stock de ${a.nombre}: solo de tu furgoneta`);
  if (!a.activo || a.archivadoEn) throw conflict(`${a.nombre} no está activo`);
  return a;
}

async function articulosValidos(tx: DbOrTx, ctx: Ctx, ids: string[]) {
  if (!ids.length) return new Map<string, typeof articulos.$inferSelect>();
  const rows = await tx.select().from(articulos).where(and(eq(articulos.empresaId, ctx.empresaId), inArray(articulos.id, ids)));
  if (rows.length !== new Set(ids).size) throw badRequest('Algún artículo no existe');
  return new Map(rows.map((r) => [r.id, r]));
}

async function xlsx(nombre: string, columnas: { header: string; key: string; width?: number; numFmt?: string }[], filas: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombre.slice(0, 30));
  ws.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.numFmt ? { numFmt: c.numFmt } : undefined }));
  ws.getRow(1).font = { bold: true };
  for (const f of filas) ws.addRow(f);
  const buf = await wb.xlsx.writeBuffer();
  return { __file: true, buffer: Buffer.from(buf as ArrayBuffer), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `${nombre}.xlsx` };
}

const lineaMovSchema = z.object({
  articuloId: z.string().uuid(),
  cantidad: z.coerce.number().optional(),
  nuevaCantidad: z.coerce.number().min(0).optional(),
  lote: z.string().trim().max(60).nullish(),
  coste: z.coerce.number().min(0).nullish(),
  series: z.array(z.string()).nullish(),
});

export async function stkRoutes(app: FastifyInstance) {
  /* ── Almacenes y ubicaciones ── */
  registerCrud(app, {
    path: '/almacenes',
    resource: almacenResource,
    table: stkAlmacenes,
    entity: 'stk_almacen',
    perms: { ver: ['stk.ver', 'stk.mover'], crear: 'stk.gestionar' },
    beforeSave: async (tx, _ctx, data) => {
      if (data.tipo === 'furgoneta' && data.personaId === undefined) return data;
      return data;
    },
    afterSave: async (tx, ctx, row) => {
      if (row.porDefecto) await tx.update(stkAlmacenes).set({ porDefecto: false }).where(and(eq(stkAlmacenes.empresaId, ctx.empresaId), ne(stkAlmacenes.id, row.id)));
    },
    beforeDelete: async (tx, _ctx, row) => {
      const [s] = await tx.select({ n: sql<number>`count(*)::int` }).from(stkSaldos).where(and(eq(stkSaldos.almacenId, row.id), sql`${stkSaldos.cantidad} <> 0`));
      if ((s?.n ?? 0) > 0) throw conflict('El almacén tiene stock: traspásalo antes de archivarlo');
    },
  });

  registerCrud(app, {
    path: '/ubicaciones',
    resource: ubicacionResource,
    table: stkUbicaciones,
    entity: 'stk_ubicacion',
    perms: { ver: 'stk.ver', crear: 'stk.gestionar' },
    hardDelete: true,
  });

  /* ── Stock por artículo ── */
  app.get('/stock', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 50));
    const almacen = q.almacenId ? sql`AND almacen_id = ${q.almacenId}` : sql``;
    const conds: SQL[] = [sql`a.empresa_id = ${ctx.empresaId}`, sql`a.archivado_en IS NULL`, sql`a.controla_stock`, sql`a.tipo <> 'servicio'`];
    if (q.q) {
      const like = `%${q.q.trim().replace(/[%_]/g, '')}%`;
      conds.push(sql`(a.referencia ILIKE ${like} OR a.nombre ILIKE ${like} OR coalesce(a.ean,'') ILIKE ${like} OR coalesce(a.marca,'') ILIKE ${like})`);
    }
    if (q.familiaId) conds.push(sql`a.familia_id = ${q.familiaId}`);
    if (q.estado === 'bajo_minimo') conds.push(sql`c.stock_min > 0 AND coalesce(s.fisico, 0) < c.stock_min`);
    if (q.estado === 'negativo') conds.push(sql`coalesce(s.fisico, 0) < 0`);
    if (q.estado === 'con_stock') conds.push(sql`coalesce(s.fisico, 0) <> 0`);
    if (q.estado === 'reservado') conds.push(sql`coalesce(s.reservado, 0) > 0`);
    const orden: Record<string, SQL> = {
      referencia: sql`a.referencia`,
      nombre: sql`a.nombre`,
      fisico: sql`coalesce(s.fisico, 0)`,
      disponible: sql`coalesce(s.fisico, 0) - coalesce(s.reservado, 0)`,
      valor: sql`coalesce(s.valor, 0)`,
    };
    const ord = orden[q.sort ?? 'referencia'] ?? orden.referencia!;
    const dir = q.dir === 'desc' ? sql`DESC` : sql`ASC`;
    const exportar = q.format === 'xlsx';
    const rows = await db.execute<any>(sql`
      SELECT a.id, a.referencia, a.nombre, a.unidad, a.familia_id, a.ean,
             coalesce(s.fisico, 0)::float AS fisico, coalesce(s.reservado, 0)::float AS reservado, coalesce(s.valor, 0)::float AS valor,
             c.stock_min::float AS stock_min, c.punto_pedido::float AS punto_pedido,
             count(*) OVER()::int AS total_filas
        FROM articulos a
        LEFT JOIN (
          SELECT articulo_id, sum(cantidad) AS fisico, sum(reservado) AS reservado, sum(cantidad * coste_medio) AS valor
            FROM stk_saldos WHERE empresa_id = ${ctx.empresaId} ${almacen} GROUP BY articulo_id
        ) s ON s.articulo_id = a.id
        LEFT JOIN stk_articulo_config c ON c.articulo_id = a.id
       WHERE ${sql.join(conds, sql` AND `)}
       ORDER BY ${ord} ${dir}, a.referencia
       LIMIT ${exportar ? 50000 : pageSize} OFFSET ${exportar ? 0 : (page - 1) * pageSize}`);
    const items: stkShared.StockFila[] = rows.map((r: any) => ({
      articuloId: r.id,
      referencia: r.referencia,
      nombre: r.nombre,
      unidad: r.unidad,
      familiaId: r.familia_id,
      ean: r.ean,
      fisico: r4(r.fisico),
      reservado: r4(r.reservado),
      disponible: r4(r.fisico - r.reservado),
      valor: Math.round(r.valor * 100) / 100,
      costeMedio: r.fisico > 0 ? r4(r.valor / r.fisico) : 0,
      stockMin: r.stock_min,
      puntoPedido: r.punto_pedido,
      bajoMinimo: !!r.stock_min && r.fisico < r.stock_min,
    }));
    if (exportar)
      return xlsx(
        'stock',
        [
          { header: 'Referencia', key: 'referencia', width: 18 },
          { header: 'Artículo', key: 'nombre', width: 42 },
          { header: 'Unidad', key: 'unidad', width: 8 },
          { header: 'Físico', key: 'fisico', numFmt: '#,##0.###' },
          { header: 'Reservado', key: 'reservado', numFmt: '#,##0.###' },
          { header: 'Disponible', key: 'disponible', numFmt: '#,##0.###' },
          { header: 'Stock mínimo', key: 'stockMin', numFmt: '#,##0.###' },
          { header: 'Coste medio', key: 'costeMedio', numFmt: '#,##0.0000 €' },
          { header: 'Valor', key: 'valor', numFmt: '#,##0.00 €' },
        ],
        items as any,
      );
    const [tot] = await db.execute<{ valor: number; bajo: number; negativos: number }>(sql`
      SELECT coalesce(sum(s.cantidad * s.coste_medio), 0)::float AS valor,
             (SELECT count(*)::int FROM stk_articulo_config c WHERE c.empresa_id = ${ctx.empresaId} AND c.stock_min > 0
                AND coalesce((SELECT sum(cantidad) FROM stk_saldos x WHERE x.articulo_id = c.articulo_id ${almacen}), 0) < c.stock_min) AS bajo,
             (SELECT count(DISTINCT articulo_id)::int FROM stk_saldos x WHERE x.empresa_id = ${ctx.empresaId} AND x.cantidad < 0 ${almacen}) AS negativos
        FROM stk_saldos s WHERE s.empresa_id = ${ctx.empresaId} ${almacen}`);
    return { items, total: rows[0]?.total_filas ?? 0, page, pageSize, resumen: { valor: Math.round((tot?.valor ?? 0) * 100) / 100, bajoMinimo: tot?.bajo ?? 0, negativos: tot?.negativos ?? 0 } };
  });

  /** Ficha de stock de un artículo: saldos por almacén y lote, reservas, últimos movimientos y configuración. */
  app.get('/stock/:articuloId', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const ctx = req.ctx;
    const { articuloId } = req.params as { articuloId: string };
    const [art] = await db.select().from(articulos).where(and(eq(articulos.id, articuloId), eq(articulos.empresaId, ctx.empresaId)));
    if (!art) throw notFound('Artículo no encontrado');
    const [saldos, reservas, movs, [config], kit, lotes, series] = await Promise.all([
      db
        .select({ almacenId: stkSaldos.almacenId, almacen: stkAlmacenes.nombre, tipo: stkAlmacenes.tipo, lote: stkSaldos.lote, cantidad: stkSaldos.cantidad, reservado: stkSaldos.reservado, costeMedio: stkSaldos.costeMedio, caducidad: stkLotes.caducidad })
        .from(stkSaldos)
        .innerJoin(stkAlmacenes, eq(stkAlmacenes.id, stkSaldos.almacenId))
        .leftJoin(stkLotes, and(eq(stkLotes.articuloId, stkSaldos.articuloId), eq(stkLotes.lote, stkSaldos.lote)))
        .where(and(eq(stkSaldos.articuloId, articuloId), or(sql`${stkSaldos.cantidad} <> 0`, sql`${stkSaldos.reservado} <> 0`)))
        .orderBy(asc(stkAlmacenes.nombre), asc(stkSaldos.lote)),
      db
        .select({ id: stkReservas.id, documentoId: stkReservas.documentoId, codigo: documentos.codigo, cantidad: stkReservas.cantidad, almacen: stkAlmacenes.nombre, tercero: terceros.nombre, fecha: documentos.fechaEntrega })
        .from(stkReservas)
        .innerJoin(stkAlmacenes, eq(stkAlmacenes.id, stkReservas.almacenId))
        .leftJoin(documentos, eq(documentos.id, stkReservas.documentoId))
        .leftJoin(terceros, eq(terceros.id, documentos.terceroId))
        .where(eq(stkReservas.articuloId, articuloId))
        .orderBy(asc(stkReservas.creadoEn)),
      movimientosQuery(ctx, { articuloId }, 1, 30),
      db.select().from(stkArticuloConfig).where(eq(stkArticuloConfig.articuloId, articuloId)),
      db
        .select({ componenteId: stkKitComponentes.componenteId, cantidad: stkKitComponentes.cantidad, referencia: articulos.referencia, nombre: articulos.nombre })
        .from(stkKitComponentes)
        .innerJoin(articulos, eq(articulos.id, stkKitComponentes.componenteId))
        .where(eq(stkKitComponentes.kitId, articuloId)),
      db.select().from(stkLotes).where(eq(stkLotes.articuloId, articuloId)).orderBy(sql`${stkLotes.caducidad} NULLS LAST`),
      db
        .select({ id: stkSeries.id, numeroSerie: stkSeries.numeroSerie, estado: stkSeries.estado, almacen: stkAlmacenes.nombre, tercero: terceros.nombre, fechaEntrada: stkSeries.fechaEntrada, fechaSalida: stkSeries.fechaSalida })
        .from(stkSeries)
        .leftJoin(stkAlmacenes, eq(stkAlmacenes.id, stkSeries.almacenId))
        .leftJoin(terceros, eq(terceros.id, stkSeries.terceroId))
        .where(eq(stkSeries.articuloId, articuloId))
        .orderBy(desc(stkSeries.actualizadoEn))
        .limit(200),
    ]);
    const fisico = saldos.reduce((a, s) => a + s.cantidad, 0);
    const reservado = saldos.reduce((a, s) => a + s.reservado, 0);
    const valor = saldos.reduce((a, s) => a + s.cantidad * s.costeMedio, 0);
    return {
      articulo: { id: art.id, referencia: art.referencia, nombre: art.nombre, tipo: art.tipo, unidad: art.unidad, ean: art.ean, coste: art.coste, controlaStock: art.controlaStock },
      totales: { fisico: r4(fisico), reservado: r4(reservado), disponible: r4(fisico - reservado), valor: Math.round(valor * 100) / 100, costeMedio: fisico > 0 ? r4(valor / fisico) : 0 },
      saldos,
      reservas,
      movimientos: movs.items,
      config: config ?? null,
      kit,
      lotes,
      series,
      puedeGestionar: can(ctx, 'stk.gestionar'),
    };
  });

  /** Disponible (físico − reservado) para una lista de artículos: GET /api/stk/disponible?articuloIds=a,b[&almacenId=] */
  app.get('/disponible', async (req) => {
    const ctx = req.ctx;
    if (!['stk.ver', 'stk.mover', 'pre.editar', 'ped.editar', 'ped.ver', 'cpr.editar', 'sat.ver', 'catalogo.ver'].some((p) => can(ctx, p))) throw forbidden();
    const q = req.query as { articuloIds?: string; almacenId?: string };
    const ids = (q.articuloIds ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
    return disponibilidad(db, ctx.empresaId, ids, q.almacenId || null);
  });

  /** Busca un artículo por código de barras o referencia exacta (lector o teclado en el móvil). */
  app.get('/buscar-codigo', { preHandler: guard(['stk.ver', 'stk.mover', 'cpr.recibir', 'catalogo.ver']) }, async (req) => {
    const codigo = String((req.query as { codigo?: string }).codigo ?? '').trim();
    if (!codigo) throw badRequest('Indica un código');
    const [a] = await db
      .select({ id: articulos.id, referencia: articulos.referencia, nombre: articulos.nombre, ean: articulos.ean, unidad: articulos.unidad })
      .from(articulos)
      .where(and(eq(articulos.empresaId, req.ctx.empresaId), isNull(articulos.archivadoEn), or(eq(articulos.ean, codigo), sql`lower(${articulos.referencia}) = lower(${codigo})`)))
      .limit(1);
    if (!a) throw notFound(`No hay ningún artículo con el código ${codigo}`);
    return a;
  });

  /* ── Movimientos ── */
  app.get('/movimientos', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));
    if (q.format === 'xlsx') {
      const r = await movimientosQuery(req.ctx, q, 1, 50000);
      return xlsx(
        'movimientos',
        [
          { header: 'Fecha', key: 'fecha', width: 18 },
          { header: 'Tipo', key: 'tipoLabel', width: 26 },
          { header: 'Referencia', key: 'referencia', width: 18 },
          { header: 'Artículo', key: 'articulo', width: 40 },
          { header: 'Almacén', key: 'almacen', width: 22 },
          { header: 'Lote', key: 'lote', width: 14 },
          { header: 'Cantidad', key: 'cantidad', numFmt: '#,##0.###' },
          { header: 'Coste unitario', key: 'costeUnitario', numFmt: '#,##0.0000 €' },
          { header: 'Saldo', key: 'saldo', numFmt: '#,##0.###' },
          { header: 'Documento', key: 'documento', width: 16 },
          { header: 'Usuario', key: 'persona', width: 22 },
          { header: 'Motivo', key: 'motivo', width: 30 },
        ],
        r.items.map((m) => ({ ...m, fecha: new Date(m.momento).toLocaleString('es-ES'), tipoLabel: optionLabel(MOVIMIENTO_TIPOS, m.tipo)?.label ?? m.tipo })),
      );
    }
    return movimientosQuery(req.ctx, q, page, pageSize);
  });

  /* ── Ajustes ── */
  app.post('/ajustes', { preHandler: guard('stk.mover') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(z.object({ almacenId: z.string().uuid(), motivo: z.string().trim().min(3, 'Indica el motivo del ajuste').max(300), lineas: z.array(lineaMovSchema).min(1).max(500) }), req.body);
    return db.transaction(async (tx) => {
      const alm = await exigirMoverEn(tx, ctx, body.almacenId);
      const arts = await articulosValidos(tx, ctx, body.lineas.map((l) => l.articuloId));
      const movs = [];
      for (const l of body.lineas) {
        const a = arts.get(l.articuloId)!;
        if (!a.controlaStock || a.tipo === 'servicio') throw badRequest(`${a.referencia} no controla stock`);
        let delta = l.cantidad ?? 0;
        if (l.nuevaCantidad !== undefined) delta = l.nuevaCantidad - (await saldoDe(tx, a.id, alm.id, l.lote ?? '')).cantidad;
        if (Math.abs(delta) < 0.00001) continue;
        movs.push({ tipo: 'ajuste' as const, articuloId: a.id, almacenId: alm.id, cantidad: delta, costeUnitario: delta > 0 ? (l.coste ?? null) : null, lote: l.lote ?? '', origenTipo: 'ajuste', motivo: body.motivo, series: l.series });
      }
      if (!movs.length) throw badRequest('No hay diferencias que ajustar');
      const rows = await registrarMovimientos(tx, ctx, movs);
      await audit(tx, ctx, 'ajuste', 'stk_almacen', alm.id, { motivo: body.motivo, lineas: rows.map((r) => ({ articuloId: r.articuloId, cantidad: r.cantidad })) });
      return { movimientos: rows.length };
    });
  });

  /* ── Traspasos (almacén ↔ furgonetas) ── */
  app.get('/traspasos', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Number(q.pageSize) || 25);
    const origen = sql`(SELECT nombre FROM stk_almacenes WHERE id = ${stkTraspasos.origenId})`;
    const destino = sql`(SELECT nombre FROM stk_almacenes WHERE id = ${stkTraspasos.destinoId})`;
    const conds = [eq(stkTraspasos.empresaId, ctx.empresaId), q.almacenId ? or(eq(stkTraspasos.origenId, q.almacenId), eq(stkTraspasos.destinoId, q.almacenId)) : undefined];
    const [items, [n]] = await Promise.all([
      db
        .select({ id: stkTraspasos.id, codigo: stkTraspasos.codigo, fecha: stkTraspasos.fecha, origenId: stkTraspasos.origenId, destinoId: stkTraspasos.destinoId, origen: sql<string>`${origen}`, destino: sql<string>`${destino}`, lineas: stkTraspasos.lineas, notas: stkTraspasos.notas, persona: nombrePersona, creadoEn: stkTraspasos.creadoEn })
        .from(stkTraspasos)
        .leftJoin(personas, eq(personas.id, stkTraspasos.personaId))
        .where(and(...conds))
        .orderBy(desc(stkTraspasos.creadoEn))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(stkTraspasos).where(and(...conds)),
    ]);
    return { items, total: n?.n ?? 0, page, pageSize };
  });

  app.get('/traspasos/:id', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const { id } = req.params as { id: string };
    const [t] = await db.select().from(stkTraspasos).where(and(eq(stkTraspasos.id, id), eq(stkTraspasos.empresaId, req.ctx.empresaId)));
    if (!t) throw notFound();
    const movs = await movimientosQuery(req.ctx, { origenId: id, tipo: 'traspaso_salida' }, 1, 500);
    return { ...t, lineas: movs.items.map((m) => ({ ...m, cantidad: -m.cantidad })) };
  });

  app.post('/traspasos', { preHandler: guard('stk.mover') }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(
      z.object({
        origenId: z.string().uuid('Elige el almacén de origen'),
        destinoId: z.string().uuid('Elige el almacén de destino'),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notas: z.string().max(500).nullish(),
        lineas: z.array(z.object({ articuloId: z.string().uuid(), cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero'), lote: z.string().nullish(), series: z.array(z.string()).nullish() })).min(1, 'Añade al menos un artículo').max(500),
      }),
      req.body,
    );
    if (body.origenId === body.destinoId) throw badRequest('El origen y el destino deben ser distintos');
    const r = await db.transaction(async (tx) => traspasar(tx, ctx, body));
    reply.code(201);
    return r;
  });

  /* ── Inventarios ── */
  app.get('/inventarios', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const rows = await db
      .select({
        id: stkInventarios.id,
        codigo: stkInventarios.codigo,
        fecha: stkInventarios.fecha,
        tipo: stkInventarios.tipo,
        estado: stkInventarios.estado,
        almacenId: stkInventarios.almacenId,
        almacen: stkAlmacenes.nombre,
        notas: stkInventarios.notas,
        lineas: sql<number>`(SELECT count(*)::int FROM stk_inventario_lineas l WHERE l.inventario_id = ${stkInventarios.id})`,
        contadas: sql<number>`(SELECT count(*)::int FROM stk_inventario_lineas l WHERE l.inventario_id = ${stkInventarios.id} AND l.contado IS NOT NULL)`,
        confirmadoEn: stkInventarios.confirmadoEn,
      })
      .from(stkInventarios)
      .innerJoin(stkAlmacenes, eq(stkAlmacenes.id, stkInventarios.almacenId))
      .where(and(eq(stkInventarios.empresaId, ctx.empresaId), q.estado ? eq(stkInventarios.estado, q.estado) : undefined))
      .orderBy(desc(stkInventarios.creadoEn))
      .limit(100);
    return rows;
  });

  app.post('/inventarios', { preHandler: guard('stk.mover') }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(
      z.object({
        almacenId: z.string().uuid('Elige el almacén'),
        tipo: z.enum(['total', 'ciclico']).default('total'),
        familiaId: z.string().uuid().nullish(),
        articuloIds: z.array(z.string().uuid()).max(2000).nullish(),
        limite: z.coerce.number().int().min(1).max(500).default(20),
        notas: z.string().max(500).nullish(),
      }),
      req.body,
    );
    const r = await db.transaction(async (tx) => {
      const alm = await exigirMoverEn(tx, ctx, body.almacenId);
      const [abierto] = await tx.select({ codigo: stkInventarios.codigo }).from(stkInventarios).where(and(eq(stkInventarios.almacenId, alm.id), eq(stkInventarios.estado, 'abierto')));
      if (abierto && body.tipo === 'total') throw conflict(`Ya hay un recuento abierto en ${alm.nombre} (${abierto.codigo}). Confírmalo o cancélalo primero.`);
      const codigo = await nextCode(tx, ctx.empresaId, 'stk_inventario', 'INV');
      const [inv] = await tx.insert(stkInventarios).values({ empresaId: ctx.empresaId, codigo, almacenId: alm.id, tipo: body.tipo, fecha: hoy(), notas: body.notas ?? null, creadoPor: usuarioDe(ctx) }).returning();
      // artículos a contar con su saldo teórico por lote
      let filtro = sql`TRUE`;
      if (body.articuloIds?.length) filtro = sql`a.id IN (${sql.join(body.articuloIds.map((i) => sql`${i}`), sql`, `)})`;
      else if (body.familiaId) filtro = sql`a.familia_id = ${body.familiaId}`;
      const ciclico = body.tipo === 'ciclico' && !body.articuloIds?.length;
      const filas = await tx.execute<{ articulo_id: string; lote: string; teorico: number }>(sql`
        WITH arts AS (
          SELECT a.id FROM articulos a
            LEFT JOIN stk_articulo_config c ON c.articulo_id = a.id
           WHERE a.empresa_id = ${ctx.empresaId} AND a.archivado_en IS NULL AND a.activo AND a.controla_stock AND a.tipo <> 'servicio' AND ${filtro}
             ${ciclico ? sql`AND EXISTS (SELECT 1 FROM stk_saldos s WHERE s.articulo_id = a.id AND s.almacen_id = ${alm.id} AND s.cantidad <> 0)` : sql``}
           ORDER BY ${ciclico ? sql`c.ultimo_recuento NULLS FIRST, a.referencia` : sql`a.referencia`}
           ${ciclico ? sql`LIMIT ${body.limite}` : sql``}
        )
        SELECT arts.id AS articulo_id, coalesce(s.lote, '') AS lote, coalesce(s.cantidad, 0)::float AS teorico
          FROM arts LEFT JOIN stk_saldos s ON s.articulo_id = arts.id AND s.almacen_id = ${alm.id} AND (s.cantidad <> 0 OR s.lote = '')`);
      if (!filas.length) throw badRequest('No hay artículos que contar con ese filtro');
      const vistos = new Set<string>();
      const values = [];
      for (const f of filas) {
        const k = `${f.articulo_id}:${f.lote}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        values.push({ inventarioId: inv!.id, articuloId: f.articulo_id, lote: f.lote, teorico: f.teorico });
      }
      for (let i = 0; i < values.length; i += 1000) await tx.insert(stkInventarioLineas).values(values.slice(i, i + 1000));
      await audit(tx, ctx, 'crear', 'stk_inventario', inv!.id, { codigo, almacen: alm.nombre, lineas: values.length });
      return { id: inv!.id, codigo, lineas: values.length };
    });
    reply.code(201);
    return r;
  });

  app.get('/inventarios/:id', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [inv] = await db
      .select({ inv: stkInventarios, almacen: stkAlmacenes.nombre, almacenPersonaId: stkAlmacenes.personaId })
      .from(stkInventarios)
      .innerJoin(stkAlmacenes, eq(stkAlmacenes.id, stkInventarios.almacenId))
      .where(and(eq(stkInventarios.id, id), eq(stkInventarios.empresaId, ctx.empresaId)));
    if (!inv) throw notFound('Recuento no encontrado');
    const lineas = await db
      .select({ id: stkInventarioLineas.id, articuloId: stkInventarioLineas.articuloId, referencia: articulos.referencia, nombre: articulos.nombre, ean: articulos.ean, unidad: articulos.unidad, lote: stkInventarioLineas.lote, teorico: stkInventarioLineas.teorico, contado: stkInventarioLineas.contado, diferencia: stkInventarioLineas.diferencia, contadoEn: stkInventarioLineas.contadoEn })
      .from(stkInventarioLineas)
      .innerJoin(articulos, eq(articulos.id, stkInventarioLineas.articuloId))
      .where(eq(stkInventarioLineas.inventarioId, id))
      .orderBy(asc(articulos.referencia), asc(stkInventarioLineas.lote));
    return { ...inv.inv, almacen: inv.almacen, lineas, puedeContar: inv.inv.estado === 'abierto' && (await puedeMoverEn(ctx, { personaId: inv.almacenPersonaId })) };
  });

  app.post('/inventarios/:id/contar', { preHandler: guard('stk.mover') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({ lineaId: z.string().uuid().nullish(), articuloId: z.string().uuid().nullish(), codigo: z.string().trim().nullish(), lote: z.string().nullish(), cantidad: z.coerce.number().min(0, 'La cantidad no puede ser negativa'), modo: z.enum(['fijar', 'sumar']).default('fijar') }),
      req.body,
    );
    return db.transaction(async (tx) => {
      const [inv] = await tx.select().from(stkInventarios).where(and(eq(stkInventarios.id, id), eq(stkInventarios.empresaId, ctx.empresaId))).for('update');
      if (!inv) throw notFound('Recuento no encontrado');
      if (inv.estado !== 'abierto') throw conflict('Este recuento ya está cerrado');
      await exigirMoverEn(tx, ctx, inv.almacenId);
      let linea: typeof stkInventarioLineas.$inferSelect | undefined;
      if (body.lineaId) [linea] = await tx.select().from(stkInventarioLineas).where(and(eq(stkInventarioLineas.id, body.lineaId), eq(stkInventarioLineas.inventarioId, id)));
      else {
        let articuloId = body.articuloId ?? null;
        if (!articuloId && body.codigo) {
          const [a] = await tx.select({ id: articulos.id }).from(articulos).where(and(eq(articulos.empresaId, ctx.empresaId), or(eq(articulos.ean, body.codigo), sql`lower(${articulos.referencia}) = lower(${body.codigo})`))).limit(1);
          if (!a) throw notFound(`No hay ningún artículo con el código ${body.codigo}`);
          articuloId = a.id;
        }
        if (!articuloId) throw badRequest('Indica el artículo');
        const lote = body.lote ?? '';
        [linea] = await tx.select().from(stkInventarioLineas).where(and(eq(stkInventarioLineas.inventarioId, id), eq(stkInventarioLineas.articuloId, articuloId), eq(stkInventarioLineas.lote, lote)));
        if (!linea) {
          // artículo encontrado en la estantería que no estaba en la hoja
          await articulosValidos(tx, ctx, [articuloId]);
          const teorico = (await saldoDe(tx, articuloId, inv.almacenId, lote)).cantidad;
          [linea] = await tx.insert(stkInventarioLineas).values({ inventarioId: id, articuloId, lote, teorico }).returning();
        }
      }
      if (!linea) throw notFound('Línea no encontrada');
      const contado = r4(body.modo === 'sumar' ? (linea.contado ?? 0) + body.cantidad : body.cantidad);
      const [upd] = await tx.update(stkInventarioLineas).set({ contado, contadoPor: usuarioDe(ctx), contadoEn: new Date() }).where(eq(stkInventarioLineas.id, linea.id)).returning();
      const [art] = await tx.select({ referencia: articulos.referencia, nombre: articulos.nombre }).from(articulos).where(eq(articulos.id, upd!.articuloId));
      return { ...upd, ...art };
    });
  });

  app.post('/inventarios/:id/confirmar', { preHandler: guard('stk.mover') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(z.object({ noContadosACero: z.boolean().default(false) }), req.body ?? {});
    return db.transaction(async (tx) => {
      const [inv] = await tx.select().from(stkInventarios).where(and(eq(stkInventarios.id, id), eq(stkInventarios.empresaId, ctx.empresaId))).for('update');
      if (!inv) throw notFound('Recuento no encontrado');
      if (inv.estado !== 'abierto') throw conflict('Este recuento ya está cerrado');
      await exigirMoverEn(tx, ctx, inv.almacenId);
      const lineas = await tx.select().from(stkInventarioLineas).where(eq(stkInventarioLineas.inventarioId, id));
      const movs = [];
      let contadas = 0;
      for (const l of lineas) {
        const contado = l.contado ?? (body.noContadosACero ? 0 : null);
        if (contado === null) continue;
        contadas++;
        // se compara con el saldo actual (si ha habido movimientos durante el recuento ya están incluidos)
        const actual = (await saldoDe(tx, l.articuloId, inv.almacenId, l.lote)).cantidad;
        const dif = r4(contado - actual);
        await tx.update(stkInventarioLineas).set({ diferencia: dif, contado }).where(eq(stkInventarioLineas.id, l.id));
        if (Math.abs(dif) > 0.00001) movs.push({ tipo: 'inventario' as const, articuloId: l.articuloId, almacenId: inv.almacenId, cantidad: dif, lote: l.lote, origenTipo: 'inventario', origenId: id, motivo: `Recuento ${inv.codigo}` });
      }
      if (!contadas) throw badRequest('No has contado ningún artículo');
      await registrarMovimientos(tx, ctx, movs);
      const artIds = [...new Set(lineas.filter((l) => l.contado !== null || body.noContadosACero).map((l) => l.articuloId))];
      for (const a of artIds)
        await tx.insert(stkArticuloConfig).values({ articuloId: a, empresaId: ctx.empresaId, ultimoRecuento: hoy() }).onConflictDoUpdate({ target: stkArticuloConfig.articuloId, set: { ultimoRecuento: hoy() } });
      await tx.update(stkInventarios).set({ estado: 'confirmado', confirmadoEn: new Date(), confirmadoPor: usuarioDe(ctx) }).where(eq(stkInventarios.id, id));
      await audit(tx, ctx, 'confirmar', 'stk_inventario', id, { codigo: inv.codigo, contadas, ajustes: movs.length });
      return { ok: true, contadas, ajustes: movs.length };
    });
  });

  app.post('/inventarios/:id/cancelar', { preHandler: guard('stk.mover') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(stkInventarios).where(and(eq(stkInventarios.id, id), eq(stkInventarios.empresaId, ctx.empresaId))).for('update');
      if (!inv) throw notFound();
      if (inv.estado !== 'abierto') throw conflict('Este recuento ya está cerrado');
      await exigirMoverEn(tx, ctx, inv.almacenId);
      await tx.update(stkInventarios).set({ estado: 'cancelado' }).where(eq(stkInventarios.id, id));
      await audit(tx, ctx, 'cancelar', 'stk_inventario', id);
    });
    return { ok: true };
  });

  /* ── Configuración de stock y escandallos ── */
  app.get('/config/:articuloId', { preHandler: guard(['stk.ver', 'stk.mover']) }, async (req) => {
    const { articuloId } = req.params as { articuloId: string };
    const [c] = await db.select().from(stkArticuloConfig).where(and(eq(stkArticuloConfig.articuloId, articuloId), eq(stkArticuloConfig.empresaId, req.ctx.empresaId)));
    return c ?? { articuloId, stockMin: null, puntoPedido: null, cantidadPedido: null, controlaLotes: false, controlaSeries: false, ubicacionId: null };
  });

  const configSchema = toZod(articuloConfigResource, { partial: true });
  app.put('/config/:articuloId', { preHandler: guard('stk.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { articuloId } = req.params as { articuloId: string };
    const data = parse(configSchema, req.body) as Record<string, any>;
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    return db.transaction(async (tx) => {
      await articulosValidos(tx, ctx, [articuloId]);
      const [antes] = await tx.select().from(stkArticuloConfig).where(eq(stkArticuloConfig.articuloId, articuloId));
      const [row] = await tx
        .insert(stkArticuloConfig)
        .values({ articuloId, empresaId: ctx.empresaId, ...data })
        .onConflictDoUpdate({ target: stkArticuloConfig.articuloId, set: data })
        .returning();
      await audit(tx, ctx, 'editar', 'stk_articulo_config', articuloId, { antes: antes ?? null, despues: data });
      return row;
    });
  });

  app.get('/kits/:articuloId', { preHandler: guard(['stk.ver', 'catalogo.ver']) }, async (req) => {
    const { articuloId } = req.params as { articuloId: string };
    return db
      .select({ componenteId: stkKitComponentes.componenteId, cantidad: stkKitComponentes.cantidad, referencia: articulos.referencia, nombre: articulos.nombre, coste: articulos.coste, unidad: articulos.unidad })
      .from(stkKitComponentes)
      .innerJoin(articulos, eq(articulos.id, stkKitComponentes.componenteId))
      .where(and(eq(stkKitComponentes.kitId, articuloId), eq(stkKitComponentes.empresaId, req.ctx.empresaId)))
      .orderBy(asc(articulos.referencia));
  });

  app.put('/kits/:articuloId', { preHandler: guard(['stk.gestionar', 'catalogo.gestionar']) }, async (req) => {
    const ctx = req.ctx;
    const { articuloId } = req.params as { articuloId: string };
    const body = parse(z.object({ componentes: z.array(z.object({ componenteId: z.string().uuid(), cantidad: z.coerce.number().positive() })).max(200) }), req.body);
    return db.transaction(async (tx) => {
      const arts = await articulosValidos(tx, ctx, [articuloId, ...body.componentes.map((c) => c.componenteId)]);
      const kit = arts.get(articuloId)!;
      if (kit.tipo !== 'kit') throw badRequest('Solo los artículos de tipo kit tienen escandallo. Cambia el tipo del artículo a "Kit / escandallo".');
      for (const c of body.componentes) {
        if (c.componenteId === articuloId) throw badRequest('Un kit no puede contenerse a sí mismo');
        if (arts.get(c.componenteId)!.tipo === 'kit') throw badRequest(`${arts.get(c.componenteId)!.referencia} es otro kit: añade sus componentes directamente`);
      }
      await tx.delete(stkKitComponentes).where(eq(stkKitComponentes.kitId, articuloId));
      if (body.componentes.length) await tx.insert(stkKitComponentes).values(body.componentes.map((c) => ({ empresaId: ctx.empresaId, kitId: articuloId, ...c })));
      await audit(tx, ctx, 'editar', 'stk_kit', articuloId, { componentes: body.componentes });
      return { ok: true, componentes: body.componentes.length };
    });
  });

  /* ── Valoración (PMP) ── */
  app.get('/valoracion', { preHandler: guard(['stk.ver']) }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const rows = await db.execute<any>(sql`
      SELECT a.id, a.referencia, a.nombre, a.unidad, f.nombre AS familia, al.nombre AS almacen, al.id AS almacen_id,
             sum(s.cantidad)::float AS cantidad, sum(s.cantidad * s.coste_medio)::float AS valor
        FROM stk_saldos s
        JOIN articulos a ON a.id = s.articulo_id
        JOIN stk_almacenes al ON al.id = s.almacen_id
        LEFT JOIN familias f ON f.id = a.familia_id
       WHERE s.empresa_id = ${ctx.empresaId} AND s.cantidad <> 0 ${q.almacenId ? sql`AND s.almacen_id = ${q.almacenId}` : sql``}
       GROUP BY a.id, a.referencia, a.nombre, a.unidad, f.nombre, al.nombre, al.id
       ORDER BY a.referencia, al.nombre`);
    const items = rows.map((r: any) => ({ articuloId: r.id, referencia: r.referencia, nombre: r.nombre, unidad: r.unidad, familia: r.familia, almacen: r.almacen, almacenId: r.almacen_id, cantidad: r4(r.cantidad), costeMedio: r.cantidad ? r4(r.valor / r.cantidad) : 0, valor: Math.round(r.valor * 100) / 100 }));
    const total = Math.round(items.reduce((a: number, i: any) => a + i.valor, 0) * 100) / 100;
    if (q.format === 'xlsx')
      return xlsx(
        'valoracion-stock',
        [
          { header: 'Referencia', key: 'referencia', width: 18 },
          { header: 'Artículo', key: 'nombre', width: 42 },
          { header: 'Familia', key: 'familia', width: 20 },
          { header: 'Almacén', key: 'almacen', width: 22 },
          { header: 'Cantidad', key: 'cantidad', numFmt: '#,##0.###' },
          { header: 'Coste medio (PMP)', key: 'costeMedio', numFmt: '#,##0.0000 €', width: 18 },
          { header: 'Valor', key: 'valor', numFmt: '#,##0.00 €' },
        ],
        [...items, { referencia: 'TOTAL', valor: total }],
      );
    const porAlmacen = new Map<string, number>();
    for (const i of items) porAlmacen.set(i.almacen, (porAlmacen.get(i.almacen) ?? 0) + i.valor);
    return { items, total, porAlmacen: [...porAlmacen.entries()].map(([almacen, valor]) => ({ almacen, valor: Math.round(valor * 100) / 100 })) };
  });

  /* ── Trazabilidad por lote o número de serie ── */
  app.get('/trazabilidad', { preHandler: guard(['stk.ver']) }, async (req) => {
    const ctx = req.ctx;
    const q = String((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) throw badRequest('Escribe el lote o el número de serie');
    const [lotes, series] = await Promise.all([
      db
        .select({ id: stkLotes.id, articuloId: stkLotes.articuloId, lote: stkLotes.lote, caducidad: stkLotes.caducidad, referencia: articulos.referencia, nombre: articulos.nombre, proveedor: terceros.nombre, creadoEn: stkLotes.creadoEn })
        .from(stkLotes)
        .innerJoin(articulos, eq(articulos.id, stkLotes.articuloId))
        .leftJoin(terceros, eq(terceros.id, stkLotes.proveedorId))
        .where(and(eq(stkLotes.empresaId, ctx.empresaId), ilike(stkLotes.lote, `%${q.replace(/[%_]/g, '')}%`)))
        .limit(20),
      db
        .select({ id: stkSeries.id, articuloId: stkSeries.articuloId, numeroSerie: stkSeries.numeroSerie, estado: stkSeries.estado, lote: stkSeries.lote, referencia: articulos.referencia, nombre: articulos.nombre, almacen: stkAlmacenes.nombre, tercero: terceros.nombre, terceroId: stkSeries.terceroId, fechaEntrada: stkSeries.fechaEntrada, fechaSalida: stkSeries.fechaSalida, documentoEntradaId: stkSeries.documentoEntradaId, documentoSalidaId: stkSeries.documentoSalidaId })
        .from(stkSeries)
        .innerJoin(articulos, eq(articulos.id, stkSeries.articuloId))
        .leftJoin(stkAlmacenes, eq(stkAlmacenes.id, stkSeries.almacenId))
        .leftJoin(terceros, eq(terceros.id, stkSeries.terceroId))
        .where(and(eq(stkSeries.empresaId, ctx.empresaId), ilike(stkSeries.numeroSerie, `%${q.replace(/[%_]/g, '')}%`)))
        .limit(20),
    ]);
    const movLotes = lotes.length ? await movimientosQuery(ctx, { lotes: lotes.map((l) => `${l.articuloId}|${l.lote}`).join(';') }, 1, 300) : { items: [] };
    const movSeries = series.length ? await movimientosQuery(ctx, { series: series.map((s) => `${s.articuloId}|${s.numeroSerie}`).join(';') }, 1, 300) : { items: [] };
    return { lotes, series, movimientosLote: movLotes.items, movimientosSerie: movSeries.items };
  });

  /* ── Mi furgoneta (técnicos) ── */
  app.get('/mi-furgoneta', async (req) => {
    const ctx = req.ctx;
    if (!ctx.personaId) return { almacenes: [] };
    const mios = await db
      .select()
      .from(stkAlmacenes)
      .where(and(eq(stkAlmacenes.empresaId, ctx.empresaId), eq(stkAlmacenes.personaId, ctx.personaId), isNull(stkAlmacenes.archivadoEn), eq(stkAlmacenes.activo, true)))
      .orderBy(asc(stkAlmacenes.nombre));
    const out = [];
    for (const a of mios) {
      const stock = await db
        .select({ articuloId: stkSaldos.articuloId, referencia: articulos.referencia, nombre: articulos.nombre, unidad: articulos.unidad, ean: articulos.ean, lote: stkSaldos.lote, cantidad: stkSaldos.cantidad, stockMin: stkArticuloConfig.stockMin })
        .from(stkSaldos)
        .innerJoin(articulos, eq(articulos.id, stkSaldos.articuloId))
        .leftJoin(stkArticuloConfig, eq(stkArticuloConfig.articuloId, stkSaldos.articuloId))
        .where(and(eq(stkSaldos.almacenId, a.id), sql`${stkSaldos.cantidad} <> 0`))
        .orderBy(asc(articulos.referencia));
      const movs = await movimientosQuery(ctx, { almacenId: a.id }, 1, 15);
      out.push({ ...a, stock, movimientos: movs.items });
    }
    return { almacenes: out };
  });

  app.get('/bajo-minimo', { preHandler: guard(['stk.ver', 'cpr.editar']) }, async (req) => bajoMinimo(db, req.ctx.empresaId));

  app.get('/lotes', { preHandler: guard(['stk.ver', 'stk.mover', 'cpr.recibir']) }, async (req) => {
    const q = req.query as { articuloId?: string; almacenId?: string };
    if (!q.articuloId) throw badRequest('Indica el artículo');
    return db
      .select({ lote: stkSaldos.lote, cantidad: stkSaldos.cantidad, almacenId: stkSaldos.almacenId, caducidad: stkLotes.caducidad })
      .from(stkSaldos)
      .leftJoin(stkLotes, and(eq(stkLotes.articuloId, stkSaldos.articuloId), eq(stkLotes.lote, stkSaldos.lote)))
      .where(and(eq(stkSaldos.articuloId, q.articuloId), q.almacenId ? eq(stkSaldos.almacenId, q.almacenId) : undefined, sql`${stkSaldos.cantidad} > 0`, ne(stkSaldos.lote, '')))
      .orderBy(sql`${stkLotes.caducidad} NULLS LAST`);
  });
}

/** Traspaso entre almacenes: salida del origen al coste medio y entrada en destino al mismo coste. */
export async function traspasar(
  tx: Tx,
  ctx: Ctx,
  body: { origenId: string; destinoId: string; fecha?: string; notas?: string | null; lineas: { articuloId: string; cantidad: number; lote?: string | null; series?: string[] | null }[] },
) {
  const origen = await exigirMoverEn(tx, ctx, body.origenId);
  const destino = await cargarAlmacen(tx, ctx, body.destinoId);
  if (!destino.activo || destino.archivadoEn) throw conflict(`${destino.nombre} no está activo`);
  const arts = await articulosValidos(tx, ctx, body.lineas.map((l) => l.articuloId));
  for (const a of arts.values()) if (!a.controlaStock || a.tipo === 'servicio') throw badRequest(`${a.referencia} no controla stock`);
  const codigo = await nextCode(tx, ctx.empresaId, 'stk_traspaso', 'TR', body.fecha);
  const [t] = await tx
    .insert(stkTraspasos)
    .values({ empresaId: ctx.empresaId, codigo, fecha: body.fecha ?? hoy(), origenId: origen.id, destinoId: destino.id, notas: body.notas ?? null, lineas: body.lineas.length, usuarioId: usuarioDe(ctx), personaId: ctx.personaId })
    .returning();
  const motivo = `${codigo}: ${origen.nombre} → ${destino.nombre}`;
  const salidas = await registrarMovimientos(
    tx,
    ctx,
    body.lineas.map((l) => ({ tipo: 'traspaso_salida' as const, articuloId: l.articuloId, almacenId: origen.id, cantidad: -l.cantidad, lote: l.lote ?? '', origenTipo: 'traspaso', origenId: t!.id, series: l.series, motivo })),
  );
  await registrarMovimientos(
    tx,
    ctx,
    salidas.map((s) => ({ tipo: 'traspaso_entrada' as const, articuloId: s.articuloId, almacenId: destino.id, cantidad: -s.cantidad, costeUnitario: s.costeUnitario, lote: s.lote, origenTipo: 'traspaso', origenId: t!.id, series: s.series, motivo })),
  );
  for (const l of body.lineas)
    if (l.series?.length) await tx.update(stkSeries).set({ almacenId: destino.id }).where(and(eq(stkSeries.articuloId, l.articuloId), inArray(stkSeries.numeroSerie, l.series)));
  await audit(tx, ctx, 'crear', 'stk_traspaso', t!.id, { codigo, origen: origen.nombre, destino: destino.nombre, lineas: body.lineas });
  return { id: t!.id, codigo };
}

/** Consulta paginada de movimientos con artículo, almacén, documento y persona. */
export async function movimientosQuery(ctx: Ctx, q: Record<string, string | undefined>, page: number, pageSize: number) {
  const conds: (SQL | undefined)[] = [eq(stkMovimientos.empresaId, ctx.empresaId)];
  if (q.articuloId) conds.push(eq(stkMovimientos.articuloId, q.articuloId));
  if (q.almacenId) conds.push(eq(stkMovimientos.almacenId, q.almacenId));
  if (q.tipo) conds.push(inArray(stkMovimientos.tipo, q.tipo.split(',')));
  if (q.documentoId) conds.push(eq(stkMovimientos.documentoId, q.documentoId));
  if (q.origenId) conds.push(eq(stkMovimientos.origenId, q.origenId));
  if (q.lote) conds.push(eq(stkMovimientos.lote, q.lote));
  if (q.desde) conds.push(gte(stkMovimientos.momento, new Date(q.desde + 'T00:00:00')));
  if (q.hasta) conds.push(lte(stkMovimientos.momento, new Date(q.hasta + 'T23:59:59.999')));
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, '')}%`;
    conds.push(or(ilike(articulos.referencia, like), ilike(articulos.nombre, like), ilike(stkMovimientos.lote, like), ilike(documentos.codigo, like)));
  }
  if (q.lotes) conds.push(or(...q.lotes.split(';').map((p) => { const [a, l] = p.split('|'); return and(eq(stkMovimientos.articuloId, a!), eq(stkMovimientos.lote, l ?? ''))!; })));
  if (q.series) conds.push(or(...q.series.split(';').map((p) => { const [a, s] = p.split('|'); return and(eq(stkMovimientos.articuloId, a!), sql`${stkMovimientos.series} @> ARRAY[${s ?? ''}]::text[]`)!; })));
  const where = and(...conds);
  const base = db
    .select({
      id: stkMovimientos.id,
      momento: stkMovimientos.momento,
      tipo: stkMovimientos.tipo,
      articuloId: stkMovimientos.articuloId,
      referencia: articulos.referencia,
      articulo: articulos.nombre,
      unidad: articulos.unidad,
      almacenId: stkMovimientos.almacenId,
      almacen: stkAlmacenes.nombre,
      lote: stkMovimientos.lote,
      cantidad: stkMovimientos.cantidad,
      costeUnitario: stkMovimientos.costeUnitario,
      saldo: stkMovimientos.saldo,
      documentoId: stkMovimientos.documentoId,
      documento: documentos.codigo,
      documentoTipo: documentos.tipo,
      origenTipo: stkMovimientos.origenTipo,
      origenId: stkMovimientos.origenId,
      series: stkMovimientos.series,
      motivo: stkMovimientos.motivo,
      persona: nombrePersona,
      usuario: usuarios.email,
    })
    .from(stkMovimientos)
    .innerJoin(articulos, eq(articulos.id, stkMovimientos.articuloId))
    .innerJoin(stkAlmacenes, eq(stkAlmacenes.id, stkMovimientos.almacenId))
    .leftJoin(documentos, eq(documentos.id, stkMovimientos.documentoId))
    .leftJoin(personas, eq(personas.id, stkMovimientos.personaId))
    .leftJoin(usuarios, eq(usuarios.id, stkMovimientos.usuarioId))
    .where(where);
  const [items, [n]] = await Promise.all([
    base.orderBy(desc(stkMovimientos.momento), desc(stkMovimientos.id)).limit(pageSize).offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(stkMovimientos)
      .innerJoin(articulos, eq(articulos.id, stkMovimientos.articuloId))
      .leftJoin(documentos, eq(documentos.id, stkMovimientos.documentoId))
      .where(where),
  ]);
  return { items, total: n?.n ?? 0, page, pageSize };
}
