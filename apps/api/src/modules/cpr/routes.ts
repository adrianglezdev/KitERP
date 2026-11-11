import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cprShared, round, toZod } from '@kite/shared';
import { db } from '../../db/client';
import { adjuntos, articulos, empresas, personas, terceros } from '../../db/schema/core';
import { documentoLineas, documentos } from '../../db/schema/documentos';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { fileBuffer, getFile, saveFile } from '../../core/files';
import { notify } from '../../core/notify';
import { can, canOnOwner, guard } from '../../core/permissions';
import { actualizarDocumento, cantidadesTrasladadas, cargarDocumento, crearDocumento, lineasDe, type LineaInput } from '../../services/documentos';
import { cprArticuloProveedor, cprIncidencias, cprSolicitudes } from './schema';
import { condicionesCompra, crearPedidosAgrupados, detectarFactura, propuestaCompra, textoPdf } from './service';

const { solicitudResource, articuloProveedorResource } = cprShared;
const SISTEMA = '00000000-0000-0000-0000-000000000000';
const usuarioDe = (ctx: Ctx) => (ctx.usuarioId === SISTEMA ? null : ctx.usuarioId);
const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

/** ¿Puede aprobar la solicitud? Su responsable (alcance equipo) o quien aprueba todo. Nadie aprueba lo suyo salvo con alcance "todo". */
export async function puedeAprobarSolicitud(ctx: Ctx, solicitanteId: string) {
  const s = ctx.perms.get('cpr.aprobar');
  if (!s) return false;
  if (solicitanteId === ctx.personaId) return s === 'todo';
  return canOnOwner(ctx, 'cpr.aprobar', solicitanteId);
}

export async function responsableDe(personaId: string) {
  const [p] = await db.select({ r: personas.responsableId }).from(personas).where(eq(personas.id, personaId));
  return p?.r ?? null;
}

export async function cprRoutes(app: FastifyInstance) {
  /* ── Solicitudes internas de compra ── */
  registerCrud(app, {
    path: '/solicitudes',
    resource: solicitudResource,
    table: cprSolicitudes,
    entity: 'cpr_solicitud',
    perms: { ver: ['cpr.ver', 'cpr.aprobar'], crear: 'cpr.solicitar' },
    scopeCol: cprSolicitudes.solicitanteId,
    hardDelete: true,
    beforeSave: async (tx, ctx, data, existing) => {
      if (!existing) {
        if (!ctx.personaId) throw badRequest('Tu usuario no está vinculado a una persona');
        data.solicitanteId = ctx.personaId;
        data.creadoPor = usuarioDe(ctx);
        // quien aprueba todas las compras no necesita pedirse permiso a sí mismo
        if (ctx.perms.get('cpr.aprobar') === 'todo') Object.assign(data, { estado: 'aprobada', aprobadorId: ctx.personaId, resueltoEn: new Date() });
        else data.estado = 'pendiente';
        if (data.articuloId && !data.importeEstimado) {
          const c = (await condicionesCompra(tx, ctx.empresaId, [data.articuloId])).get(data.articuloId);
          if (c?.precio) data.importeEstimado = round(c.precio * (data.cantidad ?? 1));
          if (!data.proveedorId && c?.proveedorId) data.proveedorId = c.proveedorId;
        }
        return data;
      }
      if (existing.solicitanteId !== ctx.personaId && !can(ctx, 'cpr.editar')) throw forbidden('Solo quien la pidió puede cambiar la solicitud');
      if (existing.estado !== 'pendiente' && !(existing.estado === 'aprobada' && can(ctx, 'cpr.editar'))) throw conflict('La solicitud ya está resuelta y no se puede cambiar');
      delete data.estado;
      delete data.solicitanteId;
      return data;
    },
    afterSave: async (tx, ctx, row, existing) => {
      if (existing || row.estado !== 'pendiente') return;
      const resp = await responsableDe(row.solicitanteId);
      await notify(tx, ctx, {
        modulo: 'cpr',
        tipo: 'solicitud',
        titulo: `${ctx.nombre} solicita: ${row.descripcion}`,
        cuerpo: row.importeEstimado ? `Importe estimado ${row.importeEstimado.toFixed(2)} €` : null,
        enlace: '/bandeja',
        ...(resp ? { personaIds: [resp] } : { permiso: 'cpr.aprobar' }),
      });
    },
    beforeDelete: async (_tx, ctx, row) => {
      if (row.solicitanteId !== ctx.personaId && !can(ctx, 'cpr.editar')) throw forbidden();
      if (row.estado === 'pedida') throw conflict('La solicitud ya está pedida al proveedor');
    },
  });

  app.post('/solicitudes/:id/aprobar', async (req) => resolverSolicitud(req.ctx, (req.params as { id: string }).id, true, null));
  app.post('/solicitudes/:id/rechazar', async (req) => {
    const { motivo } = parse(z.object({ motivo: z.string().trim().max(500).nullish() }), req.body ?? {});
    return resolverSolicitud(req.ctx, (req.params as { id: string }).id, false, motivo ?? null);
  });

  /** Agrupa solicitudes aprobadas por proveedor y crea un pedido a proveedor por cada uno. */
  app.post('/solicitudes/pedir', { preHandler: guard('cpr.editar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(z.object({ ids: z.array(z.string().uuid()).min(1, 'Selecciona alguna solicitud'), proveedorId: z.string().uuid().nullish() }), req.body);
    return db.transaction(async (tx) => {
      const sols = await tx.select().from(cprSolicitudes).where(and(eq(cprSolicitudes.empresaId, ctx.empresaId), inArray(cprSolicitudes.id, body.ids))).for('update');
      if (sols.length !== body.ids.length) throw notFound('Alguna solicitud no existe');
      const noAprob = sols.find((s) => s.estado !== 'aprobada');
      if (noAprob) throw conflict(`"${noAprob.descripcion}" no está aprobada${noAprob.estado === 'pedida' ? ' (ya está pedida)' : ''}`);
      const cond = await condicionesCompra(tx, ctx.empresaId, sols.map((s) => s.articuloId).filter(Boolean) as string[]);
      const lineas = sols.map((s) => {
        const proveedorId = body.proveedorId ?? s.proveedorId ?? (s.articuloId ? cond.get(s.articuloId)?.proveedorId : null);
        if (!proveedorId) throw badRequest(`Indica el proveedor de "${s.descripcion}"`);
        const precio = s.articuloId && cond.get(s.articuloId)?.precio ? null : s.importeEstimado ? round(s.importeEstimado / (s.cantidad || 1), 4) : 0;
        return { proveedorId, articuloId: s.articuloId, descripcion: s.descripcion, cantidad: s.cantidad, precio, proyectoId: s.proyectoId, nota: null, solicitud: s };
      });
      const pedidos = await crearPedidosAgrupados(tx, ctx, lineas, { origenTipo: 'cpr_solicitud', observaciones: null });
      for (const l of lineas) {
        const p = pedidos.find((x) => x.proveedorId === l.proveedorId)!;
        await tx.update(cprSolicitudes).set({ estado: 'pedida', documentoId: p.id }).where(eq(cprSolicitudes.id, l.solicitud.id));
        await audit(tx, ctx, 'pedir', 'cpr_solicitud', l.solicitud.id, { documentoId: p.id });
      }
      await notify(tx, ctx, { modulo: 'cpr', tipo: 'pedida', titulo: 'Tu solicitud de compra ya está pedida al proveedor', enlace: '/compras/solicitudes', personaIds: [...new Set(sols.map((s) => s.solicitanteId))] });
      return { pedidos };
    });
  });

  /* ── Precios por proveedor y comparativa ── */
  registerCrud(app, {
    path: '/articulo-proveedor',
    resource: articuloProveedorResource,
    table: cprArticuloProveedor,
    entity: 'cpr_articulo_proveedor',
    perms: { ver: ['cpr.editar', 'cpr.aprobar', 'catalogo.gestionar', 'stk.gestionar'], crear: 'cpr.editar' },
    hardDelete: true,
    afterSave: async (tx, ctx, row) => {
      if (row.preferente)
        await tx.update(cprArticuloProveedor).set({ preferente: false }).where(and(eq(cprArticuloProveedor.articuloId, row.articuloId), ne(cprArticuloProveedor.id, row.id)));
      void ctx;
    },
  });

  app.get('/comparativa/:articuloId', { preHandler: guard(['cpr.editar', 'cpr.aprobar', 'catalogo.gestionar']) }, async (req) => {
    const ctx = req.ctx;
    const { articuloId } = req.params as { articuloId: string };
    const ofertas = await db
      .select({ id: cprArticuloProveedor.id, proveedorId: cprArticuloProveedor.proveedorId, proveedor: terceros.nombre, referenciaProveedor: cprArticuloProveedor.referenciaProveedor, precio: cprArticuloProveedor.precio, descuento: cprArticuloProveedor.descuento, plazoDias: cprArticuloProveedor.plazoDias, cantidadMinima: cprArticuloProveedor.cantidadMinima, preferente: cprArticuloProveedor.preferente, actualizadoEn: cprArticuloProveedor.actualizadoEn })
      .from(cprArticuloProveedor)
      .innerJoin(terceros, eq(terceros.id, cprArticuloProveedor.proveedorId))
      .where(and(eq(cprArticuloProveedor.empresaId, ctx.empresaId), eq(cprArticuloProveedor.articuloId, articuloId)))
      .orderBy(asc(cprArticuloProveedor.precio));
    const historico = await db
      .select({ documentoId: documentos.id, codigo: documentos.codigo, tipo: documentos.tipo, fecha: documentos.fecha, proveedorId: documentos.terceroId, proveedor: terceros.nombre, cantidad: documentoLineas.cantidad, precio: documentoLineas.precio, descuento: documentoLineas.descuento })
      .from(documentoLineas)
      .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
      .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
      .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentoLineas.articuloId, articuloId), inArray(documentos.tipo, ['pedido_compra', 'factura_proveedor']), ne(documentos.estado, 'cancelado'), isNull(documentos.archivadoEn)))
      .orderBy(desc(documentos.fecha))
      .limit(30);
    const precios = ofertas.map((o) => o.precio * (1 - (o.descuento ?? 0) / 100));
    const minimo = precios.length ? Math.min(...precios) : null;
    return { ofertas: ofertas.map((o, i) => ({ ...o, precioNeto: round(precios[i]!, 4), sobreMinimoPct: minimo ? round(((precios[i]! - minimo) / minimo) * 100, 1) : 0 })), historico, minimo };
  });

  /* ── Propuesta de compra (stock mínimo → pedidos) ── */
  app.get('/propuesta', { preHandler: guard(['cpr.editar']) }, async (req) => {
    if (!req.ctx.modules.has('stk')) return { activo: false, lineas: [] };
    return { activo: true, lineas: await propuestaCompra(db, req.ctx.empresaId) };
  });

  app.post('/propuesta/generar', { preHandler: guard('cpr.editar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(
      z.object({ lineas: z.array(z.object({ articuloId: z.string().uuid(), proveedorId: z.string().uuid('Falta el proveedor de algún artículo'), cantidad: z.coerce.number().positive(), precio: z.coerce.number().min(0).nullish() })).min(1, 'Selecciona algún artículo') }),
      req.body,
    );
    return db.transaction(async (tx) => {
      const pedidos = await crearPedidosAgrupados(tx, ctx, body.lineas, { origenTipo: 'cpr_propuesta', observaciones: null });
      await audit(tx, ctx, 'propuesta_compra', 'cpr_propuesta', null, { pedidos: pedidos.map((p) => p.codigo) });
      return { pedidos };
    });
  });

  /* ── Recepción de mercancía ── */
  app.get('/recepciones-pendientes', { preHandler: guard(['cpr.recibir', 'cpr.editar']) }, async (req) => {
    const ctx = req.ctx;
    const rows = await db.execute<any>(sql`
      SELECT d.id, d.codigo, d.fecha, d.fecha_entrega, d.estado, d.total::float AS total, t.nombre AS proveedor, d.tercero_id,
             count(l.id)::int AS lineas,
             sum(greatest(l.cantidad - coalesce((SELECT sum(rl.cantidad) FROM documento_lineas rl JOIN documentos rd ON rd.id = rl.documento_id
                                                   WHERE rl.linea_origen_id = l.id AND rd.tipo = 'recepcion' AND rd.estado = 'confirmada'), 0), 0))::float AS pendiente,
             (SELECT r.id FROM documentos r WHERE r.documento_origen_id = d.id AND r.tipo = 'recepcion' AND r.estado = 'borrador' AND r.archivado_en IS NULL LIMIT 1) AS recepcion_borrador
        FROM documentos d
        JOIN terceros t ON t.id = d.tercero_id
        JOIN documento_lineas l ON l.documento_id = d.id AND l.tipo_linea = 'articulo'
       WHERE d.empresa_id = ${ctx.empresaId} AND d.tipo = 'pedido_compra' AND d.estado IN ('aprobado', 'enviado', 'parcial') AND d.archivado_en IS NULL
       GROUP BY d.id, t.nombre
      HAVING sum(greatest(l.cantidad - coalesce((SELECT sum(rl.cantidad) FROM documento_lineas rl JOIN documentos rd ON rd.id = rl.documento_id
                                                   WHERE rl.linea_origen_id = l.id AND rd.tipo = 'recepcion' AND rd.estado = 'confirmada'), 0), 0)) > 0
       ORDER BY d.fecha_entrega NULLS LAST, d.fecha`);
    const hoy = new Date().toISOString().slice(0, 10);
    return rows.map((r: any) => ({ id: r.id, codigo: r.codigo, fecha: r.fecha, fechaEntrega: r.fecha_entrega, estado: r.estado, total: r.total, proveedor: r.proveedor, terceroId: r.tercero_id, lineas: r.lineas, pendiente: r.pendiente, recepcionBorrador: r.recepcion_borrador, retrasado: !!r.fecha_entrega && r.fecha_entrega < hoy }));
  });

  /** Ajusta en el móvil lo recibido de verdad: cantidades, lotes, caducidades y series. */
  app.post('/recepciones/:id/lineas', { preHandler: guard(['cpr.recibir', 'cpr.editar']) }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        almacenId: z.string().uuid().nullish(),
        observaciones: z.string().max(5000).nullish(),
        lineas: z.array(z.object({ id: z.string().uuid(), cantidad: z.coerce.number().min(0), lote: z.string().trim().max(60).nullish(), caducidad: z.string().nullish(), series: z.array(z.string().trim().min(1)).nullish() })),
      }),
      req.body,
    );
    return db.transaction(async (tx) => {
      const d = await cargarDocumento(tx, ctx, id);
      if (d.tipo !== 'recepcion') throw badRequest('No es una recepción');
      if (d.estado !== 'borrador') throw conflict('La recepción ya está confirmada');
      const ls = await lineasDe(tx, id);
      const cambios = new Map(body.lineas.map((l) => [l.id, l]));
      const nuevas: LineaInput[] = [];
      for (const l of ls) {
        const c = cambios.get(l.id);
        const cantidad = c ? c.cantidad : l.cantidad;
        if (l.tipoLinea === 'articulo' && cantidad <= 0) continue;
        nuevas.push({
          id: l.id,
          tipoLinea: l.tipoLinea as 'articulo',
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
          almacenId: body.almacenId ?? l.almacenId,
          lote: c ? c.lote || null : l.lote,
          caducidad: c ? c.caducidad || null : l.caducidad,
          series: c ? (c.series?.length ? c.series : null) : l.series,
          lineaOrigenId: l.lineaOrigenId,
        });
      }
      if (!nuevas.some((l) => l.tipoLinea === 'articulo')) throw badRequest('No has recibido nada: si no ha llegado nada, borra la recepción');
      await actualizarDocumento(tx, ctx, id, {
        fecha: d.fecha,
        terceroId: d.terceroId,
        contactoId: d.contactoId,
        comercialId: d.comercialId,
        formaPagoId: d.formaPagoId,
        tarifaId: d.tarifaId,
        serieId: d.serieId,
        almacenId: body.almacenId ?? d.almacenId,
        proyectoId: d.proyectoId,
        fechaValidez: d.fechaValidez,
        fechaEntrega: d.fechaEntrega,
        fechaOperacion: d.fechaOperacion,
        descuentoGlobal: d.descuentoGlobal,
        titulo: d.titulo,
        observaciones: body.observaciones ?? d.observaciones,
        notasInternas: d.notasInternas,
        condiciones: d.condiciones,
        referenciaExterna: d.referenciaExterna,
        direccionEnvio: d.direccionEnvio,
        origenTipo: d.origenTipo,
        origenId: d.origenId,
        documentoOrigenId: d.documentoOrigenId,
        lineas: nuevas,
      });
      return { ok: true };
    });
  });

  /* ── Incidencias de recepción ── */
  app.get('/incidencias', { preHandler: guard(['cpr.ver', 'cpr.recibir']) }, async (req) => {
    const q = req.query as { documentoId?: string; terceroId?: string; estado?: string };
    const rows = await db
      .select({ i: cprIncidencias, articulo: articulos.nombre, referencia: articulos.referencia, documento: documentos.codigo, proveedor: terceros.nombre })
      .from(cprIncidencias)
      .leftJoin(articulos, eq(articulos.id, cprIncidencias.articuloId))
      .leftJoin(documentos, eq(documentos.id, cprIncidencias.documentoId))
      .leftJoin(terceros, eq(terceros.id, cprIncidencias.terceroId))
      .where(and(eq(cprIncidencias.empresaId, req.ctx.empresaId), q.documentoId ? eq(cprIncidencias.documentoId, q.documentoId) : undefined, q.terceroId ? eq(cprIncidencias.terceroId, q.terceroId) : undefined, q.estado ? eq(cprIncidencias.estado, q.estado) : undefined))
      .orderBy(desc(cprIncidencias.creadoEn))
      .limit(200);
    const { fileUrl } = await import('../../core/files');
    return rows.map((r) => ({ ...r.i, articulo: r.articulo, referencia: r.referencia, documento: r.documento, proveedor: r.proveedor, fotoUrl: fileUrl(r.i.archivoId) }));
  });

  const incSchema = toZod(cprShared.incidenciaResource).extend({ lineaId: z.string().uuid().nullish() });
  app.post('/incidencias', { preHandler: guard(['cpr.recibir', 'cpr.editar']) }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(incSchema, req.body) as Record<string, any>;
    const row = await db.transaction(async (tx) => {
      const d = await cargarDocumento(tx, ctx, body.documentoId);
      if (!['recepcion', 'pedido_compra'].includes(d.tipo)) throw badRequest('Las incidencias se registran sobre recepciones o pedidos a proveedor');
      const [r] = await tx
        .insert(cprIncidencias)
        .values({ empresaId: ctx.empresaId, documentoId: d.id, lineaId: body.lineaId ?? null, terceroId: d.terceroId, articuloId: body.articuloId ?? null, tipo: body.tipo, cantidad: body.cantidad ?? null, descripcion: body.descripcion, archivoId: body.archivoId ?? null, estado: 'abierta', creadoPor: usuarioDe(ctx) })
        .returning();
      if (body.archivoId) await tx.insert(adjuntos).values({ empresaId: ctx.empresaId, entidad: 'documento', entidadId: d.id, archivoId: body.archivoId, carpeta: 'Incidencias', descripcion: body.descripcion, subidoPor: usuarioDe(ctx) });
      await audit(tx, ctx, 'crear', 'cpr_incidencia', r!.id, { documento: d.codigo, tipo: body.tipo });
      await notify(tx, ctx, { modulo: 'cpr', tipo: 'incidencia', titulo: `Incidencia en ${d.codigo}: ${body.descripcion.slice(0, 80)}`, enlace: `/documentos/${d.id}`, permiso: 'cpr.editar' });
      return r!;
    });
    reply.code(201);
    return row;
  });

  app.post('/incidencias/:id/resolver', { preHandler: guard('cpr.editar') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.transaction(async (tx) => {
      const out = await tx.update(cprIncidencias).set({ estado: 'resuelta', resueltaEn: new Date() }).where(and(eq(cprIncidencias.id, id), eq(cprIncidencias.empresaId, req.ctx.empresaId))).returning();
      if (out.length) await audit(tx, req.ctx, 'resolver', 'cpr_incidencia', id);
      return out;
    });
    if (!r) throw notFound();
    return r;
  });

  /* ── Facturas de proveedor desde PDF ── */
  app.post('/facturas/analizar', { preHandler: guard('cpr.editar') }, async (req) => {
    const ctx = req.ctx;
    const file = await req.file();
    if (!file) throw badRequest('Sube el PDF de la factura');
    const data = await file.toBuffer();
    const esPdf = data.subarray(0, 5).toString('latin1') === '%PDF-';
    if (!esPdf) throw badRequest('Solo se pueden leer facturas en PDF con texto. Las fotos o escaneos no se leen: rellena los datos a mano.');
    const f = await saveFile(db, { empresaId: ctx.empresaId, nombre: file.filename || 'factura.pdf', mime: 'application/pdf', data, subidoPor: usuarioDe(ctx) });
    return analizar(ctx, f.id, data);
  });

  app.post('/facturas/analizar/:archivoId', { preHandler: guard('cpr.editar') }, async (req) => {
    const { archivoId } = req.params as { archivoId: string };
    const f = await getFile(db, archivoId);
    if (f.empresaId !== req.ctx.empresaId) throw notFound();
    return analizar(req.ctx, f.id, await fileBuffer(f.ruta));
  });

  app.post('/facturas/crear', { preHandler: guard('cpr.editar') }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(
      z.object({
        archivoId: z.string().uuid().nullish(),
        terceroId: z.string().uuid('Elige el proveedor'),
        numero: z.string().trim().min(1, 'Indica el número de factura').max(100),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
        base: z.coerce.number().nullish(),
        ivaTipo: z.coerce.number().min(0).max(100).nullish(),
        total: z.coerce.number().nullish(),
        recepcionIds: z.array(z.string().uuid()).default([]),
        proyectoId: z.string().uuid().nullish(),
      }),
      req.body,
    );
    const r = await db.transaction(async (tx) => {
      const lineas: LineaInput[] = [];
      let origenId: string | null = null;
      for (const rid of body.recepcionIds) {
        const rec = await cargarDocumento(tx, ctx, rid);
        if (rec.tipo !== 'recepcion' || rec.estado !== 'confirmada') throw badRequest(`${rec.codigo} no es una recepción confirmada`);
        if (rec.terceroId !== body.terceroId) throw badRequest(`${rec.codigo} es de otro proveedor`);
        origenId ??= rec.id;
        const ls = (await lineasDe(tx, rid)).filter((l) => l.tipoLinea === 'articulo');
        const ya = await cantidadesTrasladadas(tx, ls.map((l) => l.id), ['factura_proveedor']);
        if (body.recepcionIds.length > 1) lineas.push({ tipoLinea: 'capitulo', descripcion: `Recepción ${rec.codigo} del ${rec.fecha.split('-').reverse().join('/')}`, cantidad: 0, precio: 0, descuento: 0, ivaTipo: 21, retencion: 0, coste: 0 });
        for (const l of ls) {
          const pendiente = round(l.cantidad - (ya.get(l.id) ?? 0), 4);
          if (pendiente <= 0) continue;
          lineas.push({ tipoLinea: 'articulo', articuloId: l.articuloId, referencia: l.referencia, descripcion: l.descripcion, cantidad: pendiente, unidad: l.unidad, precio: l.precio, descuento: l.descuento, ivaTipo: l.ivaTipo, retencion: l.retencion, coste: l.coste, lineaOrigenId: l.id });
        }
      }
      if (!lineas.some((l) => l.tipoLinea === 'articulo')) {
        if (body.recepcionIds.length) throw conflict('Esas recepciones ya están facturadas');
        if (!body.base && !body.total) throw badRequest('Indica la base imponible o el total de la factura');
        const ivaTipo = body.ivaTipo ?? 21;
        const base = body.base ?? round((body.total ?? 0) / (1 + ivaTipo / 100));
        lineas.push({ tipoLinea: 'articulo', descripcion: `Según factura ${body.numero}`, cantidad: 1, precio: base, descuento: 0, ivaTipo, retencion: 0, coste: 0 });
      }
      const d = await crearDocumento(tx, ctx, {
        tipo: 'factura_proveedor',
        fecha: body.fecha,
        terceroId: body.terceroId,
        comercialId: ctx.personaId,
        referenciaExterna: body.numero,
        documentoOrigenId: origenId,
        proyectoId: body.proyectoId ?? null,
        descuentoGlobal: 0,
        lineas,
      });
      if (body.archivoId) {
        const f = await getFile(tx, body.archivoId);
        if (f.empresaId !== ctx.empresaId) throw notFound();
        await tx.insert(adjuntos).values({ empresaId: ctx.empresaId, entidad: 'documento', entidadId: d.id, archivoId: f.id, carpeta: 'Factura del proveedor', descripcion: `Factura ${body.numero}`, subidoPor: usuarioDe(ctx) });
      }
      let aviso: string | null = null;
      if (body.total != null && Math.abs(body.total - d.total) > 0.02) aviso = `El total de la factura (${body.total.toFixed(2)} €) no coincide con el de las líneas recibidas (${d.total.toFixed(2)} €). Revisa precios y cantidades antes de registrarla.`;
      await audit(tx, ctx, 'importar_pdf', 'documento', d.id, { numero: body.numero, recepciones: body.recepcionIds });
      return { id: d.id, total: d.total, aviso };
    });
    reply.code(201);
    return r;
  });

  /* ── Proveedores: valoración ── */
  app.get('/proveedores', { preHandler: guard(['cpr.editar', 'cpr.aprobar', 'cpr.ver']) }, async (req) => valoracionProveedores(req.ctx, null));
  app.get('/proveedores/:id', { preHandler: guard(['cpr.editar', 'cpr.aprobar', 'cpr.ver']) }, async (req) => {
    const { id } = req.params as { id: string };
    const [v] = await valoracionProveedores(req.ctx, id);
    if (!v) throw notFound('Proveedor no encontrado');
    const articulosProv = await db
      .select({ id: cprArticuloProveedor.id, articuloId: cprArticuloProveedor.articuloId, referencia: articulos.referencia, nombre: articulos.nombre, referenciaProveedor: cprArticuloProveedor.referenciaProveedor, precio: cprArticuloProveedor.precio, plazoDias: cprArticuloProveedor.plazoDias, preferente: cprArticuloProveedor.preferente })
      .from(cprArticuloProveedor)
      .innerJoin(articulos, eq(articulos.id, cprArticuloProveedor.articuloId))
      .where(and(eq(cprArticuloProveedor.proveedorId, id), eq(cprArticuloProveedor.empresaId, req.ctx.empresaId)))
      .orderBy(asc(articulos.referencia));
    const incidencias = await db.select().from(cprIncidencias).where(and(eq(cprIncidencias.terceroId, id), eq(cprIncidencias.empresaId, req.ctx.empresaId))).orderBy(desc(cprIncidencias.creadoEn)).limit(20);
    return { ...v, articulos: articulosProv, incidencias };
  });
}

async function resolverSolicitud(ctx: Ctx, id: string, aprobar: boolean, motivo: string | null) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(cprSolicitudes).where(and(eq(cprSolicitudes.id, id), eq(cprSolicitudes.empresaId, ctx.empresaId))).for('update');
    if (!s) throw notFound('Solicitud no encontrada');
    if (!(await puedeAprobarSolicitud(ctx, s.solicitanteId))) throw forbidden(s.solicitanteId === ctx.personaId ? 'No puedes aprobar tus propias solicitudes' : 'Solo su responsable puede aprobar esta solicitud');
    if (s.estado !== 'pendiente') throw conflict('La solicitud ya está resuelta');
    const [after] = await tx
      .update(cprSolicitudes)
      .set({ estado: aprobar ? 'aprobada' : 'rechazada', aprobadorId: ctx.personaId, resueltoEn: new Date(), motivoRechazo: aprobar ? null : motivo })
      .where(eq(cprSolicitudes.id, id))
      .returning();
    await audit(tx, ctx, aprobar ? 'aprobar' : 'rechazar', 'cpr_solicitud', id, motivo ? { motivo } : null);
    await notify(tx, ctx, {
      modulo: 'cpr',
      tipo: aprobar ? 'aprobada' : 'rechazada',
      titulo: aprobar ? `Solicitud aprobada: ${s.descripcion}` : `Solicitud rechazada: ${s.descripcion}`,
      cuerpo: motivo,
      enlace: '/compras/solicitudes',
      personaIds: [s.solicitanteId],
    });
    if (aprobar) await notify(tx, ctx, { modulo: 'cpr', tipo: 'para_pedir', titulo: `Compra aprobada para pedir: ${s.descripcion}`, enlace: '/compras/solicitudes?estado=aprobada', permiso: 'cpr.editar' });
    return after;
  });
}

async function analizar(ctx: Ctx, archivoId: string, data: Buffer) {
  let texto = '';
  try {
    texto = await textoPdf(data);
  } catch {
    throw badRequest('No se ha podido leer el PDF. Comprueba que no esté protegido con contraseña.');
  }
  const [emp] = await db.select({ nif: empresas.nif }).from(empresas).where(eq(empresas.id, ctx.empresaId));
  if (texto.replace(/\s/g, '').length < 20)
    return { archivoId, detectado: null, recepciones: [], aviso: 'El PDF no tiene texto (parece escaneado o una foto). Solo se leen PDF con texto: rellena los datos a mano.' };
  const det = detectarFactura(texto, emp?.nif);
  let proveedor: { id: string; nombre: string } | undefined;
  if (det.nifs.length) {
    [proveedor] = await db
      .select({ id: terceros.id, nombre: terceros.nombre })
      .from(terceros)
      .where(and(eq(terceros.empresaId, ctx.empresaId), inArray(sql`upper(replace(replace(${terceros.nif}, '-', ''), ' ', ''))`, det.nifs), isNull(terceros.archivadoEn)))
      .limit(1);
  }
  const recepciones = proveedor ? await recepcionesSinFacturar(ctx, proveedor.id) : [];
  let aviso: string | null = null;
  if (!proveedor) aviso = det.nif ? `No hay ningún proveedor con NIF ${det.nif}. Créalo o elígelo a mano.` : 'No se ha encontrado el NIF del proveedor en el PDF.';
  const detectado: cprShared.FacturaDetectada = { nif: det.nif, numero: det.numero, fecha: det.fecha, base: det.base, iva: det.iva, ivaTipo: det.ivaTipo, total: det.total, proveedorId: proveedor?.id ?? null, proveedor: proveedor?.nombre ?? null };
  // si una recepción coincide con la base, se propone
  const sugeridas = det.base ? recepciones.filter((r) => Math.abs(r.pendienteBase - det.base!) < 0.05).map((r) => r.id) : [];
  return { archivoId, detectado, recepciones, sugeridas, aviso, texto: texto.slice(0, 3000) };
}

/** Recepciones confirmadas de un proveedor con algo pendiente de facturar. */
export async function recepcionesSinFacturar(ctx: Ctx, proveedorId: string) {
  const rows = await db.execute<any>(sql`
    SELECT d.id, d.codigo, d.fecha, d.base_imponible::float AS base, d.total::float AS total,
           sum(greatest(l.cantidad - coalesce((SELECT sum(fl.cantidad) FROM documento_lineas fl JOIN documentos fd ON fd.id = fl.documento_id
                                               WHERE fl.linea_origen_id = l.id AND fd.tipo = 'factura_proveedor' AND fd.archivado_en IS NULL), 0), 0) * l.precio * (1 - l.descuento / 100))::float AS pendiente_base
      FROM documentos d
      JOIN documento_lineas l ON l.documento_id = d.id AND l.tipo_linea = 'articulo'
     WHERE d.empresa_id = ${ctx.empresaId} AND d.tercero_id = ${proveedorId} AND d.tipo = 'recepcion' AND d.estado = 'confirmada' AND d.archivado_en IS NULL
     GROUP BY d.id
    HAVING sum(greatest(l.cantidad - coalesce((SELECT sum(fl.cantidad) FROM documento_lineas fl JOIN documentos fd ON fd.id = fl.documento_id
                                               WHERE fl.linea_origen_id = l.id AND fd.tipo = 'factura_proveedor' AND fd.archivado_en IS NULL), 0), 0)) > 0
     ORDER BY d.fecha DESC LIMIT 30`);
  return rows.map((r: any) => ({ id: r.id, codigo: r.codigo, fecha: r.fecha, base: r.base, total: r.total, pendienteBase: round(r.pendiente_base) }));
}

export interface ValoracionProveedor {
  id: string;
  nombre: string;
  nif: string | null;
  localidad: string | null;
  telefono: string | null;
  email: string | null;
  pedidos: number;
  compradoAnio: number;
  recepciones: number;
  aTiempo: number;
  puntualidadPct: number | null;
  retrasoMedioDias: number | null;
  plazoMedioDias: number | null;
  incidencias: number;
  incidenciasAbiertas: number;
  pendienteRecibir: number;
  indicePrecio: number | null;
  nota: number | null;
}

/** Valoración de proveedores: puntualidad (real frente a prometido), incidencias y precio frente al más barato. */
export async function valoracionProveedores(ctx: Ctx, soloId: string | null): Promise<ValoracionProveedor[]> {
  const anio = new Date().getFullYear();
  const rows = await db.execute<any>(sql`
    WITH prov AS (
      SELECT t.id, t.nombre, t.nif, t.localidad, t.telefono, t.email FROM terceros t
       WHERE t.empresa_id = ${ctx.empresaId} AND t.es_proveedor AND t.archivado_en IS NULL ${soloId ? sql`AND t.id = ${soloId}` : sql``}
    ),
    plazo AS (
      SELECT proveedor_id, avg(plazo_dias)::float AS dias FROM cpr_articulo_proveedor WHERE empresa_id = ${ctx.empresaId} GROUP BY proveedor_id
    ),
    rec AS (
      SELECT p.tercero_id, r.fecha AS fecha_rec, p.fecha AS fecha_ped,
             coalesce(p.fecha_entrega, p.fecha + coalesce(round(pl.dias)::int, 3)) AS prometida
        FROM documentos r
        JOIN documentos p ON p.id = r.documento_origen_id AND p.tipo = 'pedido_compra'
        LEFT JOIN plazo pl ON pl.proveedor_id = p.tercero_id
       WHERE r.empresa_id = ${ctx.empresaId} AND r.tipo = 'recepcion' AND r.estado = 'confirmada'
    ),
    precio AS (
      SELECT ap.proveedor_id, avg(ap.precio / nullif(m.minimo, 0))::float AS indice
        FROM cpr_articulo_proveedor ap
        JOIN (SELECT articulo_id, min(precio) AS minimo, count(*) AS n FROM cpr_articulo_proveedor WHERE empresa_id = ${ctx.empresaId} GROUP BY articulo_id) m ON m.articulo_id = ap.articulo_id AND m.n > 1
       WHERE ap.empresa_id = ${ctx.empresaId}
       GROUP BY ap.proveedor_id
    )
    SELECT prov.*,
           (SELECT count(*)::int FROM documentos d WHERE d.tercero_id = prov.id AND d.tipo = 'pedido_compra' AND d.estado <> 'cancelado' AND d.archivado_en IS NULL) AS pedidos,
           (SELECT coalesce(sum(d.base_imponible), 0)::float FROM documentos d WHERE d.tercero_id = prov.id AND d.tipo = 'factura_proveedor' AND d.bloqueado AND extract(year FROM d.fecha) = ${anio}) AS comprado_anio,
           (SELECT coalesce(sum(d.base_imponible), 0)::float FROM documentos d WHERE d.tercero_id = prov.id AND d.tipo = 'pedido_compra' AND d.estado IN ('aprobado', 'enviado', 'parcial')) AS pendiente_recibir,
           (SELECT count(*)::int FROM rec WHERE rec.tercero_id = prov.id) AS recepciones,
           (SELECT count(*)::int FROM rec WHERE rec.tercero_id = prov.id AND rec.fecha_rec <= rec.prometida) AS a_tiempo,
           (SELECT avg(greatest(rec.fecha_rec - rec.prometida, 0))::float FROM rec WHERE rec.tercero_id = prov.id) AS retraso_medio,
           (SELECT avg(rec.fecha_rec - rec.fecha_ped)::float FROM rec WHERE rec.tercero_id = prov.id) AS plazo_medio,
           (SELECT count(*)::int FROM cpr_incidencias i WHERE i.tercero_id = prov.id) AS incidencias,
           (SELECT count(*)::int FROM cpr_incidencias i WHERE i.tercero_id = prov.id AND i.estado = 'abierta') AS incidencias_abiertas,
           (SELECT indice FROM precio WHERE precio.proveedor_id = prov.id) AS indice_precio
      FROM prov
     ORDER BY prov.nombre`);
  return rows.map((r: any) => {
    const puntualidad = r.recepciones ? r.a_tiempo / r.recepciones : null;
    const calidad = r.recepciones ? Math.max(0, 1 - r.incidencias / r.recepciones) : null;
    const precio = r.indice_precio ? Math.min(1, 1 / r.indice_precio) : 1;
    const nota = puntualidad === null ? null : round(10 * (0.5 * puntualidad + 0.3 * (calidad ?? 1) + 0.2 * precio), 1);
    return {
      id: r.id,
      nombre: r.nombre,
      nif: r.nif,
      localidad: r.localidad,
      telefono: r.telefono,
      email: r.email,
      pedidos: r.pedidos,
      compradoAnio: round(r.comprado_anio),
      recepciones: r.recepciones,
      aTiempo: r.a_tiempo,
      puntualidadPct: puntualidad === null ? null : round(puntualidad * 100, 0),
      retrasoMedioDias: r.retraso_medio === null ? null : round(r.retraso_medio, 1),
      plazoMedioDias: r.plazo_medio === null ? null : round(r.plazo_medio, 1),
      incidencias: r.incidencias,
      incidenciasAbiertas: r.incidencias_abiertas,
      pendienteRecibir: round(r.pendiente_recibir),
      indicePrecio: r.indice_precio === null ? null : round(r.indice_precio, 3),
      nota,
    };
  });
}
