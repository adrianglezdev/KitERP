import { and, asc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DOC_FACTURAS,
  articuloResource,
  contactoResource,
  familiaResource,
  normalizeNif,
  tarifaResource,
  terceroResource,
} from '@kite/shared';
import { db, type DbOrTx } from '../db/client';
import { articulos, contactos, direcciones, documentos, familias, tarifaPrecios, tarifas, terceros } from '../db/schema';
import { audit } from '../core/audit';
import { registerCrud } from '../core/crud';
import { forbidden, notFound, parse } from '../core/errors';
import { can, canOnOwner, guard } from '../core/permissions';

/** Precio de un artículo para un tercero aplicando su tarifa y descuento habitual. */
export async function precioPara(tx: DbOrTx, empresaId: string, articuloId: string, terceroId?: string | null) {
  const [a] = await tx.select().from(articulos).where(and(eq(articulos.id, articuloId), eq(articulos.empresaId, empresaId)));
  if (!a) throw notFound('Artículo no encontrado');
  let precio = a.precioVenta;
  let descuento = 0;
  let tarifaId: string | null = null;
  if (terceroId) {
    const [t] = await tx.select({ tarifaId: terceros.tarifaId, descuento: terceros.descuento }).from(terceros).where(eq(terceros.id, terceroId));
    descuento = t?.descuento ?? 0;
    tarifaId = t?.tarifaId ?? null;
  }
  if (tarifaId) {
    const [tf] = await tx.select().from(tarifas).where(eq(tarifas.id, tarifaId));
    if (tf?.activo) {
      if (tf.tipo === 'precios') {
        const [tp] = await tx.select().from(tarifaPrecios).where(and(eq(tarifaPrecios.tarifaId, tf.id), eq(tarifaPrecios.articuloId, a.id)));
        if (tp) precio = tp.precio;
      } else if (tf.tipo === 'descuento' && tf.porcentaje) precio = Math.round(a.precioVenta * (1 - tf.porcentaje / 100) * 10000) / 10000;
      else if (tf.tipo === 'margen' && tf.porcentaje && a.coste) precio = Math.round(a.coste * (1 + tf.porcentaje / 100) * 10000) / 10000;
    }
  }
  return {
    articuloId: a.id,
    referencia: a.referencia,
    descripcion: a.nombre,
    unidad: a.unidad,
    precio,
    descuento,
    ivaTipo: a.ivaTipo,
    coste: a.coste,
    tipo: a.tipo,
    controlaStock: a.controlaStock,
  };
}

const contactoOwner = sql`(SELECT t.comercial_id FROM terceros t WHERE t.id = ${contactos.terceroId})`;

export async function tercerosRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: '/terceros',
    resource: terceroResource,
    table: terceros,
    entity: 'tercero',
    perms: { ver: 'terceros.ver', crear: 'terceros.gestionar' },
    scopeCol: terceros.comercialId,
    ownerOnCreate: 'comercialId',
    searchCols: [terceros.nombre, terceros.razonSocial, terceros.nif, terceros.email, terceros.telefono, terceros.localidad],
    extraFilters: { etiqueta: terceros.etiquetas },
    baseWhere: (_ctx, req) => {
      const q = req.query as Record<string, string>;
      if (q.etiqueta) return sql`${terceros.etiquetas} @> ARRAY[${q.etiqueta}]::text[]`;
      return undefined;
    },
    beforeSave: async (tx, ctx, data, existing) => {
      if (data.nif) data.nif = normalizeNif(data.nif);
      if (!data.razonSocial && !existing?.razonSocial && data.nombre) data.razonSocial = data.nombre;
      return data;
    },
  });

  /** Posibles duplicados antes de crear: responde aunque el tercero no esté en tu cartera (solo nombre y comercial). */
  app.get('/terceros-duplicados', { preHandler: guard('terceros.gestionar') }, async (req) => {
    const q = req.query as { nif?: string; email?: string; telefono?: string; nombre?: string; excluir?: string };
    const conds = [];
    if (q.nif) conds.push(eq(terceros.nif, normalizeNif(q.nif)));
    if (q.email) conds.push(ilike(terceros.email, q.email.trim()));
    if (q.telefono && q.telefono.replace(/\D/g, '').length >= 9) conds.push(sql`regexp_replace(${terceros.telefono}, '\\D', '', 'g') = ${q.telefono.replace(/\D/g, '')}`);
    if (q.nombre && q.nombre.length >= 4) conds.push(sql`similarity(${terceros.nombre}, ${q.nombre}) > 0.55`);
    if (!conds.length) return [];
    return db
      .select({ id: terceros.id, nombre: terceros.nombre, nif: terceros.nif, comercialId: terceros.comercialId })
      .from(terceros)
      .where(and(eq(terceros.empresaId, req.ctx.empresaId), isNull(terceros.archivadoEn), or(...conds), q.excluir ? ne(terceros.id, q.excluir) : undefined))
      .limit(5);
  });

  /** Resumen económico de un tercero (cifras de los documentos comerciales). */
  app.get('/terceros/:id/resumen', async (req) => {
    const { id } = req.params as { id: string };
    const [t] = await db.select().from(terceros).where(and(eq(terceros.id, id), eq(terceros.empresaId, req.ctx.empresaId)));
    if (!t) throw notFound();
    if (!(await canOnOwner(req.ctx, 'terceros.ver', t.comercialId))) throw forbidden();
    const anio = new Date().getFullYear();
    const verFacturas = can(req.ctx, 'fac.ver') || can(req.ctx, 'cpr.ver');
    if (!verFacturas) return { visible: false };
    const [r] = await db
      .select({
        facturadoAnio: sql<number>`coalesce(sum(CASE WHEN ${documentos.circuito} = 'venta' AND extract(year from ${documentos.fecha}) = ${anio} THEN ${documentos.baseImponible} END), 0)::float`,
        facturadoAnterior: sql<number>`coalesce(sum(CASE WHEN ${documentos.circuito} = 'venta' AND extract(year from ${documentos.fecha}) = ${anio - 1} THEN ${documentos.baseImponible} END), 0)::float`,
        compradoAnio: sql<number>`coalesce(sum(CASE WHEN ${documentos.circuito} = 'compra' AND extract(year from ${documentos.fecha}) = ${anio} THEN ${documentos.baseImponible} END), 0)::float`,
        pendienteCobro: sql<number>`coalesce(sum(CASE WHEN ${documentos.circuito} = 'venta' AND coalesce(${documentos.estadoPago}, 'pendiente') IN ('pendiente','parcial','impagado') THEN ${documentos.total} END), 0)::float`,
        facturas: sql<number>`count(*)::int`,
      })
      .from(documentos)
      .where(
        and(
          eq(documentos.terceroId, id),
          inArray(documentos.tipo, [...DOC_FACTURAS, 'factura_proveedor']),
          eq(documentos.bloqueado, true),
          isNull(documentos.archivadoEn),
        ),
      );
    return { visible: true, ...r, riesgoMax: t.riesgoMax };
  });

  /* Direcciones de entrega */
  app.get('/terceros/:id/direcciones', async (req) => {
    const { id } = req.params as { id: string };
    return db.select().from(direcciones).where(eq(direcciones.terceroId, id)).orderBy(asc(direcciones.nombre));
  });
  const dirSchema = z.object({
    nombre: z.string().min(1),
    direccion: z.string().nullish(),
    codigoPostal: z.string().nullish(),
    localidad: z.string().nullish(),
    provincia: z.string().nullish(),
    pais: z.string().length(2).default('ES'),
    telefono: z.string().nullish(),
    principal: z.boolean().default(false),
  });
  app.post('/terceros/:id/direcciones', { preHandler: guard('terceros.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(dirSchema, req.body);
    const [t] = await db.select().from(terceros).where(and(eq(terceros.id, id), eq(terceros.empresaId, req.ctx.empresaId)));
    if (!t || !(await canOnOwner(req.ctx, 'terceros.gestionar', t.comercialId))) throw forbidden();
    return db.transaction(async (tx) => {
      const [d] = await tx.insert(direcciones).values({ ...body, terceroId: id }).returning();
      await audit(tx, req.ctx, 'crear', 'direccion', d!.id, d);
      return d;
    });
  });
  app.delete('/direcciones/:id', { preHandler: guard('terceros.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const [d] = await db
      .select({ d: direcciones, c: terceros.comercialId, e: terceros.empresaId })
      .from(direcciones)
      .innerJoin(terceros, eq(terceros.id, direcciones.terceroId))
      .where(eq(direcciones.id, id));
    if (!d || d.e !== req.ctx.empresaId || !(await canOnOwner(req.ctx, 'terceros.gestionar', d.c))) throw forbidden();
    await db.transaction(async (tx) => {
      await tx.delete(direcciones).where(eq(direcciones.id, id));
      await audit(tx, req.ctx, 'borrar', 'direccion', id, d.d);
    });
    return { ok: true };
  });

  registerCrud(app, {
    path: '/contactos',
    resource: contactoResource,
    table: contactos,
    entity: 'contacto',
    perms: { ver: 'terceros.ver', crear: 'terceros.gestionar' },
    scopeCol: contactoOwner as any,
    beforeSave: async (tx, ctx, data) => {
      if (data.terceroId) {
        const [t] = await tx.select({ c: terceros.comercialId }).from(terceros).where(and(eq(terceros.id, data.terceroId), eq(terceros.empresaId, ctx.empresaId)));
        if (!t || !(await canOnOwner(ctx, 'terceros.gestionar', t.c))) throw forbidden('No puedes añadir contactos a ese cliente');
      }
      return data;
    },
  });

  /* ── Catálogo ── */
  registerCrud(app, {
    path: '/articulos',
    resource: articuloResource,
    table: articulos,
    entity: 'articulo',
    perms: { ver: ['catalogo.ver', 'cpr.solicitar', 'pre.ver', 'sat.ver'], crear: 'catalogo.gestionar' },
    beforeSave: async (_tx, _ctx, data) => {
      if (data.ivaTipo !== undefined && data.ivaTipo !== null) data.ivaTipo = Number(data.ivaTipo);
      if (data.tipo === 'servicio') data.controlaStock = false;
      return data;
    },
    transformOut: (r, ctx) => (can(ctx, 'catalogo.gestionar') || can(ctx, 'cpr.ver') || can(ctx, 'pre.editar') ? r : { ...r, coste: null }),
  });
  app.get('/articulos/:id/precio', async (req) => {
    const { id } = req.params as { id: string };
    const { terceroId } = req.query as { terceroId?: string };
    const p = await precioPara(db, req.ctx.empresaId, id, terceroId);
    return can(req.ctx, 'pre.editar') || can(req.ctx, 'cpr.ver') || can(req.ctx, 'catalogo.gestionar') ? p : { ...p, coste: 0 };
  });

  registerCrud(app, {
    path: '/familias',
    resource: familiaResource,
    table: familias,
    entity: 'familia',
    perms: { ver: 'catalogo.ver', crear: 'catalogo.gestionar' },
  });
  registerCrud(app, {
    path: '/tarifas',
    resource: tarifaResource,
    table: tarifas,
    entity: 'tarifa',
    perms: { ver: 'catalogo.ver', crear: 'catalogo.gestionar' },
    hardDelete: true,
  });
  app.get('/tarifas/:id/precios', { preHandler: guard('catalogo.ver') }, async (req) => {
    const { id } = req.params as { id: string };
    return db
      .select({ articuloId: tarifaPrecios.articuloId, precio: tarifaPrecios.precio, referencia: articulos.referencia, nombre: articulos.nombre, pvp: articulos.precioVenta })
      .from(tarifaPrecios)
      .innerJoin(articulos, eq(articulos.id, tarifaPrecios.articuloId))
      .where(eq(tarifaPrecios.tarifaId, id))
      .orderBy(asc(articulos.referencia));
  });
  app.put('/tarifas/:id/precios', { preHandler: guard('catalogo.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.array(z.object({ articuloId: z.string().uuid(), precio: z.coerce.number().min(0) })), req.body);
    await db.transaction(async (tx) => {
      await tx.delete(tarifaPrecios).where(eq(tarifaPrecios.tarifaId, id));
      if (body.length) await tx.insert(tarifaPrecios).values(body.map((b) => ({ tarifaId: id, ...b })));
      await audit(tx, req.ctx, 'editar_precios', 'tarifa', id, { lineas: body.length });
    });
    return { ok: true };
  });
}
