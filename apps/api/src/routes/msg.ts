import { and, arrayOverlaps, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client';
import {
  anuncioLecturas,
  anuncios,
  comentarios,
  denunciaMensajes,
  denuncias,
  empresas,
  encuestaParticipantes,
  encuestaRespuestas,
  encuestas,
  notificaciones,
  personas,
  tareas,
} from '../db/schema';
import { randomToken, sha256 } from '../core/auth';
import { audit } from '../core/audit';
import { canEditEntity, canViewEntity, entityGuard } from '../core/entities';
import { badRequest, forbidden, notFound, parse } from '../core/errors';
import { notify } from '../core/notify';
import { can, guard } from '../core/permissions';
import { newId } from '../db/helpers';

const nombre = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

export async function msgRoutes(app: FastifyInstance) {
  /* ── Comentarios en cualquier ficha ── */
  app.get('/comentarios/:entidad/:id', async (req) => {
    const { entidad, id } = req.params as { entidad: string; id: string };
    if (!(await canViewEntity(req.ctx, entidad, id))) throw forbidden();
    return db
      .select({ id: comentarios.id, texto: comentarios.texto, creadoEn: comentarios.creadoEn, editadoEn: comentarios.editadoEn, usuarioId: comentarios.usuarioId, autor: nombre, personaId: comentarios.personaId })
      .from(comentarios)
      .leftJoin(personas, eq(personas.id, comentarios.personaId))
      .where(and(eq(comentarios.entidad, entidad), eq(comentarios.entidadId, id)))
      .orderBy(asc(comentarios.creadoEn));
  });
  app.post('/comentarios/:entidad/:id', async (req) => {
    const { entidad, id } = req.params as { entidad: string; id: string };
    const body = parse(z.object({ texto: z.string().trim().min(1).max(5000), menciones: z.array(z.string().uuid()).default([]) }), req.body);
    if (!(await canViewEntity(req.ctx, entidad, id))) throw forbidden();
    return db.transaction(async (tx) => {
      const [c] = await tx
        .insert(comentarios)
        .values({ empresaId: req.ctx.empresaId, entidad, entidadId: id, usuarioId: req.ctx.usuarioId, personaId: req.ctx.personaId, texto: body.texto, menciones: body.menciones })
        .returning();
      const g = entityGuard(entidad);
      const titulo = (await g?.title?.(id)) ?? g?.label ?? entidad;
      const enlace = g?.url?.(id) ?? null;
      if (body.menciones.length)
        await notify(tx, req.ctx, { modulo: 'msg', tipo: 'mencion', titulo: `${req.ctx.nombre} te ha mencionado en ${titulo}`, cuerpo: body.texto.slice(0, 200), enlace, personaIds: body.menciones });
      const watchers = ((await g?.watchers?.(id)) ?? []).filter((w) => !body.menciones.includes(w));
      if (watchers.length)
        await notify(tx, req.ctx, { modulo: 'msg', tipo: 'comentario', titulo: `Nuevo comentario en ${titulo}`, cuerpo: body.texto.slice(0, 200), enlace, personaIds: watchers });
      return c;
    });
  });
  app.delete('/comentarios/:id', async (req) => {
    const { id } = req.params as { id: string };
    const [c] = await db.select().from(comentarios).where(and(eq(comentarios.id, id), eq(comentarios.empresaId, req.ctx.empresaId)));
    if (!c) throw notFound();
    if (c.usuarioId !== req.ctx.usuarioId && !req.ctx.isAdmin) throw forbidden('Solo puedes borrar tus comentarios');
    await db.transaction(async (tx) => {
      await tx.delete(comentarios).where(eq(comentarios.id, id));
      await audit(tx, req.ctx, 'borrar', 'comentario', id, c);
    });
    return { ok: true };
  });

  /* ── Tareas ── */
  const tareaSchema = z.object({
    titulo: z.string().trim().min(1),
    descripcion: z.string().nullish(),
    asignadoA: z.string().uuid().nullish(),
    entidad: z.string().nullish(),
    entidadId: z.string().uuid().nullish(),
    vence: z.string().nullish(),
    prioridad: z.enum(['baja', 'normal', 'alta']).default('normal'),
  });
  app.get('/tareas', async (req) => {
    const q = req.query as { ver?: 'mias' | 'creadas' | 'entidad'; entidad?: string; entidadId?: string; estado?: string };
    const conds = [eq(tareas.empresaId, req.ctx.empresaId)];
    if (q.ver === 'entidad' && q.entidad && q.entidadId) {
      if (!(await canViewEntity(req.ctx, q.entidad, q.entidadId))) throw forbidden();
      conds.push(eq(tareas.entidad, q.entidad), eq(tareas.entidadId, q.entidadId));
    } else if (q.ver === 'creadas') conds.push(eq(tareas.creadoPor, req.ctx.usuarioId));
    else conds.push(req.ctx.personaId ? eq(tareas.asignadoA, req.ctx.personaId) : sql`false`);
    if (q.estado === 'abiertas') conds.push(inArray(tareas.estado, ['pendiente', 'en_curso']));
    return db
      .select({ t: tareas, asignado: nombre })
      .from(tareas)
      .leftJoin(personas, eq(personas.id, tareas.asignadoA))
      .where(and(...conds))
      .orderBy(asc(tareas.estado), sql`${tareas.vence} NULLS LAST`, desc(tareas.creadoEn))
      .limit(200)
      .then((r) => r.map((x) => ({ ...x.t, asignado: x.asignado })));
  });
  app.post('/tareas', async (req) => {
    const body = parse(tareaSchema, req.body);
    if (body.entidad && body.entidadId && !(await canViewEntity(req.ctx, body.entidad, body.entidadId))) throw forbidden();
    return db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tareas)
        .values({ ...body, asignadoA: body.asignadoA ?? req.ctx.personaId, empresaId: req.ctx.empresaId, creadoPor: req.ctx.usuarioId })
        .returning();
      if (t!.asignadoA && t!.asignadoA !== req.ctx.personaId)
        await notify(tx, req.ctx, { modulo: 'msg', tipo: 'tarea', titulo: `Nueva tarea: ${t!.titulo}`, cuerpo: `Asignada por ${req.ctx.nombre}`, enlace: '/tareas', personaIds: [t!.asignadoA] });
      return t;
    });
  });
  app.patch('/tareas/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(tareaSchema.partial().extend({ estado: z.enum(['pendiente', 'en_curso', 'hecha']).optional() }), req.body);
    const [t] = await db.select().from(tareas).where(and(eq(tareas.id, id), eq(tareas.empresaId, req.ctx.empresaId)));
    if (!t) throw notFound();
    if (t.asignadoA !== req.ctx.personaId && t.creadoPor !== req.ctx.usuarioId && !req.ctx.isAdmin) throw forbidden();
    const data: Record<string, unknown> = { ...body };
    if (body.estado === 'hecha' && t.estado !== 'hecha') data.completadaEn = new Date();
    if (body.estado && body.estado !== 'hecha') data.completadaEn = null;
    const [u] = await db.update(tareas).set(data).where(eq(tareas.id, id)).returning();
    return u;
  });
  app.delete('/tareas/:id', async (req) => {
    const { id } = req.params as { id: string };
    const [t] = await db.select().from(tareas).where(and(eq(tareas.id, id), eq(tareas.empresaId, req.ctx.empresaId)));
    if (!t) throw notFound();
    if (t.creadoPor !== req.ctx.usuarioId && !req.ctx.isAdmin) throw forbidden();
    await db.delete(tareas).where(eq(tareas.id, id));
    return { ok: true };
  });

  /* ── Notificaciones ── */
  app.get('/notificaciones', async (req) => {
    const { solo } = req.query as { solo?: string };
    const rows = await db
      .select()
      .from(notificaciones)
      .where(and(eq(notificaciones.usuarioId, req.ctx.usuarioId), eq(notificaciones.empresaId, req.ctx.empresaId), solo === 'nuevas' ? isNull(notificaciones.leidaEn) : undefined))
      .orderBy(desc(notificaciones.creadoEn))
      .limit(60);
    const [n] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notificaciones)
      .where(and(eq(notificaciones.usuarioId, req.ctx.usuarioId), eq(notificaciones.empresaId, req.ctx.empresaId), isNull(notificaciones.leidaEn)));
    return { items: rows, sinLeer: n?.n ?? 0 };
  });
  app.post('/notificaciones/leer', async (req) => {
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).optional() }), req.body ?? {});
    await db
      .update(notificaciones)
      .set({ leidaEn: new Date() })
      .where(and(eq(notificaciones.usuarioId, req.ctx.usuarioId), isNull(notificaciones.leidaEn), ids?.length ? inArray(notificaciones.id, ids) : undefined));
    return { ok: true };
  });

  /* ── Tablón de anuncios ── */
  app.get('/anuncios', async (req) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const gestor = can(req.ctx, 'msg.anuncios');
    const dep = req.ctx.departamentoId;
    const rows = await db
      .select({
        a: anuncios,
        autor: nombre,
        leido: sql<boolean>`EXISTS (SELECT 1 FROM anuncio_lecturas l WHERE l.anuncio_id = ${anuncios.id} AND l.persona_id = ${req.ctx.personaId ?? '00000000-0000-0000-0000-000000000000'})`,
        lecturas: sql<number>`(SELECT count(*)::int FROM anuncio_lecturas l WHERE l.anuncio_id = ${anuncios.id})`,
      })
      .from(anuncios)
      .leftJoin(personas, eq(personas.id, anuncios.publicadoPor))
      .where(
        and(
          eq(anuncios.empresaId, req.ctx.empresaId),
          isNull(anuncios.archivadoEn),
          gestor ? undefined : or(isNull(anuncios.caduca), gte(anuncios.caduca, hoy)),
          gestor ? undefined : or(sql`cardinality(${anuncios.departamentos}) = 0`, dep ? arrayOverlaps(anuncios.departamentos, [dep]) : sql`false`),
        ),
      )
      .orderBy(desc(anuncios.fijado), desc(anuncios.publicadoEn))
      .limit(100);
    return rows.map((r) => ({ ...r.a, autor: r.autor, leido: r.leido, lecturas: gestor ? r.lecturas : undefined }));
  });
  app.post('/anuncios', { preHandler: guard('msg.anuncios') }, async (req) => {
    const body = parse(
      z.object({
        titulo: z.string().trim().min(1),
        cuerpo: z.string().trim().min(1),
        departamentos: z.array(z.string().uuid()).default([]),
        requiereConfirmacion: z.boolean().default(false),
        fijado: z.boolean().default(false),
        caduca: z.string().nullish(),
        avisarPorEmail: z.boolean().default(false),
      }),
      req.body,
    );
    return db.transaction(async (tx) => {
      const { avisarPorEmail, ...data } = body;
      const [a] = await tx.insert(anuncios).values({ ...data, caduca: data.caduca || null, empresaId: req.ctx.empresaId, publicadoPor: req.ctx.personaId }).returning();
      const dest = await tx
        .select({ id: personas.id })
        .from(personas)
        .where(and(eq(personas.empresaId, req.ctx.empresaId), eq(personas.activo, true), body.departamentos.length ? inArray(personas.departamentoId, body.departamentos) : undefined));
      await notify(tx, req.ctx, { modulo: 'msg', tipo: 'anuncio', titulo: `Nuevo aviso: ${a!.titulo}`, cuerpo: a!.cuerpo.slice(0, 200), enlace: '/tablon', personaIds: dest.map((d) => d.id), email: avisarPorEmail });
      await audit(tx, req.ctx, 'publicar', 'anuncio', a!.id, { titulo: a!.titulo });
      return a;
    });
  });
  app.post('/anuncios/:id/leido', async (req) => {
    const { id } = req.params as { id: string };
    if (!req.ctx.personaId) throw badRequest('Tu usuario no está vinculado a una persona');
    await db.insert(anuncioLecturas).values({ anuncioId: id, personaId: req.ctx.personaId }).onConflictDoNothing();
    return { ok: true };
  });
  app.get('/anuncios/:id/lecturas', { preHandler: guard('msg.anuncios') }, async (req) => {
    const { id } = req.params as { id: string };
    const [a] = await db.select().from(anuncios).where(and(eq(anuncios.id, id), eq(anuncios.empresaId, req.ctx.empresaId)));
    if (!a) throw notFound();
    const dest = await db
      .select({ id: personas.id, nombre, leidoEn: anuncioLecturas.leidoEn })
      .from(personas)
      .leftJoin(anuncioLecturas, and(eq(anuncioLecturas.personaId, personas.id), eq(anuncioLecturas.anuncioId, id)))
      .where(and(eq(personas.empresaId, req.ctx.empresaId), eq(personas.activo, true), a.departamentos.length ? inArray(personas.departamentoId, a.departamentos) : undefined))
      .orderBy(asc(nombre));
    return dest;
  });
  app.delete('/anuncios/:id', { preHandler: guard('msg.anuncios') }, async (req) => {
    const { id } = req.params as { id: string };
    await db.update(anuncios).set({ archivadoEn: new Date() }).where(and(eq(anuncios.id, id), eq(anuncios.empresaId, req.ctx.empresaId)));
    return { ok: true };
  });

  /* ── Canal de denuncias (Ley 2/2023) ── */
  const denunciaSchema = z.object({
    categoria: z.string().min(1),
    asunto: z.string().trim().min(3),
    descripcion: z.string().trim().min(10),
    anonima: z.boolean().default(true),
    nombre: z.string().nullish(),
    email: z.string().email().nullish().or(z.literal('')),
  });
  app.get('/public/:empresaId/canal', { config: { public: true } }, async (req) => {
    const { empresaId } = req.params as { empresaId: string };
    const [e] = await db.select({ nombre: empresas.nombre }).from(empresas).where(eq(empresas.id, empresaId));
    if (!e) throw notFound();
    return { empresa: e.nombre };
  });
  app.post('/public/:empresaId/denuncias', { config: { public: true, rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const { empresaId } = req.params as { empresaId: string };
    const body = parse(denunciaSchema, req.body);
    const [e] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresaId));
    if (!e) throw notFound();
    const codigo = `D-${new Date().getFullYear()}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    const clave = randomToken(9);
    await db.transaction(async (tx) => {
      const [d] = await tx
        .insert(denuncias)
        .values({ ...body, email: body.email || null, nombre: body.anonima ? null : body.nombre, empresaId, codigo, tokenHash: sha256(clave) })
        .returning();
      const sys = { empresaId, usuarioId: '00000000-0000-0000-0000-000000000000', personaId: null, nombre: 'Canal', modules: new Set<string>(), perms: new Map(), isAdmin: true, ip: null, usuarioEmpresaId: '', departamentoId: null, teamIds: async () => [], deptIds: async () => [] };
      await notify(tx, sys, { modulo: 'msg', tipo: 'denuncia', titulo: 'Nueva comunicación en el canal de denuncias', cuerpo: `Código ${d!.codigo}`, enlace: '/denuncias', permiso: 'msg.denuncias', email: true });
    });
    return { codigo, clave, aviso: 'Guarda el código y la clave: son la única forma de consultar el estado y responder.' };
  });
  app.post('/public/denuncias/consulta', { config: { public: true, rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const body = parse(z.object({ codigo: z.string(), clave: z.string(), mensaje: z.string().trim().optional() }), req.body);
    const [d] = await db.select().from(denuncias).where(eq(denuncias.codigo, body.codigo.trim().toUpperCase()));
    if (!d || d.tokenHash !== sha256(body.clave.trim())) throw notFound('Código o clave incorrectos');
    if (body.mensaje) await db.insert(denunciaMensajes).values({ denunciaId: d.id, autor: 'denunciante', texto: body.mensaje });
    const msgs = await db.select().from(denunciaMensajes).where(eq(denunciaMensajes.denunciaId, d.id)).orderBy(asc(denunciaMensajes.creadoEn));
    return { codigo: d.codigo, estado: d.estado, asunto: d.asunto, creadoEn: d.creadoEn, resolucion: d.resolucion, mensajes: msgs };
  });
  app.get('/denuncias', { preHandler: guard('msg.denuncias') }, async (req) => {
    return db.select().from(denuncias).where(eq(denuncias.empresaId, req.ctx.empresaId)).orderBy(desc(denuncias.creadoEn));
  });
  app.get('/denuncias/:id', { preHandler: guard('msg.denuncias') }, async (req) => {
    const { id } = req.params as { id: string };
    const [d] = await db.select().from(denuncias).where(and(eq(denuncias.id, id), eq(denuncias.empresaId, req.ctx.empresaId)));
    if (!d) throw notFound();
    const msgs = await db.select().from(denunciaMensajes).where(eq(denunciaMensajes.denunciaId, id)).orderBy(asc(denunciaMensajes.creadoEn));
    await audit(db, req.ctx, 'consultar', 'denuncia', id);
    const { tokenHash: _t, ...rest } = d;
    return { ...rest, mensajes: msgs };
  });
  app.post('/denuncias/:id', { preHandler: guard('msg.denuncias') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ estado: z.enum(['recibida', 'en_investigacion', 'resuelta', 'archivada']).optional(), mensaje: z.string().trim().optional(), resolucion: z.string().optional() }), req.body);
    await db.transaction(async (tx) => {
      const [d] = await tx.select().from(denuncias).where(and(eq(denuncias.id, id), eq(denuncias.empresaId, req.ctx.empresaId)));
      if (!d) throw notFound();
      const data: Record<string, unknown> = { gestorId: req.ctx.usuarioId };
      if (!d.acuseEn) data.acuseEn = new Date();
      if (body.estado) data.estado = body.estado;
      if (body.resolucion !== undefined) data.resolucion = body.resolucion;
      if (body.estado === 'resuelta' || body.estado === 'archivada') data.cerradaEn = new Date();
      await tx.update(denuncias).set(data).where(eq(denuncias.id, id));
      if (body.mensaje) await tx.insert(denunciaMensajes).values({ denunciaId: id, autor: 'gestor', texto: body.mensaje });
      await audit(tx, req.ctx, 'gestionar', 'denuncia', id, { estado: body.estado });
    });
    return { ok: true };
  });

  /* ── Encuestas de clima ── */
  const encuestaSchema = z.object({
    titulo: z.string().trim().min(1),
    descripcion: z.string().nullish(),
    anonima: z.boolean().default(true),
    cierre: z.string().nullish(),
    preguntas: z.array(z.object({ texto: z.string().min(1), tipo: z.enum(['escala', 'opcion', 'texto']), opciones: z.array(z.string()).optional() })).min(1),
  });
  app.get('/encuestas', async (req) => {
    const rows = await db
      .select({
        e: encuestas,
        respondida: sql<boolean>`EXISTS (SELECT 1 FROM encuesta_participantes p WHERE p.encuesta_id = ${encuestas.id} AND p.persona_id = ${req.ctx.personaId ?? '00000000-0000-0000-0000-000000000000'})`,
        respuestas: sql<number>`(SELECT count(*)::int FROM encuesta_participantes p WHERE p.encuesta_id = ${encuestas.id})`,
      })
      .from(encuestas)
      .where(and(eq(encuestas.empresaId, req.ctx.empresaId), can(req.ctx, 'msg.encuestas') ? undefined : eq(encuestas.abierta, true)))
      .orderBy(desc(encuestas.creadoEn));
    return rows.map((r) => ({ ...r.e, respondida: r.respondida, respuestas: r.respuestas }));
  });
  app.post('/encuestas', { preHandler: guard('msg.encuestas') }, async (req) => {
    const body = parse(encuestaSchema, req.body);
    return db.transaction(async (tx) => {
      const [e] = await tx
        .insert(encuestas)
        .values({ ...body, cierre: body.cierre || null, preguntas: body.preguntas.map((p) => ({ ...p, id: newId() })), empresaId: req.ctx.empresaId, creadoPor: req.ctx.usuarioId })
        .returning();
      const todos = await tx.select({ id: personas.id }).from(personas).where(and(eq(personas.empresaId, req.ctx.empresaId), eq(personas.activo, true)));
      await notify(tx, req.ctx, { modulo: 'msg', tipo: 'encuesta', titulo: `Nueva encuesta: ${e!.titulo}`, enlace: '/encuestas', personaIds: todos.map((t) => t.id) });
      return e;
    });
  });
  app.post('/encuestas/:id/responder', async (req) => {
    const { id } = req.params as { id: string };
    const { respuestas } = parse(z.object({ respuestas: z.record(z.union([z.string(), z.number()])) }), req.body);
    if (!req.ctx.personaId) throw badRequest('Tu usuario no está vinculado a una persona');
    const [e] = await db.select().from(encuestas).where(and(eq(encuestas.id, id), eq(encuestas.empresaId, req.ctx.empresaId)));
    if (!e || !e.abierta) throw badRequest('La encuesta está cerrada');
    await db.transaction(async (tx) => {
      const ins = await tx.insert(encuestaParticipantes).values({ encuestaId: id, personaId: req.ctx.personaId! }).onConflictDoNothing().returning();
      if (!ins.length) throw badRequest('Ya has respondido a esta encuesta');
      await tx.insert(encuestaRespuestas).values({ encuestaId: id, personaId: e.anonima ? null : req.ctx.personaId, respuestas });
    });
    return { ok: true };
  });
  app.get('/encuestas/:id/resultados', { preHandler: guard('msg.encuestas') }, async (req) => {
    const { id } = req.params as { id: string };
    const [e] = await db.select().from(encuestas).where(and(eq(encuestas.id, id), eq(encuestas.empresaId, req.ctx.empresaId)));
    if (!e) throw notFound();
    const rs = await db.select({ r: encuestaRespuestas.respuestas }).from(encuestaRespuestas).where(eq(encuestaRespuestas.encuestaId, id));
    const resultados = e.preguntas.map((p) => {
      const vals = rs.map((x) => x.r[p.id]).filter((v) => v !== undefined && v !== '');
      if (p.tipo === 'escala') {
        const nums = vals.map(Number).filter((n) => !Number.isNaN(n));
        return { ...p, total: nums.length, media: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null, distribucion: [1, 2, 3, 4, 5].map((n) => nums.filter((x) => x === n).length) };
      }
      if (p.tipo === 'opcion') return { ...p, total: vals.length, conteo: (p.opciones ?? []).map((o) => ({ opcion: o, n: vals.filter((v) => v === o).length })) };
      return { ...p, total: vals.length, textos: vals.slice(0, 200) };
    });
    return { encuesta: e, participantes: rs.length, resultados };
  });
  app.post('/encuestas/:id/cerrar', { preHandler: guard('msg.encuestas') }, async (req) => {
    const { id } = req.params as { id: string };
    await db.update(encuestas).set({ abierta: false }).where(and(eq(encuestas.id, id), eq(encuestas.empresaId, req.ctx.empresaId)));
    return { ok: true };
  });

  canEditEntity; // usado por otros módulos
}
