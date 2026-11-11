import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { satShared } from '@kite/shared';
import { config } from '../../config';
import { db } from '../../db/client';
import { articulos, empresas, personas, terceros } from '../../db/schema/core';
import { documentos, documentosRecurrentes } from '../../db/schema/documentos';
import { audit, diff } from '../../core/audit';
import { randomToken } from '../../core/auth';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { fileUrl } from '../../core/files';
import { notify } from '../../core/notify';
import { nextCode } from '../../core/numbering';
import { can, canOnOwner, guard, scopeCondition } from '../../core/permissions';
import { BRAND, pdfToBuffer } from '../../core/pdf';
import { crearDocumento, documentoSchema, ejecutarAccion } from '../../services/documentos';
import { precioPara } from '../../routes/terceros';
import { satChecklists, satContratos, satEquipos, satOrdenMateriales, satOrdenTiempos, satOrdenes, satTickets } from './schema';
import {
  almacenDeTecnico,
  cargarOrden,
  cargarTicket,
  checklistDe,
  cerrarOrden,
  cierreSchema,
  contactoDe,
  diaMadrid,
  docCtx,
  generarPreventivos,
  madridDay,
  needAsignar,
  needEditarOrden,
  nombrePersona,
  parseFechaHora,
  prepararOrdenNueva,
  prepararTicketNuevo,
  recalcularTicket,
  sincronizarRecurrente,
  sinNulos,
  slaInfo,
  slaPara,
} from './service';
import { publicRoutes } from './public';

const { ticketResource, ordenResource, equipoResource, contratoResource, checklistResource, mapsUrl, TICKET_ESTADOS } = satShared;

const minutosEntre = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

async function personaNombre(id: string | null | undefined) {
  if (!id) return null;
  const [p] = await db.select({ id: personas.id, nombre: nombrePersona, telefono: personas.telefono }).from(personas).where(eq(personas.id, id));
  return p ?? null;
}

export async function satRoutes(app: FastifyInstance) {
  await publicRoutes(app);

  /* ═════════════ Tickets ═════════════ */
  registerCrud(app, {
    path: '/tickets',
    resource: ticketResource,
    table: satTickets,
    entity: 'sat_ticket',
    perms: { ver: 'sat.ver', crear: 'sat.editar', borrar: 'sat.planificar' },
    scopeCol: satTickets.responsableId,
    only: ['list', 'get', 'create', 'update', 'delete'],
    transformOut: (r) => {
      const { portalToken: _p, ...rest } = r;
      return { ...rest, sla: r.venceRespuesta ? slaInfo(r as any) : null };
    },
    beforeSave: async (tx, ctx, data, existing) => {
      sinNulos(data, ['prioridad', 'canal']);
      if (!existing) {
        // quien no planifica abre los tickets a su nombre
        if (ctx.perms.get('sat.editar') !== 'todo' && !can(ctx, 'sat.planificar')) data.responsableId = ctx.personaId;
        needAsignar(ctx, data.responsableId);
        return prepararTicketNuevo(tx, ctx, data);
      }
      if (['cerrado'].includes(existing.estado)) throw conflict('El ticket está cerrado');
      if (data.responsableId !== undefined) needAsignar(ctx, data.responsableId, existing.responsableId);
      if (data.terceroId && data.terceroId !== existing.terceroId) throw badRequest('No se puede cambiar el cliente de un ticket');
      if (data.prioridad && data.prioridad !== existing.prioridad) {
        const sla = await slaPara(tx, ctx.empresaId, { terceroId: existing.terceroId, contratoId: existing.contratoId, equipoId: data.equipoId ?? existing.equipoId, prioridad: data.prioridad });
        const base = new Date(existing.creadoEn).getTime();
        Object.assign(data, { slaRespuestaHoras: sla.respuesta, slaResolucionHoras: sla.resolucion, venceRespuesta: new Date(base + sla.respuesta * 3600_000), venceResolucion: new Date(base + sla.resolucion * 3600_000) });
      }
      if (data.responsableId && existing.estado === 'nuevo') Object.assign(data, { estado: 'asignado', primeraRespuestaEn: existing.primeraRespuestaEn ?? new Date() });
      return data;
    },
    afterSave: async (tx, ctx, row, existing) => {
      if (row.responsableId && row.responsableId !== existing?.responsableId && row.responsableId !== ctx.personaId)
        await notify(tx, ctx, { modulo: 'sat', tipo: 'asignado', titulo: `Ticket ${row.codigo} asignado`, cuerpo: row.asunto, enlace: `/sat/tickets/${row.id}`, personaIds: [row.responsableId] });
      if (!existing && !row.responsableId)
        await notify(tx, ctx, { modulo: 'sat', tipo: 'nuevo', titulo: `Nuevo ticket ${row.codigo}`, cuerpo: row.asunto, enlace: `/sat/tickets/${row.id}`, permiso: 'sat.planificar' });
    },
  });

  app.get('/tickets/:id/ficha', async (req) => {
    const ctx = req.ctx;
    const t = await cargarTicket(ctx, (req.params as { id: string }).id);
    const [cliente] = await db.select({ id: terceros.id, nombre: terceros.nombre, telefono: terceros.telefono, email: terceros.email, portalToken: terceros.portalToken }).from(terceros).where(eq(terceros.id, t.terceroId));
    const [equipo] = t.equipoId ? await db.select().from(satEquipos).where(eq(satEquipos.id, t.equipoId)) : [];
    const [contrato] = t.contratoId ? await db.select({ id: satContratos.id, codigo: satContratos.codigo, nombre: satContratos.nombre }).from(satContratos).where(eq(satContratos.id, t.contratoId)) : [];
    const ords = await db
      .select({ id: satOrdenes.id, codigo: satOrdenes.codigo, estado: satOrdenes.estado, tipo: satOrdenes.tipo, tecnicoId: satOrdenes.tecnicoId, tecnico: nombrePersona, planificadaInicio: satOrdenes.planificadaInicio, finalizadaEn: satOrdenes.finalizadaEn })
      .from(satOrdenes)
      .leftJoin(personas, eq(personas.id, satOrdenes.tecnicoId))
      .where(and(eq(satOrdenes.ticketId, t.id), isNull(satOrdenes.archivadoEn)))
      .orderBy(asc(satOrdenes.creadoEn));
    const { portalToken, ...rest } = t;
    return {
      ...rest,
      sla: slaInfo(t),
      cliente: cliente ? { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono, email: cliente.email } : null,
      contacto: await contactoDe(db, t.contactoId),
      equipo: equipo ? { id: equipo.id, nombre: equipo.nombre, marca: equipo.marca, modelo: equipo.modelo, numeroSerie: equipo.numeroSerie, ubicacion: equipo.ubicacion, garantiaHasta: equipo.garantiaHasta } : null,
      contrato: contrato ?? null,
      responsable: await personaNombre(t.responsableId),
      ordenes: ords.map((o) => (ctx.perms.get('sat.ver') === 'todo' || o.tecnicoId === ctx.personaId ? o : { ...o, id: null })),
      puedeEditar: await canOnOwner(ctx, 'sat.editar', t.responsableId ?? ctx.personaId),
      puedePlanificar: can(ctx, 'sat.planificar'),
      enlacePortal: cliente?.portalToken ? `${config.appUrl}/publico/sat/${cliente.portalToken}` : null,
      enlaceSeguimiento: `${config.appUrl}/publico/sat/ticket/${portalToken}`,
    };
  });

  app.post('/tickets/:id/estado', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(z.object({ estado: z.enum(TICKET_ESTADOS.map((e) => e.value) as [string, ...string[]]), nota: z.string().max(2000).nullish() }), req.body);
    const t = await cargarTicket(ctx, id);
    if (!(await canOnOwner(ctx, 'sat.editar', t.responsableId ?? ctx.personaId))) throw forbidden();
    if (t.estado === body.estado) return t;
    if (t.estado === 'cerrado' && !can(ctx, 'sat.planificar')) throw conflict('El ticket está cerrado');
    const ahora = new Date();
    const set: Partial<typeof satTickets.$inferInsert> = { estado: body.estado };
    if (body.estado !== 'nuevo' && !t.primeraRespuestaEn) set.primeraRespuestaEn = ahora;
    if (body.estado === 'resuelto') Object.assign(set, { resueltoEn: ahora, slaIncumplido: t.slaIncumplido || ahora > t.venceResolucion });
    if (body.estado === 'cerrado') Object.assign(set, { cerradoEn: ahora, resueltoEn: t.resueltoEn ?? ahora, slaIncumplido: t.slaIncumplido || (!t.resueltoEn && ahora > t.venceResolucion) });
    if (['nuevo', 'asignado', 'en_curso', 'esperando_cliente'].includes(body.estado)) Object.assign(set, { resueltoEn: null, cerradoEn: null });
    return db.transaction(async (tx) => {
      const [after] = await tx.update(satTickets).set(set).where(eq(satTickets.id, id)).returning();
      await audit(tx, ctx, `estado_${body.estado}`, 'sat_ticket', id, { antes: t.estado, nota: body.nota ?? null });
      const { portalToken: _p, ...rest } = after!;
      return rest;
    });
  });

  /** Crear una orden de trabajo a partir de un ticket. */
  const ordenDesdeTicket = z.object({
    tecnicoId: z.string().uuid().nullish(),
    planificadaInicio: z.string().nullish(),
    planificadaFin: z.string().nullish(),
    tipo: z.enum(['correctivo', 'preventivo', 'instalacion']).default('correctivo'),
    descripcion: z.string().max(5000).nullish(),
    checklistId: z.string().uuid().nullish(),
    facturable: z.boolean().nullish(),
  });
  app.post('/tickets/:id/orden', async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(ordenDesdeTicket, req.body);
    const t = await cargarTicket(ctx, (req.params as { id: string }).id);
    if (!can(ctx, 'sat.editar')) throw forbidden();
    if (t.estado === 'cerrado') throw conflict('El ticket está cerrado');
    let tecnicoId = body.tecnicoId ?? (can(ctx, 'sat.planificar') ? null : ctx.personaId);
    if (!can(ctx, 'sat.planificar')) tecnicoId = ctx.personaId;
    needAsignar(ctx, tecnicoId);
    const row = await db.transaction(async (tx) => {
      const data = await prepararOrdenNueva(tx, ctx, {
        terceroId: t.terceroId,
        ticketId: t.id,
        equipoId: t.equipoId,
        contratoId: t.contratoId,
        tipo: body.tipo,
        prioridad: t.prioridad,
        descripcion: body.descripcion ?? `${t.asunto}${t.descripcion ? `\n\n${t.descripcion}` : ''}`,
        tecnicoId,
        checklistId: body.checklistId ?? null,
        facturable: body.facturable ?? true,
        planificadaInicio: parseFechaHora(body.planificadaInicio),
        planificadaFin: parseFechaHora(body.planificadaFin),
      });
      const [o] = await tx
        .insert(satOrdenes)
        .values({ ...(data as typeof satOrdenes.$inferInsert), empresaId: ctx.empresaId, creadoPor: ctx.usuarioId })
        .returning();
      await audit(tx, ctx, 'crear', 'sat_orden', o!.id, diff(null, o));
      await recalcularTicket(tx, ctx, t.id);
      if (o!.tecnicoId && o!.tecnicoId !== ctx.personaId)
        await notify(tx, ctx, { modulo: 'sat', tipo: 'orden', titulo: `Nueva orden ${o!.codigo}`, cuerpo: t.asunto, enlace: `/sat/ordenes/${o!.id}`, personaIds: [o!.tecnicoId] });
      return o!;
    });
    reply.code(201);
    return row;
  });

  /* ═════════════ Órdenes de trabajo ═════════════ */
  registerCrud(app, {
    path: '/ordenes',
    resource: ordenResource,
    table: satOrdenes,
    entity: 'sat_orden',
    perms: { ver: 'sat.ver', crear: 'sat.editar', borrar: 'sat.planificar' },
    scopeCol: satOrdenes.tecnicoId,
    transformOut: (r) => {
      const { cierreUid: _u, ...rest } = r;
      return rest;
    },
    beforeSave: async (tx, ctx, data, existing) => {
      sinNulos(data, ['facturable', 'tipo', 'prioridad']);
      for (const k of ['planificadaInicio', 'planificadaFin']) if (data[k] !== undefined) data[k] = parseFechaHora(data[k]);
      if (data.planificadaInicio && data.planificadaFin && data.planificadaFin <= data.planificadaInicio) throw badRequest('El fin previsto debe ser posterior al inicio');
      if (!existing) {
        if (!can(ctx, 'sat.planificar')) data.tecnicoId = ctx.personaId;
        needAsignar(ctx, data.tecnicoId);
        return prepararOrdenNueva(tx, ctx, data);
      }
      if (['finalizada', 'cancelada'].includes(existing.estado)) throw conflict(`La orden está ${existing.estado}`);
      if (data.terceroId && data.terceroId !== existing.terceroId) throw badRequest('No se puede cambiar el cliente de una orden');
      if (data.tecnicoId !== undefined) needAsignar(ctx, data.tecnicoId, existing.tecnicoId);
      if (data.checklistId !== undefined && data.checklistId !== existing.checklistId) data.checklist = await checklistDe(tx, data.checklistId);
      const tecnico = data.tecnicoId !== undefined ? data.tecnicoId : existing.tecnicoId;
      const inicio = data.planificadaInicio !== undefined ? data.planificadaInicio : existing.planificadaInicio;
      if (existing.estado === 'pendiente' && tecnico && inicio) data.estado = 'planificada';
      if (existing.estado === 'planificada' && (!tecnico || !inicio)) data.estado = 'pendiente';
      return data;
    },
    afterSave: async (tx, ctx, row, existing) => {
      if (row.tecnicoId && row.tecnicoId !== existing?.tecnicoId && row.tecnicoId !== ctx.personaId)
        await notify(tx, ctx, { modulo: 'sat', tipo: 'orden', titulo: `Orden ${row.codigo} asignada`, cuerpo: row.descripcion?.slice(0, 140) ?? null, enlace: `/sat/ordenes/${row.id}`, personaIds: [row.tecnicoId] });
      await recalcularTicket(tx, ctx, row.ticketId);
    },
  });

  app.get('/ordenes/:id/ficha', async (req) => {
    const ctx = req.ctx;
    const o = await cargarOrden(ctx, (req.params as { id: string }).id);
    const [cliente] = await db.select({ id: terceros.id, nombre: terceros.nombre, telefono: terceros.telefono, email: terceros.email }).from(terceros).where(eq(terceros.id, o.terceroId));
    const [equipo] = o.equipoId ? await db.select().from(satEquipos).where(eq(satEquipos.id, o.equipoId)) : [];
    const [contrato] = o.contratoId ? await db.select({ id: satContratos.id, codigo: satContratos.codigo, nombre: satContratos.nombre }).from(satContratos).where(eq(satContratos.id, o.contratoId)) : [];
    const [ticket] = o.ticketId ? await db.select().from(satTickets).where(eq(satTickets.id, o.ticketId)) : [];
    const materiales = await db
      .select({ id: satOrdenMateriales.id, articuloId: satOrdenMateriales.articuloId, referencia: articulos.referencia, descripcion: sql<string>`coalesce(${satOrdenMateriales.descripcion}, ${articulos.nombre})`, unidad: articulos.unidad, cantidad: satOrdenMateriales.cantidad, almacenId: satOrdenMateriales.almacenId })
      .from(satOrdenMateriales)
      .innerJoin(articulos, eq(articulos.id, satOrdenMateriales.articuloId))
      .where(eq(satOrdenMateriales.ordenId, o.id));
    const tiempos = await db
      .select({ id: satOrdenTiempos.id, personaId: satOrdenTiempos.personaId, persona: nombrePersona, inicio: satOrdenTiempos.inicio, fin: satOrdenTiempos.fin, minutos: satOrdenTiempos.minutos, origen: satOrdenTiempos.origen })
      .from(satOrdenTiempos)
      .innerJoin(personas, eq(personas.id, satOrdenTiempos.personaId))
      .where(eq(satOrdenTiempos.ordenId, o.id))
      .orderBy(asc(satOrdenTiempos.inicio));
    const docs = await db
      .select({ id: documentos.id, tipo: documentos.tipo, codigo: documentos.codigo, estado: documentos.estado, total: documentos.total, tokenPublico: documentos.tokenPublico })
      .from(documentos)
      .where(and(eq(documentos.origenTipo, 'sat_orden'), eq(documentos.origenId, o.id), isNull(documentos.archivadoEn)))
      .orderBy(desc(documentos.creadoEn));
    const doc = (d: (typeof docs)[number] | undefined) => (d ? { id: d.id, codigo: d.codigo, estado: d.estado, total: d.total, enlace: d.tokenPublico ? `${config.appUrl}/p/${d.tokenPublico}` : null } : null);
    const { cierreUid: _u, ...rest } = o;
    return {
      ...rest,
      cliente: cliente ?? null,
      contacto: await contactoDe(db, ticket?.contactoId ?? null),
      equipo: equipo ? { id: equipo.id, nombre: equipo.nombre, marca: equipo.marca, modelo: equipo.modelo, numeroSerie: equipo.numeroSerie, ubicacion: equipo.ubicacion, garantiaHasta: equipo.garantiaHasta, articuloId: equipo.articuloId } : null,
      contrato: contrato ?? null,
      ticket: ticket ? { id: ticket.id, codigo: ticket.codigo, asunto: ticket.asunto, estado: ticket.estado } : null,
      tecnico: await personaNombre(o.tecnicoId),
      materiales,
      tiempos,
      cronometro: tiempos.find((t) => !t.fin && t.personaId === ctx.personaId) ?? null,
      minutosTotales: tiempos.reduce((s, t) => s + (t.minutos ?? (t.fin ? 0 : minutosEntre(t.inicio, new Date()))), 0),
      firmaUrl: fileUrl(o.firmaArchivoId),
      albaran: doc(docs.find((d) => d.tipo === 'albaran')),
      presupuesto: doc(docs.find((d) => d.tipo === 'presupuesto')),
      almacenDefecto: o.estado === 'finalizada' ? null : await db.transaction((tx) => almacenDeTecnico(tx, ctx, o.tecnicoId)),
      mapsUrl: mapsUrl(o.direccion),
      puedeEditar: await canOnOwner(ctx, 'sat.editar', o.tecnicoId),
      puedePlanificar: can(ctx, 'sat.planificar'),
      modulos: { ped: ctx.modules.has('ped'), pre: ctx.modules.has('pre'), stk: ctx.modules.has('stk'), dtc: ctx.modules.has('dtc') },
    };
  });

  /** Cambios de estado desde el móvil: en ruta, empezar, volver a planificada, cancelar. */
  app.post('/ordenes/:id/estado', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(z.object({ estado: z.enum(['pendiente', 'planificada', 'en_ruta', 'en_curso', 'cancelada']), motivo: z.string().max(1000).nullish(), cronometro: z.boolean().default(true), en: z.string().datetime({ offset: true }).nullish() }), req.body);
    return db.transaction(async (tx) => {
      const [o] = await tx.select().from(satOrdenes).where(eq(satOrdenes.id, id)).for('update');
      if (!o || o.empresaId !== ctx.empresaId || !(await canOnOwner(ctx, 'sat.ver', o.tecnicoId))) throw notFound('Orden no encontrada');
      await needEditarOrden(ctx, o);
      if (o.estado === body.estado) return o;
      if (['finalizada', 'cancelada'].includes(o.estado)) throw conflict(`La orden está ${o.estado}`);
      if (body.estado === 'cancelada' && !can(ctx, 'sat.planificar')) throw forbidden('Solo quien planifica puede cancelar una orden');
      if (['en_ruta', 'en_curso'].includes(body.estado) && !o.tecnicoId) throw badRequest('Asigna antes un técnico');
      // un cambio hecho sin cobertura llega más tarde con la hora en que se hizo
      const ahora = body.en && new Date(body.en) < new Date() && Date.now() - new Date(body.en).getTime() < 86400_000 ? new Date(body.en) : new Date();
      const set: Partial<typeof satOrdenes.$inferInsert> = { estado: body.estado };
      if (body.estado === 'en_ruta') set.enRutaEn = ahora;
      if (body.estado === 'en_curso') set.iniciadaEn = o.iniciadaEn ?? ahora;
      if (body.estado === 'cancelada') set.canceladaMotivo = body.motivo ?? null;
      const [after] = await tx.update(satOrdenes).set(set).where(eq(satOrdenes.id, id)).returning();
      // al empezar se pone en marcha el cronómetro de quien la empieza
      const personaId = ctx.personaId ?? o.tecnicoId;
      if (body.estado === 'en_curso' && personaId && body.cronometro) {
        const [abierto] = await tx.select({ id: satOrdenTiempos.id }).from(satOrdenTiempos).where(and(eq(satOrdenTiempos.ordenId, id), eq(satOrdenTiempos.personaId, personaId), isNull(satOrdenTiempos.fin)));
        if (!abierto) await tx.insert(satOrdenTiempos).values({ ordenId: id, personaId, inicio: ahora });
      }
      if (body.estado !== 'en_curso') {
        const abiertos = await tx.select().from(satOrdenTiempos).where(and(eq(satOrdenTiempos.ordenId, id), isNull(satOrdenTiempos.fin)));
        for (const a of abiertos) await tx.update(satOrdenTiempos).set({ fin: ahora, minutos: minutosEntre(a.inicio, ahora) }).where(eq(satOrdenTiempos.id, a.id));
      }
      await audit(tx, ctx, `estado_${body.estado}`, 'sat_orden', id, { antes: o.estado, motivo: body.motivo ?? null });
      await recalcularTicket(tx, ctx, o.ticketId);
      return after;
    });
  });

  /** Asignar técnico y fecha (tablero de planificación). */
  app.post('/ordenes/:id/planificar', { preHandler: guard('sat.planificar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(z.object({ tecnicoId: z.string().uuid().nullable(), inicio: z.string().nullish(), fin: z.string().nullish() }), req.body);
    const inicio = parseFechaHora(body.inicio);
    let fin = parseFechaHora(body.fin);
    if (inicio && (!fin || fin <= inicio)) fin = new Date(inicio.getTime() + 2 * 3600_000);
    return db.transaction(async (tx) => {
      const [o] = await tx.select().from(satOrdenes).where(and(eq(satOrdenes.id, id), eq(satOrdenes.empresaId, ctx.empresaId))).for('update');
      if (!o) throw notFound('Orden no encontrada');
      if (['finalizada', 'cancelada'].includes(o.estado)) throw conflict(`La orden está ${o.estado}`);
      const estado = ['en_ruta', 'en_curso'].includes(o.estado) ? o.estado : body.tecnicoId && inicio ? 'planificada' : 'pendiente';
      const [after] = await tx.update(satOrdenes).set({ tecnicoId: body.tecnicoId, planificadaInicio: inicio, planificadaFin: inicio ? fin : null, estado }).where(eq(satOrdenes.id, id)).returning();
      await audit(tx, ctx, 'planificar', 'sat_orden', id, diff(o, after));
      if (body.tecnicoId && (body.tecnicoId !== o.tecnicoId || o.planificadaInicio?.getTime() !== inicio?.getTime()) && body.tecnicoId !== ctx.personaId)
        await notify(tx, ctx, {
          modulo: 'sat',
          tipo: 'planificada',
          titulo: `Orden ${o.codigo} planificada`,
          cuerpo: inicio ? inicio.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null,
          enlace: `/sat/ordenes/${id}`,
          personaIds: [body.tecnicoId],
        });
      await recalcularTicket(tx, ctx, o.ticketId);
      return after;
    });
  });

  /* Cronómetro */
  app.post('/ordenes/:id/tiempo/:accion', async (req) => {
    const ctx = req.ctx;
    const { id, accion } = req.params as { id: string; accion: string };
    if (!['iniciar', 'parar'].includes(accion)) throw notFound();
    const o = await cargarOrden(ctx, id);
    await needEditarOrden(ctx, o);
    if (['finalizada', 'cancelada'].includes(o.estado)) throw conflict(`La orden está ${o.estado}`);
    const personaId = ctx.personaId;
    if (!personaId) throw badRequest('Tu usuario no está asociado a una persona');
    const ahora = new Date();
    return db.transaction(async (tx) => {
      const [abierto] = await tx.select().from(satOrdenTiempos).where(and(eq(satOrdenTiempos.ordenId, id), eq(satOrdenTiempos.personaId, personaId), isNull(satOrdenTiempos.fin)));
      if (accion === 'iniciar') {
        if (abierto) return abierto;
        const [t] = await tx.insert(satOrdenTiempos).values({ ordenId: id, personaId, inicio: ahora }).returning();
        if (o.estado !== 'en_curso') {
          await tx.update(satOrdenes).set({ estado: 'en_curso', iniciadaEn: o.iniciadaEn ?? ahora }).where(eq(satOrdenes.id, id));
          await recalcularTicket(tx, ctx, o.ticketId);
        }
        await audit(tx, ctx, 'tiempo_iniciar', 'sat_orden', id);
        return t;
      }
      if (!abierto) return { ok: true };
      const [t] = await tx.update(satOrdenTiempos).set({ fin: ahora, minutos: minutosEntre(abierto.inicio, ahora) }).where(eq(satOrdenTiempos.id, abierto.id)).returning();
      await audit(tx, ctx, 'tiempo_parar', 'sat_orden', id, { minutos: t!.minutos });
      return t;
    });
  });

  /** Cierre de la orden con el parte del técnico. */
  app.post('/ordenes/:id/cerrar', async (req) => {
    const ctx = req.ctx;
    const body = parse(cierreSchema, req.body);
    const r = await db.transaction((tx) => cerrarOrden(tx, ctx, (req.params as { id: string }).id, body));
    return { id: r.orden.id, codigo: r.orden.codigo, estado: r.orden.estado, albaranId: r.albaranId, repetido: r.repetido };
  });

  /** Presupuesto de reparación para que el cliente lo acepte desde el enlace público. */
  app.post('/ordenes/:id/presupuesto', async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(
      z.object({
        lineas: z
          .array(z.object({ articuloId: z.string().uuid().nullish(), descripcion: z.string().max(500).nullish(), cantidad: z.coerce.number().positive().default(1), precio: z.coerce.number().min(0).nullish() }))
          .min(1, 'Añade al menos una línea')
          .max(100),
        observaciones: z.string().max(4000).nullish(),
        enviar: z.boolean().default(true),
      }),
      req.body,
    );
    if (!ctx.modules.has('pre')) throw badRequest('El módulo de presupuestos no está activo');
    const o = await cargarOrden(ctx, (req.params as { id: string }).id);
    await needEditarOrden(ctx, o);
    if (o.presupuestoId) {
      const [p] = await db.select({ estado: documentos.estado }).from(documentos).where(eq(documentos.id, o.presupuestoId));
      if (p && !['rechazado', 'caducado'].includes(p.estado)) throw conflict('Esta orden ya tiene un presupuesto en curso');
    }
    const res = await db.transaction(async (tx) => {
      const lineas = [];
      for (const l of body.lineas) {
        if (l.articuloId) {
          const p = await precioPara(tx, ctx.empresaId, l.articuloId, o.terceroId);
          lineas.push({ tipoLinea: 'articulo', articuloId: p.articuloId, referencia: p.referencia, descripcion: l.descripcion || p.descripcion, cantidad: l.cantidad, unidad: p.unidad, precio: l.precio ?? p.precio, descuento: p.descuento, ivaTipo: p.ivaTipo, coste: p.coste });
        } else {
          if (!l.descripcion) throw badRequest('Cada línea necesita un artículo o una descripción');
          lineas.push({ tipoLinea: 'articulo', descripcion: l.descripcion, cantidad: l.cantidad, precio: l.precio ?? 0, ivaTipo: 21 });
        }
      }
      // quien tiene permiso de presupuestos lo crea a su nombre; si no, se crea en nombre del sistema
      const dctx = can(ctx, 'pre.editar') ? ctx : docCtx(ctx);
      const d = await crearDocumento(
        tx,
        dctx,
        documentoSchema.parse({
          tipo: 'presupuesto',
          fecha: madridDay(),
          terceroId: o.terceroId,
          titulo: `Reparación ${o.codigo}`,
          observaciones: body.observaciones ?? null,
          origenTipo: 'sat_orden',
          origenId: o.id,
          direccionEnvio: o.direccion ?? null,
          lineas,
        }),
        { sinPermisos: dctx !== ctx },
      );
      let aviso: string | null = null;
      if (body.enviar) {
        const r = (await ejecutarAccion(tx, dctx, d.id, 'enviar')) as { aviso?: string | null } | undefined;
        aviso = r?.aviso ?? null;
      }
      await tx.update(satOrdenes).set({ presupuestoId: d.id }).where(eq(satOrdenes.id, o.id));
      await audit(tx, ctx, 'presupuesto', 'sat_orden', o.id, { presupuestoId: d.id });
      const [after] = await tx.select({ estado: documentos.estado, codigo: documentos.codigo, total: documentos.total, token: documentos.tokenPublico }).from(documentos).where(eq(documentos.id, d.id));
      return { id: d.id, codigo: after!.codigo, estado: after!.estado, total: after!.total, enlace: after!.token ? `${config.appUrl}/p/${after!.token}` : null, aviso };
    });
    reply.code(201);
    return res;
  });

  /** Órdenes del técnico para un día (por defecto hoy), en orden de ruta. Respuesta mínima para el móvil. */
  app.get('/mis-ordenes', { preHandler: guard('sat.ver') }, async (req) => {
    const ctx = req.ctx;
    if (!ctx.personaId) return { fecha: madridDay(), ordenes: [] };
    const fecha = (req.query as { fecha?: string }).fecha || madridDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw badRequest('Fecha no válida');
    const { inicio, fin } = diaMadrid(fecha);
    const hoy = fecha === madridDay();
    const rows = await db
      .select({
        id: satOrdenes.id,
        codigo: satOrdenes.codigo,
        estado: satOrdenes.estado,
        tipo: satOrdenes.tipo,
        prioridad: satOrdenes.prioridad,
        descripcion: sql<string | null>`left(${satOrdenes.descripcion}, 160)`,
        planificadaInicio: satOrdenes.planificadaInicio,
        planificadaFin: satOrdenes.planificadaFin,
        direccion: satOrdenes.direccion,
        cliente: terceros.nombre,
        telefono: terceros.telefono,
        equipo: satEquipos.nombre,
        ticketId: satOrdenes.ticketId,
        finalizadaEn: satOrdenes.finalizadaEn,
      })
      .from(satOrdenes)
      .innerJoin(terceros, eq(terceros.id, satOrdenes.terceroId))
      .leftJoin(satEquipos, eq(satEquipos.id, satOrdenes.equipoId))
      .where(
        and(
          eq(satOrdenes.empresaId, ctx.empresaId),
          eq(satOrdenes.tecnicoId, ctx.personaId),
          isNull(satOrdenes.archivadoEn),
          sql`${satOrdenes.estado} <> 'cancelada'`,
          or(
            and(gte(satOrdenes.planificadaInicio, inicio), lt(satOrdenes.planificadaInicio, fin)),
            hoy ? inArray(satOrdenes.estado, ['en_ruta', 'en_curso']) : undefined,
            hoy ? and(eq(satOrdenes.estado, 'planificada'), lt(satOrdenes.planificadaInicio, inicio)) : undefined,
            and(gte(satOrdenes.finalizadaEn, inicio), lt(satOrdenes.finalizadaEn, fin)),
          ),
        ),
      )
      .orderBy(sql`${satOrdenes.planificadaInicio} NULLS LAST`);
    // teléfono del contacto del ticket si lo hay
    const ticketIds = rows.map((r) => r.ticketId).filter(Boolean) as string[];
    const contactosTk = ticketIds.length
      ? await db.execute<{ ticket_id: string; nombre: string; telefono: string | null }>(
          sql`SELECT t.id AS ticket_id, trim(c.nombre || ' ' || coalesce(c.apellidos, '')) AS nombre, coalesce(c.movil, c.telefono) AS telefono FROM sat_tickets t JOIN contactos c ON c.id = t.contacto_id WHERE t.id IN (${sql.join(ticketIds.map((i) => sql`${i}`), sql`, `)})`,
        )
      : [];
    const porTicket = new Map(contactosTk.map((c) => [c.ticket_id, c]));
    return {
      fecha,
      ordenes: rows.map((r) => {
        const c = r.ticketId ? porTicket.get(r.ticketId) : undefined;
        return {
          ...r,
          atrasada: !!r.planificadaInicio && r.planificadaInicio < inicio && r.estado === 'planificada',
          contacto: c ? { nombre: c.nombre, telefono: c.telefono } : null,
          telefono: c?.telefono ?? r.direccion?.telefono ?? r.telefono,
          mapsUrl: mapsUrl(r.direccion),
        };
      }),
    };
  });

  app.get('/mis-ordenes/contador', async (req) => {
    const ctx = req.ctx;
    if (!ctx.personaId || !can(ctx, 'sat.ver')) return { n: 0 };
    const { inicio, fin } = diaMadrid(madridDay());
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(satOrdenes)
      .where(and(eq(satOrdenes.tecnicoId, ctx.personaId), inArray(satOrdenes.estado, ['planificada', 'en_ruta', 'en_curso']), isNull(satOrdenes.archivadoEn), lt(satOrdenes.planificadaInicio, fin), gte(satOrdenes.planificadaInicio, new Date(inicio.getTime() - 30 * 86400_000))));
    return { n: r?.n ?? 0 };
  });

  /** Tablero de planificación: técnicos, órdenes del periodo y pendientes de planificar. */
  app.get('/planificacion', { preHandler: guard('sat.planificar') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { desde?: string; hasta?: string };
    const desde = q.desde && /^\d{4}-\d{2}-\d{2}$/.test(q.desde) ? q.desde : madridDay();
    const hasta = q.hasta && /^\d{4}-\d{2}-\d{2}$/.test(q.hasta) ? q.hasta : desde;
    const ini = diaMadrid(desde).inicio;
    const fin = diaMadrid(hasta).fin;
    if (fin.getTime() - ini.getTime() > 45 * 86400_000) throw badRequest('El periodo es demasiado largo');
    const tecnicos = await db
      .select({ id: personas.id, nombre: nombrePersona, telefono: personas.telefono })
      .from(personas)
      .where(and(eq(personas.empresaId, ctx.empresaId), eq(personas.activo, true), isNull(personas.archivadoEn), tecnicoSql))
      .orderBy(nombrePersona);
    const cols = {
      id: satOrdenes.id,
      codigo: satOrdenes.codigo,
      estado: satOrdenes.estado,
      tipo: satOrdenes.tipo,
      prioridad: satOrdenes.prioridad,
      tecnicoId: satOrdenes.tecnicoId,
      planificadaInicio: satOrdenes.planificadaInicio,
      planificadaFin: satOrdenes.planificadaFin,
      descripcion: sql<string | null>`left(${satOrdenes.descripcion}, 120)`,
      cliente: terceros.nombre,
      localidad: sql<string | null>`${satOrdenes.direccion}->>'localidad'`,
      creadoEn: satOrdenes.creadoEn,
    };
    const [ordenes, pendientes] = await Promise.all([
      db
        .select(cols)
        .from(satOrdenes)
        .innerJoin(terceros, eq(terceros.id, satOrdenes.terceroId))
        .where(and(eq(satOrdenes.empresaId, ctx.empresaId), isNull(satOrdenes.archivadoEn), sql`${satOrdenes.estado} <> 'cancelada'`, gte(satOrdenes.planificadaInicio, ini), lt(satOrdenes.planificadaInicio, fin)))
        .orderBy(asc(satOrdenes.planificadaInicio)),
      db
        .select(cols)
        .from(satOrdenes)
        .innerJoin(terceros, eq(terceros.id, satOrdenes.terceroId))
        .where(and(eq(satOrdenes.empresaId, ctx.empresaId), isNull(satOrdenes.archivadoEn), eq(satOrdenes.estado, 'pendiente')))
        .orderBy(sql`CASE ${satOrdenes.prioridad} WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`, asc(satOrdenes.creadoEn))
        .limit(100),
    ]);
    return { desde, hasta, tecnicos, ordenes, pendientes };
  });

  /* ═════════════ Equipos instalados ═════════════ */
  registerCrud(app, {
    path: '/equipos',
    resource: equipoResource,
    table: satEquipos,
    entity: 'sat_equipo',
    perms: { ver: 'sat.ver', crear: 'sat.contratos' },
    transformOut: (r) => {
      const { portalToken: _p, ...rest } = r;
      return { ...rest, enGarantia: !!r.garantiaHasta && r.garantiaHasta >= madridDay() };
    },
    beforeSave: async (tx, ctx, data, existing) => {
      const terceroId = data.terceroId ?? existing?.terceroId;
      if (data.terceroId) {
        const [t] = await tx.select({ e: terceros.empresaId }).from(terceros).where(eq(terceros.id, data.terceroId));
        if (!t || t.e !== ctx.empresaId) throw badRequest('Cliente no válido');
      }
      if (data.contratoId) {
        const [c] = await tx.select({ t: satContratos.terceroId }).from(satContratos).where(eq(satContratos.id, data.contratoId));
        if (!c || c.t !== terceroId) throw badRequest('El contrato es de otro cliente');
      }
      if (data.articuloId && (!data.marca || !data.modelo)) {
        const [a] = await tx.select({ marca: articulos.marca, modelo: articulos.modelo }).from(articulos).where(eq(articulos.id, data.articuloId));
        data.marca ||= a?.marca ?? null;
        data.modelo ||= a?.modelo ?? null;
      }
      if (!existing) data.portalToken = randomToken(18);
      return data;
    },
  });

  app.get('/equipos/:id/ficha', { preHandler: guard('sat.ver') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [e] = await db.select().from(satEquipos).where(and(eq(satEquipos.id, id), eq(satEquipos.empresaId, ctx.empresaId)));
    if (!e) throw notFound('Equipo no encontrado');
    const [cliente] = await db.select({ id: terceros.id, nombre: terceros.nombre, telefono: terceros.telefono }).from(terceros).where(eq(terceros.id, e.terceroId));
    const [contrato] = e.contratoId ? await db.select({ id: satContratos.id, codigo: satContratos.codigo, nombre: satContratos.nombre, estado: satContratos.estado, proximaVisita: satContratos.proximaVisita }).from(satContratos).where(eq(satContratos.id, e.contratoId)) : [];
    const [articulo] = e.articuloId ? await db.select({ id: articulos.id, referencia: articulos.referencia, nombre: articulos.nombre }).from(articulos).where(eq(articulos.id, e.articuloId)) : [];
    const scope = await scopeCondition(ctx, ctx.perms.get('sat.ver')!, satOrdenes.tecnicoId);
    const historial = await db
      .select({ id: satOrdenes.id, codigo: satOrdenes.codigo, tipo: satOrdenes.tipo, estado: satOrdenes.estado, tecnico: nombrePersona, fecha: sql<Date>`coalesce(${satOrdenes.finalizadaEn}, ${satOrdenes.planificadaInicio}, ${satOrdenes.creadoEn})`, trabajo: sql<string | null>`left(coalesce(${satOrdenes.trabajoRealizado}, ${satOrdenes.descripcion}), 240)` })
      .from(satOrdenes)
      .leftJoin(personas, eq(personas.id, satOrdenes.tecnicoId))
      .where(and(eq(satOrdenes.equipoId, id), isNull(satOrdenes.archivadoEn), scope))
      .orderBy(desc(sql`coalesce(${satOrdenes.finalizadaEn}, ${satOrdenes.planificadaInicio}, ${satOrdenes.creadoEn})`))
      .limit(50);
    const tScope = await scopeCondition(ctx, ctx.perms.get('sat.ver')!, satTickets.responsableId);
    const tickets = await db
      .select({ id: satTickets.id, codigo: satTickets.codigo, asunto: satTickets.asunto, estado: satTickets.estado, prioridad: satTickets.prioridad, creadoEn: satTickets.creadoEn })
      .from(satTickets)
      .where(and(eq(satTickets.equipoId, id), isNull(satTickets.archivadoEn), tScope))
      .orderBy(desc(satTickets.creadoEn))
      .limit(30);
    const { portalToken, ...rest } = e;
    return {
      ...rest,
      enGarantia: !!e.garantiaHasta && e.garantiaHasta >= madridDay(),
      cliente: cliente ?? null,
      contrato: contrato ?? null,
      articulo: articulo ?? null,
      historial,
      tickets,
      enlacePublico: portalToken ? `${config.appUrl}/publico/sat/equipo/${portalToken}` : null,
      puedeEditar: can(ctx, 'sat.contratos'),
    };
  });

  /** Etiqueta con código QR para pegar en el equipo (abre el portal público para pedir asistencia). */
  app.get('/equipos/:id/etiqueta', { preHandler: guard('sat.ver') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [e] = await db.select().from(satEquipos).where(and(eq(satEquipos.id, id), eq(satEquipos.empresaId, ctx.empresaId)));
    if (!e) throw notFound('Equipo no encontrado');
    let token = e.portalToken;
    if (!token) {
      token = randomToken(18);
      await db.update(satEquipos).set({ portalToken: token }).where(eq(satEquipos.id, id));
    }
    const [emp] = await db.select({ nombre: empresas.nombre, telefono: empresas.telefono }).from(empresas).where(eq(empresas.id, ctx.empresaId));
    const url = `${config.appUrl}/publico/sat/equipo/${token}`;
    const qr = await QRCode.toBuffer(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
    // 100 x 62 mm
    const doc = new PDFDocument({ size: [283.5, 175.7], margin: 10, info: { Title: `Etiqueta ${e.nombre}`, Producer: 'KiteERP' } });
    doc.rect(0, 0, 283.5, 22).fill(BRAND.violeta);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text(emp?.nombre ?? 'Servicio técnico', 10, 6, { width: 263, lineBreak: false, ellipsis: true });
    doc.image(qr, 178, 30, { fit: [96, 96] });
    doc.fillColor(BRAND.tinta).font('Helvetica-Bold').fontSize(10.5).text(e.nombre, 10, 32, { width: 160, height: 28, ellipsis: true });
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.gris);
    const lineas = [[e.marca, e.modelo].filter(Boolean).join(' '), e.numeroSerie ? `N.º serie: ${e.numeroSerie}` : null, e.ubicacion, e.garantiaHasta ? `Garantía hasta ${e.garantiaHasta.split('-').reverse().join('/')}` : null].filter(Boolean) as string[];
    doc.text(lineas.join('\n'), 10, 62, { width: 160, height: 60, ellipsis: true });
    doc.fillColor(BRAND.morado).font('Helvetica-Bold').fontSize(8.5).text('¿Avería? Escanea el código', 10, 130, { width: 165 });
    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.gris).text(emp?.telefono ? `o llama al ${emp.telefono}` : 'para pedir asistencia técnica', 10, 142, { width: 165 });
    doc.fontSize(6).text(e.id.slice(-8).toUpperCase(), 178, 132, { width: 96, align: 'center' });
    const buffer = await pdfToBuffer(doc);
    return { __file: true, buffer, mime: 'application/pdf', name: `Etiqueta ${e.nombre}.pdf`, inline: true };
  });

  /* ═════════════ Contratos de mantenimiento ═════════════ */
  registerCrud(app, {
    path: '/contratos',
    resource: contratoResource,
    table: satContratos,
    entity: 'sat_contrato',
    perms: { ver: ['sat.contratos', 'sat.planificar'], crear: 'sat.contratos' },
    beforeSave: async (tx, ctx, data, existing) => {
      sinNulos(data, ['estado', 'periodicidadMeses', 'cuotaPeriodicidad', 'inicio']);
      const inicio = data.inicio ?? existing?.inicio;
      const fin = data.fin !== undefined ? data.fin : existing?.fin;
      if (inicio && fin && fin < inicio) throw badRequest('La fecha de fin debe ser posterior al inicio');
      if (data.terceroId) {
        const [t] = await tx.select({ e: terceros.empresaId }).from(terceros).where(eq(terceros.id, data.terceroId));
        if (!t || t.e !== ctx.empresaId) throw badRequest('Cliente no válido');
        if (existing && data.terceroId !== existing.terceroId) throw badRequest('No se puede cambiar el cliente de un contrato');
      }
      if (!existing) {
        data.codigo = await nextCode(tx, ctx.empresaId, 'sat_contrato', 'CM');
        if (!data.proximaVisita) {
          const hoy = madridDay();
          data.proximaVisita = data.inicio > hoy ? data.inicio : hoy;
        }
      }
      return data;
    },
    afterSave: async (tx, ctx, row) => {
      await sincronizarRecurrente(tx, ctx, row as typeof satContratos.$inferSelect);
    },
    beforeDelete: async (tx, ctx, row) => {
      await sincronizarRecurrente(tx, ctx, { ...(row as typeof satContratos.$inferSelect), estado: 'finalizado' });
    },
  });

  app.get('/contratos/:id/ficha', { preHandler: guard(['sat.contratos', 'sat.planificar']) }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [c] = await db.select().from(satContratos).where(and(eq(satContratos.id, id), eq(satContratos.empresaId, ctx.empresaId)));
    if (!c) throw notFound('Contrato no encontrado');
    const [cliente] = await db.select({ id: terceros.id, nombre: terceros.nombre }).from(terceros).where(eq(terceros.id, c.terceroId));
    const equipos = await db.select({ id: satEquipos.id, nombre: satEquipos.nombre, marca: satEquipos.marca, modelo: satEquipos.modelo, numeroSerie: satEquipos.numeroSerie, ubicacion: satEquipos.ubicacion, garantiaHasta: satEquipos.garantiaHasta }).from(satEquipos).where(and(eq(satEquipos.contratoId, id), isNull(satEquipos.archivadoEn))).orderBy(asc(satEquipos.nombre));
    const visitas = await db
      .select({ id: satOrdenes.id, codigo: satOrdenes.codigo, estado: satOrdenes.estado, tipo: satOrdenes.tipo, visitaFecha: satOrdenes.visitaFecha, planificadaInicio: satOrdenes.planificadaInicio, finalizadaEn: satOrdenes.finalizadaEn, tecnico: nombrePersona })
      .from(satOrdenes)
      .leftJoin(personas, eq(personas.id, satOrdenes.tecnicoId))
      .where(and(eq(satOrdenes.contratoId, id), isNull(satOrdenes.archivadoEn)))
      .orderBy(desc(satOrdenes.creadoEn))
      .limit(50);
    const [rec] = c.recurrenteId ? await db.select({ id: documentosRecurrentes.id, proximaFecha: documentosRecurrentes.proximaFecha, periodicidad: documentosRecurrentes.periodicidad, activo: documentosRecurrentes.activo, ultimoDocumentoId: documentosRecurrentes.ultimoDocumentoId }).from(documentosRecurrentes).where(eq(documentosRecurrentes.id, c.recurrenteId)) : [];
    return { ...c, cliente: cliente ?? null, tecnico: await personaNombre(c.tecnicoId), equipos, visitas, recurrente: rec ?? null, puedeEditar: can(ctx, 'sat.contratos') };
  });

  app.put('/contratos/:id/equipos', { preHandler: guard('sat.contratos') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(z.object({ equipoIds: z.array(z.string().uuid()).max(500) }), req.body);
    const [c] = await db.select().from(satContratos).where(and(eq(satContratos.id, id), eq(satContratos.empresaId, ctx.empresaId)));
    if (!c) throw notFound('Contrato no encontrado');
    return db.transaction(async (tx) => {
      await tx.update(satEquipos).set({ contratoId: null }).where(and(eq(satEquipos.contratoId, id), body.equipoIds.length ? sql`${satEquipos.id} NOT IN (${sql.join(body.equipoIds.map((e) => sql`${e}`), sql`, `)})` : undefined));
      if (body.equipoIds.length) {
        const r = await tx.update(satEquipos).set({ contratoId: id }).where(and(inArray(satEquipos.id, body.equipoIds), eq(satEquipos.terceroId, c.terceroId))).returning({ id: satEquipos.id });
        if (r.length !== body.equipoIds.length) throw badRequest('Algún equipo es de otro cliente');
      }
      await audit(tx, ctx, 'equipos', 'sat_contrato', id, { equipoIds: body.equipoIds });
      return { ok: true, n: body.equipoIds.length };
    });
  });

  app.post('/contratos/generar-visitas', { preHandler: guard('sat.planificar') }, async (req) => ({ generadas: await generarPreventivos(req.ctx.empresaId, req.ctx) }));

  /* ═════════════ Plantillas de checklist ═════════════ */
  registerCrud(app, {
    path: '/checklists',
    resource: checklistResource,
    table: satChecklists,
    entity: 'sat_checklist',
    perms: { ver: 'sat.ver', crear: 'sat.planificar' },
    beforeSave: (_tx, _ctx, data) => {
      sinNulos(data, ['items', 'activo']);
      if (data.items !== undefined) {
        if (!Array.isArray(data.items)) throw badRequest('Los puntos del checklist deben ser una lista');
        data.items = data.items
          .map((i: any, n: number) => (typeof i === 'string' ? { id: `p${n + 1}`, texto: i } : { id: String(i.id || `p${n + 1}`), texto: String(i.texto ?? '').trim(), obligatorio: !!i.obligatorio }))
          .filter((i: any) => i.texto)
          .slice(0, 100);
      }
      return data;
    },
  });

  /* ═════════════ Ficha del cliente ═════════════ */
  app.get('/terceros/:id/resumen', { preHandler: guard('sat.ver') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [t] = await db.select({ id: terceros.id, empresaId: terceros.empresaId, portalToken: terceros.portalToken }).from(terceros).where(eq(terceros.id, id));
    if (!t || t.empresaId !== ctx.empresaId) throw notFound();
    const sv = ctx.perms.get('sat.ver')!;
    const [equipos, tickets, ordenes, contratos] = await Promise.all([
      db.select({ id: satEquipos.id, nombre: satEquipos.nombre, marca: satEquipos.marca, modelo: satEquipos.modelo, numeroSerie: satEquipos.numeroSerie, ubicacion: satEquipos.ubicacion, garantiaHasta: satEquipos.garantiaHasta, contratoId: satEquipos.contratoId }).from(satEquipos).where(and(eq(satEquipos.terceroId, id), isNull(satEquipos.archivadoEn))).orderBy(asc(satEquipos.nombre)).limit(200),
      db
        .select({ id: satTickets.id, codigo: satTickets.codigo, asunto: satTickets.asunto, estado: satTickets.estado, prioridad: satTickets.prioridad, creadoEn: satTickets.creadoEn, valoracion: satTickets.valoracion })
        .from(satTickets)
        .where(and(eq(satTickets.terceroId, id), isNull(satTickets.archivadoEn), await scopeCondition(ctx, sv, satTickets.responsableId)))
        .orderBy(desc(satTickets.creadoEn))
        .limit(30),
      db
        .select({ id: satOrdenes.id, codigo: satOrdenes.codigo, estado: satOrdenes.estado, tipo: satOrdenes.tipo, planificadaInicio: satOrdenes.planificadaInicio, finalizadaEn: satOrdenes.finalizadaEn, tecnico: nombrePersona })
        .from(satOrdenes)
        .leftJoin(personas, eq(personas.id, satOrdenes.tecnicoId))
        .where(and(eq(satOrdenes.terceroId, id), isNull(satOrdenes.archivadoEn), await scopeCondition(ctx, sv, satOrdenes.tecnicoId)))
        .orderBy(desc(satOrdenes.creadoEn))
        .limit(30),
      can(ctx, 'sat.contratos') || can(ctx, 'sat.planificar')
        ? db.select({ id: satContratos.id, codigo: satContratos.codigo, nombre: satContratos.nombre, estado: satContratos.estado, proximaVisita: satContratos.proximaVisita, fin: satContratos.fin, cuota: satContratos.cuota, cuotaPeriodicidad: satContratos.cuotaPeriodicidad }).from(satContratos).where(and(eq(satContratos.terceroId, id), isNull(satContratos.archivadoEn))).orderBy(desc(satContratos.inicio))
        : Promise.resolve(null),
    ]);
    return { equipos, tickets, ordenes, contratos, enlacePortal: t.portalToken ? `${config.appUrl}/publico/sat/${t.portalToken}` : null, puedeGestionar: can(ctx, 'sat.contratos') || can(ctx, 'sat.planificar') };
  });

  /** Genera el enlace del portal de asistencia del cliente (solo escribe terceros.portal_token). */
  app.post('/terceros/:id/portal', { preHandler: guard(['sat.contratos', 'sat.planificar']) }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(z.object({ regenerar: z.boolean().default(false) }), req.body ?? {});
    const [t] = await db.select({ empresaId: terceros.empresaId, portalToken: terceros.portalToken }).from(terceros).where(eq(terceros.id, id));
    if (!t || t.empresaId !== ctx.empresaId) throw notFound();
    if (t.portalToken && !body.regenerar) return { url: `${config.appUrl}/publico/sat/${t.portalToken}` };
    const token = randomToken(24);
    await db.transaction(async (tx) => {
      await tx.update(terceros).set({ portalToken: token }).where(eq(terceros.id, id));
      await audit(tx, ctx, body.regenerar ? 'regenerar_portal' : 'crear_portal', 'tercero', id);
    });
    return { url: `${config.appUrl}/publico/sat/${token}` };
  });

  /** Estado de los presupuestos de reparación ya aceptados (para planificar la reparación). */
  app.get('/presupuestos-aceptados', { preHandler: guard('sat.planificar') }, async (req) => {
    const rows = await db
      .select({ ordenId: satOrdenes.id, orden: satOrdenes.codigo, presupuesto: documentos.codigo, estado: documentos.estado, total: documentos.total, aceptadoEn: documentos.aceptadoEn, cliente: terceros.nombre })
      .from(satOrdenes)
      .innerJoin(documentos, eq(documentos.id, satOrdenes.presupuestoId))
      .innerJoin(terceros, eq(terceros.id, satOrdenes.terceroId))
      .where(and(eq(satOrdenes.empresaId, req.ctx.empresaId), isNotNull(satOrdenes.presupuestoId), eq(documentos.estado, 'aceptado')))
      .orderBy(desc(documentos.aceptadoEn))
      .limit(30);
    return rows;
  });
}

/** Personas que trabajan órdenes (su rol tiene sat.editar). */
export const tecnicoSql = sql`EXISTS (SELECT 1 FROM usuario_empresas ue JOIN rol_permisos rp ON rp.rol_id = ue.rol_id WHERE ue.persona_id = ${personas.id} AND ue.activo AND rp.permiso = 'sat.editar')`;

