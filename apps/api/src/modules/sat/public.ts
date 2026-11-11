import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client';
import { empresas, terceros } from '../../db/schema/core';
import { audit } from '../../core/audit';
import { systemCtx } from '../../core/context';
import { badRequest, conflict, notFound, parse } from '../../core/errors';
import { fileUrl } from '../../core/files';
import { activeModules } from '../../core/modules';
import { notify } from '../../core/notify';
import { satEquipos, satTickets } from './schema';
import { madridDay, prepararTicketNuevo } from './service';

/**
 * Portal público del servicio técnico (sin sesión):
 *  - /public/portal/:token  → portal del cliente (token en terceros.portal_token)
 *  - /public/equipo/:token  → página del código QR pegado en un equipo
 *  - /public/ticket/:token  → seguimiento y valoración de un ticket
 */
const PUB = { config: { public: true } } as const;
const PUB_POST = { config: { public: true, rateLimit: { max: 10, timeWindow: '10 minutes' } } } as const;

const nuevoTicketSchema = z.object({
  asunto: z.string().trim().min(3, 'Cuéntanos brevemente qué ocurre').max(200),
  descripcion: z.string().trim().max(5000).nullish(),
  equipoId: z.string().uuid().nullish(),
  urgente: z.boolean().default(false),
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(120),
  contacto: z.string().trim().min(5, 'Indica un teléfono o email de contacto').max(160),
});

async function empresaInfo(empresaId: string) {
  const [e] = await db.select({ nombre: empresas.nombre, telefono: empresas.telefono, email: empresas.email, logo: empresas.logoArchivoId }).from(empresas).where(eq(empresas.id, empresaId));
  return { nombre: e?.nombre ?? '', telefono: e?.telefono ?? null, email: e?.email ?? null, logoUrl: fileUrl(e?.logo, 86400) };
}

async function ctxActivo(empresaId: string) {
  const mods = await activeModules(empresaId);
  if (!mods.has('sat')) throw notFound('Este servicio no está disponible');
  return systemCtx(empresaId, mods);
}

const ticketPublico = (t: typeof satTickets.$inferSelect) => ({
  token: t.portalToken,
  codigo: t.codigo,
  asunto: t.asunto,
  estado: t.estado,
  prioridad: t.prioridad,
  creadoEn: t.creadoEn,
  resueltoEn: t.resueltoEn,
  valoracion: t.valoracion,
  puedeValorar: ['resuelto', 'cerrado'].includes(t.estado) && !t.valoracion,
});

async function crearTicketPublico(empresaId: string, terceroId: string, body: z.infer<typeof nuevoTicketSchema>, canal: 'portal' | 'web', ip: string) {
  const ctx = await ctxActivo(empresaId);
  ctx.ip = ip;
  return db.transaction(async (tx) => {
    const data = await prepararTicketNuevo(tx, ctx, {
      terceroId,
      equipoId: body.equipoId ?? null,
      asunto: body.asunto,
      descripcion: body.descripcion ?? null,
      prioridad: body.urgente ? 'alta' : 'normal',
      canal,
      reportadoPor: body.nombre,
      reportadoContacto: body.contacto,
    });
    const [t] = await tx.insert(satTickets).values({ ...(data as typeof satTickets.$inferInsert), empresaId }).returning();
    await audit(tx, ctx, 'crear', 'sat_ticket', t!.id, { canal, reportadoPor: body.nombre });
    await notify(tx, ctx, { modulo: 'sat', tipo: 'nuevo', titulo: `Nuevo aviso ${t!.codigo} desde ${canal === 'portal' ? 'el portal' : 'el código QR'}`, cuerpo: `${body.asunto} · ${body.nombre} (${body.contacto})`, enlace: `/sat/tickets/${t!.id}`, permiso: 'sat.planificar', email: body.urgente });
    return ticketPublico(t!);
  });
}

export async function publicRoutes(app: FastifyInstance) {
  /* Portal del cliente */
  app.get('/public/portal/:token', PUB, async (req) => {
    const { token } = req.params as { token: string };
    if (!token || token.length < 16) throw notFound('Este enlace no existe');
    const [t] = await db.select({ id: terceros.id, empresaId: terceros.empresaId, nombre: terceros.nombre }).from(terceros).where(and(eq(terceros.portalToken, token), isNull(terceros.archivadoEn)));
    if (!t) throw notFound('Este enlace no existe o ha caducado');
    await ctxActivo(t.empresaId);
    const hoy = madridDay();
    const [equipos, tickets] = await Promise.all([
      db.select({ id: satEquipos.id, nombre: satEquipos.nombre, marca: satEquipos.marca, modelo: satEquipos.modelo, numeroSerie: satEquipos.numeroSerie, ubicacion: satEquipos.ubicacion, garantiaHasta: satEquipos.garantiaHasta }).from(satEquipos).where(and(eq(satEquipos.terceroId, t.id), isNull(satEquipos.archivadoEn))).limit(200),
      db.select().from(satTickets).where(and(eq(satTickets.terceroId, t.id), isNull(satTickets.archivadoEn))).orderBy(desc(satTickets.creadoEn)).limit(40),
    ]);
    return {
      empresa: await empresaInfo(t.empresaId),
      cliente: t.nombre,
      equipos: equipos.map((e) => ({ ...e, enGarantia: !!e.garantiaHasta && e.garantiaHasta >= hoy })),
      tickets: tickets.map(ticketPublico),
    };
  });

  app.post('/public/portal/:token/tickets', PUB_POST, async (req, reply) => {
    const { token } = req.params as { token: string };
    const body = parse(nuevoTicketSchema, req.body);
    const [t] = await db.select({ id: terceros.id, empresaId: terceros.empresaId }).from(terceros).where(and(eq(terceros.portalToken, token), isNull(terceros.archivadoEn)));
    if (!t) throw notFound('Este enlace no existe');
    if (body.equipoId) {
      const [e] = await db.select({ t: satEquipos.terceroId }).from(satEquipos).where(eq(satEquipos.id, body.equipoId));
      if (e?.t !== t.id) throw badRequest('Equipo no válido');
    }
    reply.code(201);
    return crearTicketPublico(t.empresaId, t.id, body, 'portal', req.ip);
  });

  /* Página del código QR de un equipo */
  app.get('/public/equipo/:token', PUB, async (req) => {
    const { token } = req.params as { token: string };
    const [e] = await db.select().from(satEquipos).where(and(eq(satEquipos.portalToken, token), isNull(satEquipos.archivadoEn)));
    if (!e) throw notFound('Este código no corresponde a ningún equipo');
    await ctxActivo(e.empresaId);
    const [cliente] = await db.select({ nombre: terceros.nombre }).from(terceros).where(eq(terceros.id, e.terceroId));
    const abiertos = await db
      .select()
      .from(satTickets)
      .where(and(eq(satTickets.equipoId, e.id), inArray(satTickets.estado, ['nuevo', 'asignado', 'en_curso', 'esperando_cliente'])))
      .orderBy(desc(satTickets.creadoEn))
      .limit(5);
    // manuales públicos del equipo (si DTC está activo)
    let manuales: { titulo: string; tipo: string; version: string | null; url: string | null }[] = [];
    const mods = await activeModules(e.empresaId);
    if (mods.has('dtc')) {
      const { manualesPublicos } = await import('../dtc/service');
      manuales = await manualesPublicos(e.empresaId, [
        { entidad: 'sat_equipo', id: e.id },
        ...(e.articuloId ? [{ entidad: 'articulo', id: e.articuloId }] : []),
      ]);
    }
    return {
      empresa: await empresaInfo(e.empresaId),
      cliente: cliente?.nombre ?? null,
      equipo: { nombre: e.nombre, marca: e.marca, modelo: e.modelo, numeroSerie: e.numeroSerie, ubicacion: e.ubicacion, fechaInstalacion: e.fechaInstalacion, garantiaHasta: e.garantiaHasta, enGarantia: !!e.garantiaHasta && e.garantiaHasta >= madridDay() },
      abiertos: abiertos.map((t) => ({ codigo: t.codigo, asunto: t.asunto, estado: t.estado, creadoEn: t.creadoEn })),
      manuales,
    };
  });

  app.post('/public/equipo/:token/tickets', PUB_POST, async (req, reply) => {
    const { token } = req.params as { token: string };
    const body = parse(nuevoTicketSchema, req.body);
    const [e] = await db.select({ id: satEquipos.id, empresaId: satEquipos.empresaId, terceroId: satEquipos.terceroId }).from(satEquipos).where(and(eq(satEquipos.portalToken, token), isNull(satEquipos.archivadoEn)));
    if (!e) throw notFound('Este código no corresponde a ningún equipo');
    reply.code(201);
    return crearTicketPublico(e.empresaId, e.terceroId, { ...body, equipoId: e.id }, 'web', req.ip);
  });

  /* Seguimiento y valoración de un ticket */
  app.get('/public/ticket/:token', PUB, async (req) => {
    const { token } = req.params as { token: string };
    const [t] = await db.select().from(satTickets).where(eq(satTickets.portalToken, token));
    if (!t) throw notFound('Este enlace no existe');
    await ctxActivo(t.empresaId);
    const [cliente] = await db.select({ nombre: terceros.nombre, portal: terceros.portalToken }).from(terceros).where(eq(terceros.id, t.terceroId));
    const [equipo] = t.equipoId ? await db.select({ nombre: satEquipos.nombre }).from(satEquipos).where(eq(satEquipos.id, t.equipoId)) : [];
    return { empresa: await empresaInfo(t.empresaId), cliente: cliente?.nombre ?? null, portalToken: cliente?.portal ?? null, equipo: equipo?.nombre ?? null, descripcion: t.descripcion, valoracionComentario: t.valoracionComentario, ...ticketPublico(t) };
  });

  app.post('/public/ticket/:token/valorar', PUB_POST, async (req) => {
    const { token } = req.params as { token: string };
    const body = parse(z.object({ valoracion: z.coerce.number().int().min(1, 'Elige de 1 a 5 estrellas').max(5), comentario: z.string().trim().max(2000).nullish() }), req.body);
    const [t] = await db.select().from(satTickets).where(eq(satTickets.portalToken, token));
    if (!t) throw notFound('Este enlace no existe');
    const ctx = await ctxActivo(t.empresaId);
    ctx.ip = req.ip;
    if (!['resuelto', 'cerrado'].includes(t.estado)) throw conflict('Podrás valorar la asistencia cuando esté resuelta');
    if (t.valoracion) throw conflict('Esta asistencia ya está valorada. Gracias.');
    await db.transaction(async (tx) => {
      await tx
        .update(satTickets)
        .set({ valoracion: body.valoracion, valoracionComentario: body.comentario ?? null, valoradoEn: new Date() })
        .where(and(eq(satTickets.id, t.id), isNull(satTickets.valoracion)));
      await audit(tx, ctx, 'valorar', 'sat_ticket', t.id, { valoracion: body.valoracion });
      if (body.valoracion <= 2)
        await notify(tx, ctx, { modulo: 'sat', tipo: 'valoracion', titulo: `Valoración baja en ${t.codigo}: ${body.valoracion}/5`, cuerpo: body.comentario ?? null, enlace: `/sat/tickets/${t.id}`, permiso: 'sat.planificar', personaIds: [t.responsableId] });
    });
    return { ok: true };
  });
}

