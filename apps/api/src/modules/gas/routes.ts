import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { gasShared, isValidNif, round } from '@kite/shared';
import { db } from '../../db/client';
import { personas, terceros } from '../../db/schema/core';
import { audit } from '../../core/audit';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, parse } from '../../core/errors';
import { fileBuffer, fileUrl, getFile } from '../../core/files';
import { can, guard, scopeCondition } from '../../core/permissions';
import { getAjustes } from '../../core/settings';
import { sha256 } from '../../core/auth';
import { gasGastos, gasLiquidaciones, gasTarjetaMovimientos, gasTarjetas } from './schema';
import { aprobarGasto, calcularImportes, cargarGasto, enviarGasto, liquidar, puedeAprobar, puedeVerGasto, rechazarGasto } from './service';
import { parseCsvMovimientos } from '../tes/norma43';
import { extraerTicketPdf } from './extraer';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
const hoy = () => new Date().toISOString().slice(0, 10);
const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

const gastoSchema = z.object({
  tipo: z.enum(['ticket', 'kilometraje', 'dieta', 'tarjeta']).default('ticket'),
  categoria: z.string().max(30).nullish(),
  fecha: fecha.default(hoy()),
  comercio: z.string().trim().max(200).nullish(),
  nifComercio: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .refine((v) => !v || isValidNif(v) || /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(v), 'NIF del comercio no válido')
    .nullish(),
  concepto: z.string().trim().max(500).default(''),
  total: z.coerce.number().nullish(),
  ivaTipo: z.coerce.number().min(0).max(30).nullish(),
  iva: z.coerce.number().min(0).nullish(),
  km: z.coerce.number().min(0).max(5000).nullish(),
  origen: z.string().trim().max(200).nullish(),
  destino: z.string().trim().max(200).nullish(),
  pais: z.string().trim().length(2).toUpperCase().default('ES'),
  proyectoId: z.string().uuid().nullish(),
  activoId: z.string().uuid().nullish(),
  terceroId: z.string().uuid().nullish(),
  archivoId: z.string().uuid().nullish(),
  tarjetaId: z.string().uuid().nullish(),
  personaId: z.string().uuid().nullish(),
  enviar: z.boolean().optional(),
});

export async function gasRoutes(app: FastifyInstance) {
  /* ── Listado según la vista ── */
  app.get('/gastos', async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const vista = q.vista ?? 'mios';
    const conds: (SQL | undefined)[] = [eq(gasGastos.empresaId, ctx.empresaId)];
    if (vista === 'mios') {
      if (!ctx.personaId) return { items: [], total: 0, resumen: null };
      conds.push(eq(gasGastos.personaId, ctx.personaId));
    } else if (vista === 'aprobar') {
      const s = ctx.perms.get('gas.aprobar');
      if (!s) throw forbidden();
      conds.push(eq(gasGastos.estado, 'enviado'), await scopeCondition(ctx, s, gasGastos.personaId));
      if (!ctx.isAdmin && ctx.personaId) conds.push(ne(gasGastos.personaId, ctx.personaId));
    } else if (vista === 'liquidar') {
      if (!can(ctx, 'gas.liquidar')) throw forbidden();
      conds.push(eq(gasGastos.estado, 'aprobado'));
    } else {
      const s = ctx.perms.get('gas.ver');
      if (!s) throw forbidden();
      if (!can(ctx, 'gas.liquidar')) conds.push(await scopeCondition(ctx, s, gasGastos.personaId));
    }
    if (q.estado && vista !== 'aprobar' && vista !== 'liquidar') conds.push(inArray(gasGastos.estado, q.estado.split(',')));
    if (q.personaId) conds.push(eq(gasGastos.personaId, q.personaId));
    if (q.tipo) conds.push(eq(gasGastos.tipo, q.tipo));
    if (q.desde) conds.push(gte(gasGastos.fecha, q.desde));
    if (q.hasta) conds.push(lte(gasGastos.fecha, q.hasta));
    if (q.q) {
      const like = `%${q.q.replace(/[%_]/g, '')}%`;
      conds.push(or(ilike(gasGastos.comercio, like), ilike(gasGastos.concepto, like)));
    }
    const where = and(...conds);
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));
    const [rows, [tot]] = await Promise.all([
      db
        .select({ g: gasGastos, persona: nombrePersona, cliente: terceros.nombre })
        .from(gasGastos)
        .innerJoin(personas, eq(personas.id, gasGastos.personaId))
        .leftJoin(terceros, eq(terceros.id, gasGastos.terceroId))
        .where(where)
        .orderBy(desc(gasGastos.fecha), desc(gasGastos.creadoEn))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${gasGastos.total}), 0)`, iva: sql<string>`coalesce(sum(${gasGastos.iva}), 0)` })
        .from(gasGastos)
        .where(where),
    ]);
    let resumen = null;
    if (vista === 'mios' && ctx.personaId) {
      const [r] = await db
        .select({
          porCobrar: sql<string>`coalesce(sum(${gasGastos.total}) FILTER (WHERE ${gasGastos.estado} IN ('enviado','aprobado') AND ${gasGastos.tipo} <> 'tarjeta'), 0)`,
          borradores: sql<number>`count(*) FILTER (WHERE ${gasGastos.estado} IN ('borrador','rechazado'))::int`,
          mes: sql<string>`coalesce(sum(${gasGastos.total}) FILTER (WHERE ${gasGastos.fecha} >= date_trunc('month', current_date)::date), 0)`,
        })
        .from(gasGastos)
        .where(and(eq(gasGastos.empresaId, ctx.empresaId), eq(gasGastos.personaId, ctx.personaId)));
      resumen = { porCobrar: round(Number(r?.porCobrar ?? 0)), borradores: r?.borradores ?? 0, mes: round(Number(r?.mes ?? 0)) };
    }
    return {
      items: rows.map((r) => ({ ...r.g, persona: r.persona, cliente: r.cliente, archivoUrl: fileUrl(r.g.archivoId) })),
      total: tot?.n ?? 0,
      suma: round(Number(tot?.total ?? 0)),
      sumaIva: round(Number(tot?.iva ?? 0)),
      resumen,
      page,
      pageSize,
    };
  });

  app.get('/gastos/:id', async (req) => {
    const ctx = req.ctx;
    const g = await db.transaction((tx) => cargarGasto(tx, ctx, (req.params as { id: string }).id));
    if (!(await puedeVerGasto(ctx, g))) throw forbidden();
    const [p] = await db.select({ n: nombrePersona }).from(personas).where(eq(personas.id, g.personaId));
    const [ap] = g.aprobadoPor ? await db.select({ n: nombrePersona }).from(personas).where(eq(personas.id, g.aprobadoPor)) : [];
    const f = g.archivoId ? await getFile(db, g.archivoId) : null;
    return {
      ...g,
      persona: p?.n,
      aprobador: ap?.n ?? null,
      archivo: f ? { id: f.id, nombre: f.nombre, mime: f.mime, tamano: f.tamano, url: fileUrl(f.id) } : null,
      puedeEditar: g.personaId === ctx.personaId && ['borrador', 'rechazado'].includes(g.estado),
      puedeAprobar: g.estado === 'enviado' && (await puedeAprobar(ctx, g.personaId)),
    };
  });

  app.post('/gastos', { preHandler: guard('gas.crear') }, async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(gastoSchema, req.body);
    let personaId = ctx.personaId;
    if (b.personaId && b.personaId !== ctx.personaId) {
      if (!can(ctx, 'gas.liquidar')) throw forbidden('Solo Administración registra gastos de otras personas');
      personaId = b.personaId;
    }
    if (!personaId) throw badRequest('Tu usuario no está asociado a ninguna persona');
    const aj = await getAjustes(ctx.empresaId);
    const imp = calcularImportes(b, Number(aj.precioKm) || 0.26);
    const row = await db.transaction(async (tx) => {
      if (b.tipo === 'tarjeta') {
        if (!b.tarjetaId) throw badRequest('Elige la tarjeta de empresa');
        const [tj] = await tx.select().from(gasTarjetas).where(and(eq(gasTarjetas.id, b.tarjetaId), eq(gasTarjetas.empresaId, ctx.empresaId)));
        if (!tj || tj.personaId !== personaId) throw badRequest('Esa tarjeta no está a tu nombre');
      }
      const [g] = await tx
        .insert(gasGastos)
        .values({
          empresaId: ctx.empresaId,
          personaId: personaId!,
          tipo: b.tipo,
          categoria: b.categoria ?? (b.tipo === 'kilometraje' ? 'transporte' : b.tipo === 'dieta' ? 'comida' : null),
          fecha: b.fecha,
          comercio: b.comercio ?? null,
          nifComercio: b.nifComercio || null,
          concepto: b.concepto || (b.tipo === 'kilometraje' ? `${b.origen ?? ''} → ${b.destino ?? ''}`.trim() : ''),
          ...imp,
          origen: b.origen ?? null,
          destino: b.destino ?? null,
          pais: b.pais,
          proyectoId: b.proyectoId ?? null,
          activoId: b.activoId ?? null,
          terceroId: b.terceroId ?? null,
          archivoId: b.archivoId ?? null,
          tarjetaId: b.tipo === 'tarjeta' ? b.tarjetaId! : null,
          creadoPor: ctx.usuarioId,
        })
        .returning();
      await audit(tx, ctx, 'crear', 'gas_gasto', g!.id, { tipo: g!.tipo, total: g!.total });
      if (b.enviar) await enviarGasto(tx, ctx, g!.id);
      return (await tx.select().from(gasGastos).where(eq(gasGastos.id, g!.id)))[0]!;
    });
    reply.code(201);
    return row;
  });

  app.patch('/gastos/:id', { preHandler: guard('gas.crear') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(gastoSchema.partial(), req.body);
    const aj = await getAjustes(ctx.empresaId);
    return db.transaction(async (tx) => {
      const g = await cargarGasto(tx, ctx, id, { forUpdate: true });
      if (g.personaId !== ctx.personaId) throw forbidden('Solo quien registra el gasto puede cambiarlo');
      if (!['borrador', 'rechazado'].includes(g.estado)) throw conflict('Un gasto enviado no se puede cambiar. Si hay un error, pide que te lo rechacen.');
      const merged = { ...g, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) } as typeof g & typeof b;
      const imp = calcularImportes({ tipo: merged.tipo, total: merged.total, ivaTipo: merged.ivaTipo, iva: 'iva' in b ? b.iva : 'total' in b || 'ivaTipo' in b ? null : merged.iva, km: merged.km }, Number(aj.precioKm) || 0.26);
      const { enviar, personaId: _p, ...rest } = b;
      const [u] = await tx
        .update(gasGastos)
        .set({ ...rest, nifComercio: rest.nifComercio === undefined ? undefined : rest.nifComercio || null, ...imp, tarjetaId: merged.tipo === 'tarjeta' ? merged.tarjetaId : null })
        .where(eq(gasGastos.id, id))
        .returning();
      await audit(tx, ctx, 'editar', 'gas_gasto', id, { total: u!.total });
      if (enviar) await enviarGasto(tx, ctx, id);
      return u;
    });
  });

  app.delete('/gastos/:id', { preHandler: guard('gas.crear') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const g = await cargarGasto(tx, ctx, id, { forUpdate: true });
      if (g.personaId !== ctx.personaId) throw forbidden();
      if (!['borrador', 'rechazado'].includes(g.estado)) throw conflict('Solo se borran los gastos que aún no se han enviado');
      await tx.update(gasTarjetaMovimientos).set({ gastoId: null }).where(eq(gasTarjetaMovimientos.gastoId, id));
      await tx.delete(gasGastos).where(eq(gasGastos.id, id));
      await audit(tx, ctx, 'borrar', 'gas_gasto', id, g);
    });
    return { ok: true };
  });

  app.post('/gastos/:id/enviar', { preHandler: guard('gas.crear') }, async (req) => {
    await db.transaction((tx) => enviarGasto(tx, req.ctx, (req.params as { id: string }).id));
    return { ok: true };
  });
  app.post('/gastos/:id/aprobar', { preHandler: guard('gas.aprobar') }, async (req) => {
    await db.transaction((tx) => aprobarGasto(tx, req.ctx, (req.params as { id: string }).id));
    return { ok: true };
  });
  app.post('/gastos/:id/rechazar', { preHandler: guard('gas.aprobar') }, async (req) => {
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, 'Explica el motivo del rechazo').max(500) }), req.body);
    await db.transaction((tx) => rechazarGasto(tx, req.ctx, (req.params as { id: string }).id, motivo));
    return { ok: true };
  });
  app.post('/gastos/aprobar-lote', { preHandler: guard('gas.aprobar') }, async (req) => {
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }), req.body);
    await db.transaction(async (tx) => {
      for (const id of ids) await aprobarGasto(tx, req.ctx, id);
    });
    return { aprobados: ids.length };
  });

  /* ── Liquidación ── */
  app.post('/liquidaciones', { preHandler: guard('gas.liquidar') }, async (req, reply) => {
    const b = parse(z.object({ ids: z.array(z.string().uuid()).min(1, 'Elige los gastos que vas a pagar').max(500), via: z.enum(['nomina', 'transferencia']), fecha: fecha.default(hoy()) }), req.body);
    const r = await db.transaction((tx) => liquidar(tx, req.ctx, b));
    reply.code(201);
    return r;
  });
  app.get('/liquidaciones', { preHandler: guard('gas.liquidar') }, async (req) =>
    db.select().from(gasLiquidaciones).where(eq(gasLiquidaciones.empresaId, req.ctx.empresaId)).orderBy(desc(gasLiquidaciones.fecha), desc(gasLiquidaciones.creadoEn)).limit(100),
  );

  /* ── Lectura de tickets en PDF ── */
  app.post('/extraer', { preHandler: guard('gas.crear') }, async (req) => {
    const { archivoId } = parse(z.object({ archivoId: z.string().uuid() }), req.body);
    const f = await getFile(db, archivoId);
    if (f.empresaId !== req.ctx.empresaId) throw forbidden();
    if (f.mime !== 'application/pdf' && !f.nombre.toLowerCase().endsWith('.pdf')) return { leido: false, motivo: 'Solo se leen automáticamente los tickets en PDF. Rellena los datos a mano.' };
    try {
      return { leido: true, ...(await extraerTicketPdf(await fileBuffer(f.ruta))) };
    } catch {
      return { leido: false, motivo: 'No se ha podido leer el PDF' };
    }
  });

  /* ── Informe ── */
  app.get('/informe', { preHandler: guard(['gas.ver', 'gas.liquidar']) }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const desde = q.desde || `${new Date().getFullYear()}-01-01`;
    const hasta = q.hasta || `${new Date().getFullYear()}-12-31`;
    const conds: (SQL | undefined)[] = [eq(gasGastos.empresaId, ctx.empresaId), gte(gasGastos.fecha, desde), lte(gasGastos.fecha, hasta)];
    if (!can(ctx, 'gas.liquidar')) conds.push(await scopeCondition(ctx, ctx.perms.get('gas.ver')!, gasGastos.personaId));
    conds.push(inArray(gasGastos.estado, q.estado ? q.estado.split(',') : ['enviado', 'aprobado', 'liquidado']));
    const agrupar = ['persona', 'proyecto', 'mes', 'categoria', 'tipo'].includes(q.agrupar) ? q.agrupar : 'persona';
    const key =
      agrupar === 'persona'
        ? nombrePersona
        : agrupar === 'proyecto'
          ? sql<string>`coalesce(${gasGastos.proyectoId}::text, '')`
          : agrupar === 'mes'
            ? sql<string>`to_char(${gasGastos.fecha}, 'YYYY-MM')`
            : agrupar === 'categoria'
              ? sql<string>`coalesce(${gasGastos.categoria}, 'otros')`
              : sql<string>`${gasGastos.tipo}`;
    const rows = await db
      .select({ clave: key, n: sql<number>`count(*)::int`, total: sql<string>`sum(${gasGastos.total})`, iva: sql<string>`sum(${gasGastos.iva})`, km: sql<string>`coalesce(sum(${gasGastos.km}), 0)`, liquidado: sql<string>`coalesce(sum(${gasGastos.total}) FILTER (WHERE ${gasGastos.estado} = 'liquidado'), 0)` })
      .from(gasGastos)
      .innerJoin(personas, eq(personas.id, gasGastos.personaId))
      .where(and(...conds))
      .groupBy(key)
      .orderBy(agrupar === 'mes' ? asc(key) : desc(sql`sum(${gasGastos.total})`));
    // nombre de proyecto si el módulo PRY lo expone en el selector de referencias
    let etiquetas: Record<string, string> = {};
    if (agrupar === 'proyecto') {
      const { searchRefs } = await import('../../core/refs');
      const ids = rows.map((r) => r.clave).filter(Boolean);
      if (ids.length) etiquetas = Object.fromEntries((await searchRefs(ctx, 'proyectos', '', ids, {})).map((x) => [x.id, x.label]));
    }
    const cat = (k: string) => gasShared.GASTO_CATEGORIAS.find((c) => c.value === k)?.label ?? gasShared.GASTO_TIPOS.find((c) => c.value === k)?.label ?? k;
    return {
      agrupar,
      desde,
      hasta,
      filas: rows.map((r) => ({
        clave: r.clave,
        etiqueta: agrupar === 'proyecto' ? (r.clave ? (etiquetas[r.clave] ?? 'Proyecto') : 'Sin proyecto') : agrupar === 'categoria' || agrupar === 'tipo' ? cat(r.clave) : r.clave,
        gastos: r.n,
        total: round(Number(r.total)),
        iva: round(Number(r.iva)),
        km: round(Number(r.km), 1),
        liquidado: round(Number(r.liquidado)),
      })),
    };
  });

  /* ── Tarjetas de empresa ── */
  registerCrud(app, { path: '/tarjetas', resource: gasShared.tarjetaResource, table: gasTarjetas, entity: 'gas_tarjeta', perms: { ver: 'gas.liquidar', crear: 'gas.liquidar' }, hardDelete: false, only: ['list', 'get', 'create', 'update'] });
  app.get('/mis-tarjetas', async (req) => {
    const ctx = req.ctx;
    if (!ctx.personaId) return [];
    return db.select().from(gasTarjetas).where(and(eq(gasTarjetas.empresaId, ctx.empresaId), eq(gasTarjetas.personaId, ctx.personaId), eq(gasTarjetas.activo, true)));
  });

  app.get('/tarjetas/:id/movimientos', { preHandler: guard('gas.liquidar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    return db
      .select({ m: gasTarjetaMovimientos, gasto: gasGastos.concepto, comercioGasto: gasGastos.comercio, estadoGasto: gasGastos.estado })
      .from(gasTarjetaMovimientos)
      .leftJoin(gasGastos, eq(gasGastos.id, gasTarjetaMovimientos.gastoId))
      .where(and(eq(gasTarjetaMovimientos.empresaId, ctx.empresaId), eq(gasTarjetaMovimientos.tarjetaId, id)))
      .orderBy(desc(gasTarjetaMovimientos.fecha))
      .limit(300)
      .then((rows) => rows.map((r) => ({ ...r.m, gasto: r.gasto, comercioGasto: r.comercioGasto, estadoGasto: r.estadoGasto })));
  });

  /** Importa el extracto de la tarjeta (CSV) y lo casa con los tickets del titular (importe ±0,01 y ±3 días). */
  app.post('/tarjetas/:id/movimientos/importar', { preHandler: guard('gas.liquidar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const { archivoId } = parse(z.object({ archivoId: z.string().uuid() }), req.body);
    const f = await getFile(db, archivoId);
    if (f.empresaId !== ctx.empresaId) throw forbidden();
    const movs = parseCsvMovimientos((await fileBuffer(f.ruta)).toString('utf8'));
    if (!movs.length) throw badRequest('No se han encontrado cargos. El CSV debe tener fecha; comercio; importe');
    return db.transaction(async (tx) => {
      const [tj] = await tx.select().from(gasTarjetas).where(and(eq(gasTarjetas.id, id), eq(gasTarjetas.empresaId, ctx.empresaId)));
      if (!tj) throw badRequest('Tarjeta no encontrada');
      const r = await importarCargosTarjeta(tx, ctx.empresaId, tj, movs.map((m) => ({ fecha: m.fecha, comercio: m.concepto, importe: Math.abs(m.importe) })));
      await audit(tx, ctx, 'importar', 'gas_tarjeta', id, r);
      return r;
    });
  });

  app.post('/tarjeta-movimientos/:id/vincular', { preHandler: guard('gas.liquidar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const { gastoId } = parse(z.object({ gastoId: z.string().uuid().nullable() }), req.body);
    await db.transaction(async (tx) => {
      await tx.update(gasTarjetaMovimientos).set({ gastoId }).where(and(eq(gasTarjetaMovimientos.id, id), eq(gasTarjetaMovimientos.empresaId, ctx.empresaId)));
      await audit(tx, ctx, 'vincular', 'gas_tarjeta_movimiento', id, { gastoId });
    });
    return { ok: true };
  });
}

/** Inserta cargos de tarjeta sin duplicar y los casa con tickets del titular. Avisa de los que no tienen ticket. */
export async function importarCargosTarjeta(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], empresaId: string, tj: typeof gasTarjetas.$inferSelect, cargos: { fecha: string; comercio: string; importe: number }[]) {
  let nuevos = 0;
  let casados = 0;
  const vistos = new Map<string, number>();
  for (const c of cargos) {
    const base = `${tj.id}|${c.fecha}|${c.importe.toFixed(2)}|${c.comercio.trim().toUpperCase()}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    const desde = new Date(Date.parse(c.fecha) - 3 * 86400_000).toISOString().slice(0, 10);
    const hasta = new Date(Date.parse(c.fecha) + 3 * 86400_000).toISOString().slice(0, 10);
    const [g] = await tx
      .select({ id: gasGastos.id })
      .from(gasGastos)
      .where(
        and(
          eq(gasGastos.empresaId, empresaId),
          eq(gasGastos.personaId, tj.personaId),
          sql`abs(${gasGastos.total} - ${c.importe}) <= 0.01`,
          gte(gasGastos.fecha, desde),
          lte(gasGastos.fecha, hasta),
          sql`NOT EXISTS (SELECT 1 FROM ${gasTarjetaMovimientos} m WHERE m.gasto_id = ${gasGastos.id})`,
        ),
      )
      .limit(1);
    const r = await tx
      .insert(gasTarjetaMovimientos)
      .values({ empresaId, tarjetaId: tj.id, fecha: c.fecha, comercio: c.comercio.slice(0, 200), importe: round(c.importe), gastoId: g?.id ?? null, hash: sha256(`${base}#${n}`) })
      .onConflictDoNothing()
      .returning({ id: gasTarjetaMovimientos.id });
    if (r.length) {
      nuevos++;
      if (g) casados++;
    }
  }
  return { nuevos, casados, sinTicket: nuevos - casados };
}

