import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pryShared, round, toZod, type ResourceDef } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { articulos, personas, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { audit, diff } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { emit } from '../../core/events';
import { nextCode } from '../../core/numbering';
import { can, guard } from '../../core/permissions';
import { resolveRefs } from '../../core/refs';
import { cargarDocumento, crearDocumento, lineasDe } from '../../services/documentos';
import { stkAlmacenes } from '../stk/schema';
import { pryConsumos, pryCostesPersona, pryFases, pryHitos, pryImputaciones, pryPartidas, pryProyectos, pryTareas } from './schema';
import { cargarProyecto, comprobarDesviacion, costeArticulo, costeHoraDe, proyectosVisibles, puedeEditarProyecto, rentabilidad, type Proyecto } from './service';

const { proyectoResource, faseResource, tareaResource, partidaResource, hitoResource } = pryShared;
const SISTEMA = '00000000-0000-0000-0000-000000000000';
const usuarioDe = (ctx: Ctx) => (ctx.usuarioId === SISTEMA ? null : ctx.usuarioId);
const hoy = () => new Date().toISOString().slice(0, 10);
const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

const proyectoCreate = toZod(proyectoResource);
const proyectoUpdate = toZod(proyectoResource, { partial: true });

export async function crearProyecto(tx: Tx, ctx: Ctx, data: Record<string, any>) {
  const codigo = await nextCode(tx, ctx.empresaId, 'pry_proyecto', 'PRY', data.fechaInicio || hoy());
  const miembros = [...new Set((data.miembros ?? []) as string[])];
  const [p] = await tx
    .insert(pryProyectos)
    .values({ ...data, codigo, empresaId: ctx.empresaId, responsableId: data.responsableId ?? ctx.personaId, miembros, creadoPor: usuarioDe(ctx) } as typeof pryProyectos.$inferInsert)
    .returning();
  await audit(tx, ctx, 'crear', 'pry_proyecto', p!.id, { codigo, nombre: p!.nombre });
  return p!;
}

/** Registra listado/alta/edición/borrado de una tabla hija del proyecto (fases, tareas, partidas, hitos). */
function hijos(app: FastifyInstance, o: { path: string; table: PgTable & Record<string, any>; resource: ResourceDef; entity: string; order: PgColumn[]; extra?: Record<string, z.ZodTypeAny>; antesGuardar?: (tx: Tx, ctx: Ctx, p: Proyecto, data: Record<string, any>, existing: Record<string, any> | null) => Promise<string | null | void> }) {
  const t = o.table as any;
  const create = toZod(o.resource).extend(o.extra ?? {});
  const update = toZod(o.resource, { partial: true }).extend(Object.fromEntries(Object.entries(o.extra ?? {}).map(([k, v]) => [k, v.optional()])));
  const uno = async (tx: Tx | typeof db, proyectoId: string, sid: string) => {
    const [r] = await tx.select().from(o.table).where(and(eq(t.id, sid), eq(t.proyectoId, proyectoId)));
    if (!r) throw notFound();
    return r as Record<string, any>;
  };

  app.get(`/proyectos/:id/${o.path}`, async (req) => {
    const { id } = req.params as { id: string };
    await cargarProyecto(db, req.ctx, id);
    const rows = (await db.select().from(o.table).where(eq(t.proyectoId, id)).orderBy(...o.order.map((c) => asc(c)))) as Record<string, any>[];
    return { items: rows, refs: await resolveRefs(req.ctx, o.resource, rows) };
  });
  app.post(`/proyectos/:id/${o.path}`, async (req, reply) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    let data = parse(create, req.body) as Record<string, any>;
    const r = await db.transaction(async (tx) => {
      const p = await cargarProyecto(tx, ctx, id, 'editar');
      const aviso = await o.antesGuardar?.(tx, ctx, p, data, null);
      if (t.empresaId) data.empresaId = ctx.empresaId;
      if (t.orden && data.orden === undefined) {
        const [m] = await tx.select({ m: sql<number>`coalesce(max(${t.orden}), -1)::int` }).from(o.table).where(eq(t.proyectoId, id));
        data.orden = (m?.m ?? -1) + 1;
      }
      const [row] = (await tx.insert(o.table).values({ ...data, proyectoId: id }).returning()) as Record<string, any>[];
      await audit(tx, ctx, 'crear', o.entity, row!.id, diff(null, row));
      return { ...row, _aviso: aviso ?? null };
    });
    reply.code(201);
    return r;
  });
  app.patch(`/proyectos/:id/${o.path}/:sid`, async (req) => {
    const ctx = req.ctx;
    const { id, sid } = req.params as { id: string; sid: string };
    const data = parse(update, req.body) as Record<string, any>;
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    return db.transaction(async (tx) => {
      const p = await cargarProyecto(tx, ctx, id);
      const existing = await uno(tx, id, sid);
      // quien tiene la tarea asignada puede moverla de columna aunque no gestione el proyecto
      const soloEstado = o.path === 'tareas' && Object.keys(data).every((k) => ['estado', 'orden'].includes(k)) && existing.asignadoId === ctx.personaId;
      if (!soloEstado && !(await puedeEditarProyecto(ctx, p))) throw forbidden('No puedes modificar este proyecto');
      const aviso = await o.antesGuardar?.(tx, ctx, p, data, existing);
      if (!Object.keys(data).length) return existing;
      const [row] = (await tx.update(o.table).set(data).where(eq(t.id, sid)).returning()) as Record<string, any>[];
      await audit(tx, ctx, 'editar', o.entity, sid, diff(existing, row));
      return { ...row, _aviso: aviso ?? null };
    });
  });
  app.delete(`/proyectos/:id/${o.path}/:sid`, async (req) => {
    const ctx = req.ctx;
    const { id, sid } = req.params as { id: string; sid: string };
    await db.transaction(async (tx) => {
      await cargarProyecto(tx, ctx, id, 'editar');
      const existing = await uno(tx, id, sid);
      if (o.path === 'hitos' && existing.estado === 'facturado') throw conflict('El hito ya está facturado');
      await tx.delete(o.table).where(eq(t.id, sid));
      await audit(tx, ctx, 'borrar', o.entity, sid, existing);
    });
    return { ok: true };
  });
}

export async function pryRoutes(app: FastifyInstance) {
  /* ── Proyectos ── */
  app.get('/proyectos', async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const conds: (SQL | undefined)[] = [eq(pryProyectos.empresaId, ctx.empresaId), await proyectosVisibles(ctx), q.archivados === '1' ? isNotNull(pryProyectos.archivadoEn) : isNull(pryProyectos.archivadoEn)];
    if (!ctx.perms.has('pry.ver') && !ctx.perms.has('pry.editar') && !ctx.perms.has('pry.imputar')) throw forbidden();
    if (q.q) {
      const like = `%${q.q.replace(/[%_]/g, '')}%`;
      conds.push(or(ilike(pryProyectos.codigo, like), ilike(pryProyectos.nombre, like), ilike(terceros.nombre, like)));
    }
    if (q.estado) conds.push(inArray(pryProyectos.estado, q.estado.split(',')));
    if (q.clienteId) conds.push(eq(pryProyectos.clienteId, q.clienteId));
    if (q.responsableId) conds.push(eq(pryProyectos.responsableId, q.responsableId));
    if (q.mios === '1' && ctx.personaId) conds.push(or(eq(pryProyectos.responsableId, ctx.personaId), sql`${ctx.personaId}::uuid = ANY(${pryProyectos.miembros})`));
    const where = and(...conds);
    const sortCols: Record<string, any> = { codigo: pryProyectos.codigo, nombre: pryProyectos.nombre, fechaFin: pryProyectos.fechaFin, estado: pryProyectos.estado, creadoEn: pryProyectos.creadoEn };
    const dir = q.dir === 'asc' ? asc : desc;
    const [items, [n]] = await Promise.all([
      db
        .select({
          p: pryProyectos,
          cliente: terceros.nombre,
          responsable: nombrePersona,
          horas: sql<number>`(SELECT coalesce(sum(horas), 0)::float FROM pry_imputaciones i WHERE i.proyecto_id = ${pryProyectos.id})`,
          coste: sql<number>`((SELECT coalesce(sum(horas * coste_hora), 0) FROM pry_imputaciones i WHERE i.proyecto_id = ${pryProyectos.id}) + (SELECT coalesce(sum(cantidad * coste_unitario), 0) FROM pry_consumos c WHERE c.proyecto_id = ${pryProyectos.id}))::float`,
          tareas: sql<number>`(SELECT count(*)::int FROM pry_tareas t WHERE t.proyecto_id = ${pryProyectos.id})`,
          hechas: sql<number>`(SELECT count(*)::int FROM pry_tareas t WHERE t.proyecto_id = ${pryProyectos.id} AND t.estado = 'hecha')`,
        })
        .from(pryProyectos)
        .leftJoin(terceros, eq(terceros.id, pryProyectos.clienteId))
        .leftJoin(personas, eq(personas.id, pryProyectos.responsableId))
        .where(where)
        .orderBy(dir(sortCols[q.sort ?? 'creadoEn'] ?? pryProyectos.creadoEn), desc(pryProyectos.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(pryProyectos).leftJoin(terceros, eq(terceros.id, pryProyectos.clienteId)).where(where),
    ]);
    return {
      items: items.map((r) => ({ ...r.p, cliente: r.cliente, responsable: r.responsable, horas: r.horas, coste: round(r.coste), avance: r.tareas ? Math.round((r.hechas / r.tareas) * 100) : 0 })),
      total: n?.n ?? 0,
      page,
      pageSize,
    };
  });

  app.get('/proyectos/:id', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const p = await cargarProyecto(db, ctx, id);
    const refs = await resolveRefs(ctx, proyectoResource, [p]);
    return { ...p, _refs: refs, _puedeEditar: await puedeEditarProyecto(ctx, p), _puedeFacturar: ctx.modules.has('fac') && can(ctx, 'fac.editar'), _puedeComprar: ctx.modules.has('cpr') && can(ctx, 'cpr.editar') };
  });

  app.post('/proyectos', { preHandler: guard('pry.editar') }, async (req, reply) => {
    const ctx = req.ctx;
    const data = parse(proyectoCreate, req.body) as Record<string, any>;
    if (ctx.perms.get('pry.editar') === 'propio' && data.responsableId && data.responsableId !== ctx.personaId && !(data.miembros ?? []).includes(ctx.personaId)) data.miembros = [...(data.miembros ?? []), ctx.personaId];
    const p = await db.transaction((tx) => crearProyecto(tx, ctx, data));
    reply.code(201);
    return p;
  });

  app.patch('/proyectos/:id', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const data = parse(proyectoUpdate, req.body) as Record<string, any>;
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    return db.transaction(async (tx) => {
      const p = await cargarProyecto(tx, ctx, id, 'editar');
      if (data.miembros) data.miembros = [...new Set(data.miembros)];
      const [after] = await tx.update(pryProyectos).set(data).where(eq(pryProyectos.id, id)).returning();
      await audit(tx, ctx, 'editar', 'pry_proyecto', id, diff(p, after));
      return after;
    });
  });

  app.delete('/proyectos/:id', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      await cargarProyecto(tx, ctx, id, 'editar');
      await tx.update(pryProyectos).set({ archivadoEn: new Date() }).where(eq(pryProyectos.id, id));
      await audit(tx, ctx, 'archivar', 'pry_proyecto', id);
    });
    return { ok: true };
  });

  app.post('/proyectos/:id/restaurar', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      await cargarProyecto(tx, ctx, id, 'editar');
      await tx.update(pryProyectos).set({ archivadoEn: null }).where(eq(pryProyectos.id, id));
      await audit(tx, ctx, 'restaurar', 'pry_proyecto', id);
    });
    return { ok: true };
  });

  /** Crea el proyecto y sus partidas a partir de un presupuesto (un capítulo = una partida; sin capítulos, una por línea). */
  app.post('/proyectos/desde-presupuesto', { preHandler: guard('pry.editar') }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(z.object({ presupuestoId: z.string().uuid(), nombre: z.string().trim().max(200).nullish(), responsableId: z.string().uuid().nullish(), miembros: z.array(z.string().uuid()).default([]) }), req.body);
    const r = await db.transaction(async (tx) => {
      const d = await cargarDocumento(tx, ctx, body.presupuestoId);
      if (d.tipo !== 'presupuesto') throw badRequest('El documento no es un presupuesto');
      const [ya] = await tx.select({ id: pryProyectos.id, codigo: pryProyectos.codigo }).from(pryProyectos).where(and(eq(pryProyectos.presupuestoId, d.id), isNull(pryProyectos.archivadoEn)));
      if (ya) throw conflict(`Ya existe el proyecto ${ya.codigo} para este presupuesto`);
      const ls = await lineasDe(tx, d.id);
      const p = await crearProyecto(tx, ctx, {
        nombre: body.nombre || d.titulo || `Proyecto ${d.codigo}`,
        clienteId: d.terceroId,
        responsableId: body.responsableId ?? ctx.personaId,
        miembros: body.miembros,
        estado: 'planificado',
        tipoFacturacion: 'hitos',
        fechaInicio: hoy(),
        presupuestoId: d.id,
        presupuestoVenta: d.baseImponible,
        presupuestoCoste: d.coste,
        descripcion: d.observaciones,
      });
      const grupos: { nombre: string; lineas: typeof ls; lineaId: string | null }[] = [];
      const hayCapitulos = ls.some((l) => l.tipoLinea === 'capitulo');
      let actual: (typeof grupos)[number] | null = null;
      for (const l of ls) {
        if (l.tipoLinea === 'capitulo') {
          actual = { nombre: l.descripcion || 'Capítulo', lineas: [], lineaId: l.id };
          grupos.push(actual);
        } else if (l.tipoLinea === 'articulo') {
          if (!hayCapitulos) grupos.push({ nombre: l.descripcion || l.referencia || 'Partida', lineas: [l], lineaId: l.id });
          else {
            if (!actual) {
              actual = { nombre: 'General', lineas: [], lineaId: null };
              grupos.push(actual);
            }
            actual.lineas.push(l);
          }
        }
      }
      const artIds = ls.map((l) => l.articuloId).filter(Boolean) as string[];
      const arts = artIds.length ? await tx.select({ id: articulos.id, tipo: articulos.tipo, unidad: articulos.unidad }).from(articulos).where(inArray(articulos.id, artIds)) : [];
      let orden = 0;
      for (const g of grupos.filter((x) => x.lineas.length)) {
        const horas = g.lineas.filter((l) => l.unidad === 'h' || arts.find((a) => a.id === l.articuloId)?.unidad === 'h').reduce((a, l) => a + l.cantidad, 0);
        const servicio = g.lineas.every((l) => arts.find((a) => a.id === l.articuloId)?.tipo === 'servicio' || l.unidad === 'h');
        await tx.insert(pryPartidas).values({
          proyectoId: p.id,
          nombre: g.nombre.slice(0, 200),
          tipo: servicio ? 'mano_obra' : 'material',
          horasPrevistas: horas || null,
          costePrevisto: round(g.lineas.reduce((a, l) => a + l.coste * l.cantidad, 0)),
          ventaPrevista: round(g.lineas.reduce((a, l) => a + l.subtotal, 0) * (1 - d.descuentoGlobal / 100)),
          orden: orden++,
          lineaPresupuestoId: g.lineaId,
        });
      }
      return { id: p.id, codigo: p.codigo, partidas: orden };
    });
    reply.code(201);
    return r;
  });

  app.get('/proyectos/:id/rentabilidad', async (req) => {
    const { id } = req.params as { id: string };
    const p = await cargarProyecto(db, req.ctx, id);
    return rentabilidad(db, req.ctx, p);
  });

  /* ── Fases, tareas, partidas e hitos ── */
  hijos(app, { path: 'fases', table: pryFases as any, resource: faseResource, entity: 'pry_fase', order: [pryFases.orden, pryFases.creadoEn] });
  hijos(app, { path: 'partidas', table: pryPartidas as any, resource: partidaResource, entity: 'pry_partida', order: [pryPartidas.orden, pryPartidas.creadoEn] });
  hijos(app, {
    path: 'tareas',
    table: pryTareas as any,
    resource: tareaResource,
    entity: 'pry_tarea',
    order: [pryTareas.orden, pryTareas.creadoEn],
    extra: { orden: z.coerce.number().int().min(0) },
    antesGuardar: async (tx, _ctx, p, data, existing) => {
      if (data.dependeDeId && existing && data.dependeDeId === existing.id) throw badRequest('Una tarea no puede depender de sí misma');
      if (data.estado === 'hecha' && existing?.estado !== 'hecha') data.completadaEn = new Date();
      if (data.estado && data.estado !== 'hecha') data.completadaEn = null;
      const dep = data.dependeDeId ?? existing?.dependeDeId;
      if (dep && data.estado && ['en_curso', 'revision', 'hecha'].includes(data.estado)) {
        const [d] = await tx.select({ titulo: pryTareas.titulo, estado: pryTareas.estado }).from(pryTareas).where(and(eq(pryTareas.id, dep), eq(pryTareas.proyectoId, p.id)));
        if (d && d.estado !== 'hecha') return `Ojo: depende de "${d.titulo}", que aún no está hecha`;
      }
      return null;
    },
  });
  hijos(app, { path: 'hitos', table: pryHitos as any, resource: hitoResource, entity: 'pry_hito', order: [pryHitos.fecha, pryHitos.orden] });

  /** Factura un hito: crea un borrador de factura con el proyecto (lo emite Facturación). */
  app.post('/proyectos/:id/hitos/:sid/facturar', async (req) => {
    const ctx = req.ctx;
    const { id, sid } = req.params as { id: string; sid: string };
    if (!ctx.modules.has('fac')) throw conflict('Activa el módulo de Facturación para facturar hitos');
    if (!can(ctx, 'fac.editar')) throw forbidden('No puedes crear facturas');
    return db.transaction(async (tx) => {
      const p = await cargarProyecto(tx, ctx, id, 'editar');
      if (!p.clienteId) throw badRequest('El proyecto no tiene cliente');
      const [h] = await tx.select().from(pryHitos).where(and(eq(pryHitos.id, sid), eq(pryHitos.proyectoId, id))).for('update');
      if (!h) throw notFound('Hito no encontrado');
      if (h.estado === 'facturado') throw conflict('Este hito ya está facturado');
      const d = await crearDocumento(tx, ctx, {
        tipo: 'factura',
        fecha: hoy(),
        terceroId: p.clienteId,
        proyectoId: p.id,
        titulo: `${p.nombre} · ${h.nombre}`,
        origenTipo: 'pry_hito',
        origenId: h.id,
        descuentoGlobal: 0,
        lineas: [{ tipoLinea: 'articulo', descripcion: `${h.nombre}${h.porcentaje ? ` (${h.porcentaje} %)` : ''} · Proyecto ${p.codigo} ${p.nombre}`, cantidad: 1, precio: h.importe, descuento: 0, ivaTipo: h.ivaTipo, retencion: 0, coste: 0 }],
      });
      await tx.update(pryHitos).set({ estado: 'facturado', documentoId: d.id }).where(eq(pryHitos.id, sid));
      await audit(tx, ctx, 'facturar', 'pry_hito', sid, { documentoId: d.id });
      return { documentoId: d.id };
    });
  });

  /* ── Horas ── */
  const imputSchema = z.object({
    proyectoId: z.string().uuid('Elige el proyecto'),
    tareaId: z.string().uuid().nullish(),
    partidaId: z.string().uuid().nullish(),
    personaId: z.string().uuid().nullish(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
    horas: z.coerce.number().min(0.05, 'Indica las horas').max(24, 'No puede haber más de 24 horas en un día'),
    descripcion: z.string().trim().max(500).nullish(),
  });

  app.get('/imputaciones', async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const conds: (SQL | undefined)[] = [eq(pryImputaciones.empresaId, ctx.empresaId)];
    if (q.proyectoId) {
      const p = await cargarProyecto(db, ctx, q.proyectoId);
      conds.push(eq(pryImputaciones.proyectoId, p.id));
      // dentro de un proyecto que no gestiona, cada uno ve solo sus horas
      if (!(await puedeEditarProyecto(ctx, p)) && ctx.perms.get('pry.ver') !== 'todo') conds.push(eq(pryImputaciones.personaId, ctx.personaId ?? SISTEMA));
    } else conds.push(eq(pryImputaciones.personaId, q.personaId && can(ctx, 'pry.editar', 'todo') ? q.personaId : (ctx.personaId ?? SISTEMA)));
    if (q.desde) conds.push(gte(pryImputaciones.fecha, q.desde));
    if (q.hasta) conds.push(lte(pryImputaciones.fecha, q.hasta));
    const verCoste = can(ctx, 'pry.editar');
    const rows = await db
      .select({ i: pryImputaciones, persona: nombrePersona, proyecto: pryProyectos.nombre, proyectoCodigo: pryProyectos.codigo, color: pryProyectos.color, tarea: pryTareas.titulo, partida: pryPartidas.nombre })
      .from(pryImputaciones)
      .innerJoin(pryProyectos, eq(pryProyectos.id, pryImputaciones.proyectoId))
      .innerJoin(personas, eq(personas.id, pryImputaciones.personaId))
      .leftJoin(pryTareas, eq(pryTareas.id, pryImputaciones.tareaId))
      .leftJoin(pryPartidas, eq(pryPartidas.id, pryImputaciones.partidaId))
      .where(and(...conds))
      .orderBy(desc(pryImputaciones.fecha), desc(pryImputaciones.creadoEn))
      .limit(Math.min(2000, Number(q.limit) || 500));
    return rows.map((r) => ({ ...r.i, costeHora: verCoste ? r.i.costeHora : null, persona: r.persona, proyecto: r.proyecto, proyectoCodigo: r.proyectoCodigo, color: r.color, tarea: r.tarea, partida: r.partida }));
  });

  app.post('/imputaciones', { preHandler: guard('pry.imputar') }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(imputSchema, req.body);
    const r = await db.transaction(async (tx) => {
      const p = await cargarProyecto(tx, ctx, body.proyectoId);
      if (['terminado', 'cancelado'].includes(p.estado)) throw conflict(`El proyecto ${p.codigo} está ${p.estado}: ya no admite horas`);
      const gestiona = await puedeEditarProyecto(ctx, p);
      const personaId = body.personaId && body.personaId !== ctx.personaId ? (gestiona ? body.personaId : null) : ctx.personaId;
      if (!personaId) throw forbidden(body.personaId ? 'Solo quien gestiona el proyecto puede imputar horas de otras personas' : 'Tu usuario no está vinculado a una persona');
      if (body.fecha > hoy()) throw badRequest('No se pueden imputar horas de días futuros');
      let partidaId = body.partidaId ?? null;
      if (body.tareaId) {
        const [t] = await tx.select().from(pryTareas).where(and(eq(pryTareas.id, body.tareaId), eq(pryTareas.proyectoId, p.id)));
        if (!t) throw badRequest('La tarea no es de este proyecto');
        partidaId ??= t.partidaId;
        if (t.estado === 'pendiente') await tx.update(pryTareas).set({ estado: 'en_curso' }).where(eq(pryTareas.id, t.id));
      }
      if (partidaId) {
        const [pa] = await tx.select({ id: pryPartidas.id }).from(pryPartidas).where(and(eq(pryPartidas.id, partidaId), eq(pryPartidas.proyectoId, p.id)));
        if (!pa) throw badRequest('La partida no es de este proyecto');
      }
      const [dia] = await tx.select({ h: sql<number>`coalesce(sum(${pryImputaciones.horas}), 0)::float` }).from(pryImputaciones).where(and(eq(pryImputaciones.personaId, personaId), eq(pryImputaciones.fecha, body.fecha)));
      if ((dia?.h ?? 0) + body.horas > 24) throw badRequest(`Ya hay ${dia!.h} h imputadas ese día`);
      const costeHora = await costeHoraDe(tx, ctx.empresaId, personaId);
      const [row] = await tx
        .insert(pryImputaciones)
        .values({ empresaId: ctx.empresaId, proyectoId: p.id, tareaId: body.tareaId ?? null, partidaId, personaId, fecha: body.fecha, horas: body.horas, costeHora, descripcion: body.descripcion ?? null, creadoPor: usuarioDe(ctx) })
        .returning();
      await audit(tx, ctx, 'crear', 'pry_imputacion', row!.id, { proyecto: p.codigo, horas: body.horas, fecha: body.fecha });
      await comprobarDesviacion(tx, ctx, p, [partidaId]);
      return row!;
    });
    reply.code(201);
    return r;
  });

  app.delete('/imputaciones/:id', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const [i] = await tx.select().from(pryImputaciones).where(and(eq(pryImputaciones.id, id), eq(pryImputaciones.empresaId, ctx.empresaId)));
      if (!i) throw notFound();
      const p = await cargarProyecto(tx, ctx, i.proyectoId);
      if (i.personaId !== ctx.personaId && !(await puedeEditarProyecto(ctx, p))) throw forbidden();
      if (['terminado', 'cancelado'].includes(p.estado)) throw conflict('El proyecto está cerrado');
      await tx.delete(pryImputaciones).where(eq(pryImputaciones.id, id));
      await audit(tx, ctx, 'borrar', 'pry_imputacion', id, i);
    });
    return { ok: true };
  });

  /** Mis horas: semana o rango, con los proyectos en los que puedo imputar. */
  app.get('/mis-horas', { preHandler: guard('pry.imputar') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { desde?: string; hasta?: string };
    const hasta = q.hasta ?? hoy();
    const desde = q.desde ?? new Date(Date.now() - 13 * 86400_000).toISOString().slice(0, 10);
    const pid = ctx.personaId ?? SISTEMA;
    const items = await db
      .select({ i: pryImputaciones, proyecto: pryProyectos.nombre, codigo: pryProyectos.codigo, color: pryProyectos.color, tarea: pryTareas.titulo })
      .from(pryImputaciones)
      .innerJoin(pryProyectos, eq(pryProyectos.id, pryImputaciones.proyectoId))
      .leftJoin(pryTareas, eq(pryTareas.id, pryImputaciones.tareaId))
      .where(and(eq(pryImputaciones.personaId, pid), gte(pryImputaciones.fecha, desde), lte(pryImputaciones.fecha, hasta)))
      .orderBy(desc(pryImputaciones.fecha), desc(pryImputaciones.creadoEn));
    const proyectos = await db
      .select({ id: pryProyectos.id, codigo: pryProyectos.codigo, nombre: pryProyectos.nombre, color: pryProyectos.color, cliente: terceros.nombre })
      .from(pryProyectos)
      .leftJoin(terceros, eq(terceros.id, pryProyectos.clienteId))
      .where(and(eq(pryProyectos.empresaId, ctx.empresaId), isNull(pryProyectos.archivadoEn), inArray(pryProyectos.estado, ['planificado', 'en_curso', 'pausado']), or(eq(pryProyectos.responsableId, pid), sql`${pid}::uuid = ANY(${pryProyectos.miembros})`, (await proyectosVisibles(ctx)) ?? sql`true`)))
      .orderBy(asc(pryProyectos.codigo))
      .limit(200);
    const misTareas = await db
      .select({ id: pryTareas.id, titulo: pryTareas.titulo, proyectoId: pryTareas.proyectoId, estado: pryTareas.estado, fechaFin: pryTareas.fechaFin })
      .from(pryTareas)
      .innerJoin(pryProyectos, eq(pryProyectos.id, pryTareas.proyectoId))
      .where(and(eq(pryTareas.asignadoId, pid), inArray(pryTareas.estado, ['pendiente', 'en_curso', 'revision']), isNull(pryProyectos.archivadoEn)))
      .orderBy(sql`${pryTareas.fechaFin} NULLS LAST`)
      .limit(50);
    const porDia: Record<string, number> = {};
    for (const r of items) porDia[r.i.fecha] = round((porDia[r.i.fecha] ?? 0) + r.i.horas, 2);
    return { desde, hasta, total: round(items.reduce((a, r) => a + r.i.horas, 0), 2), porDia, items: items.map((r) => ({ ...r.i, costeHora: undefined, proyecto: r.proyecto, codigo: r.codigo, color: r.color, tarea: r.tarea })), proyectos, tareas: misTareas };
  });

  app.get('/costes-persona', { preHandler: guard('pry.editar', 'todo') }, async (req) =>
    db
      .select({ personaId: personas.id, nombre: nombrePersona, puesto: personas.puesto, costeHora: pryCostesPersona.costeHora })
      .from(personas)
      .leftJoin(pryCostesPersona, eq(pryCostesPersona.personaId, personas.id))
      .where(and(eq(personas.empresaId, req.ctx.empresaId), eq(personas.activo, true), isNull(personas.archivadoEn)))
      .orderBy(asc(personas.nombre)),
  );
  app.put('/costes-persona/:personaId', { preHandler: guard('pry.editar', 'todo') }, async (req) => {
    const ctx = req.ctx;
    const { personaId } = req.params as { personaId: string };
    const { costeHora } = parse(z.object({ costeHora: z.coerce.number().min(0).max(1000) }), req.body);
    return db.transaction(async (tx) => {
      const [p] = await tx.select({ id: personas.id }).from(personas).where(and(eq(personas.id, personaId), eq(personas.empresaId, ctx.empresaId)));
      if (!p) throw notFound();
      const [r] = await tx.insert(pryCostesPersona).values({ personaId, empresaId: ctx.empresaId, costeHora }).onConflictDoUpdate({ target: pryCostesPersona.personaId, set: { costeHora } }).returning();
      await audit(tx, ctx, 'editar', 'pry_coste_persona', personaId, { costeHora });
      return r;
    });
  });

  /* ── Material ── */
  app.get('/proyectos/:id/material', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await cargarProyecto(db, ctx, id);
    const rows = await db
      .select({ c: pryConsumos, referencia: articulos.referencia, persona: nombrePersona, partida: pryPartidas.nombre, almacen: sql<string | null>`(SELECT nombre FROM stk_almacenes a WHERE a.id = ${pryConsumos.almacenId})` })
      .from(pryConsumos)
      .leftJoin(articulos, eq(articulos.id, pryConsumos.articuloId))
      .leftJoin(personas, eq(personas.id, pryConsumos.personaId))
      .leftJoin(pryPartidas, eq(pryPartidas.id, pryConsumos.partidaId))
      .where(eq(pryConsumos.proyectoId, id))
      .orderBy(desc(pryConsumos.fecha), desc(pryConsumos.creadoEn));
    return rows.map((r) => ({ ...r.c, referencia: r.referencia, persona: r.persona, partida: r.partida, almacen: r.almacen, importe: round(r.c.cantidad * r.c.costeUnitario) }));
  });

  app.post('/proyectos/:id/material', { preHandler: guard('pry.imputar') }, async (req, reply) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        almacenId: z.string().uuid().nullish(),
        partidaId: z.string().uuid().nullish(),
        lineas: z
          .array(z.object({ articuloId: z.string().uuid().nullish(), descripcion: z.string().trim().max(300).nullish(), cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero'), costeUnitario: z.coerce.number().min(0).nullish(), lote: z.string().nullish(), series: z.array(z.string()).nullish() }))
          .min(1, 'Añade algún material')
          .max(200),
      }),
      req.body,
    );
    const r = await db.transaction(async (tx) => registrarMaterial(tx, ctx, id, body));
    reply.code(201);
    return r;
  });

  app.post('/material/:id/devolver', { preHandler: guard('pry.imputar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const { cantidad } = parse(z.object({ cantidad: z.coerce.number().positive().optional() }), req.body ?? {});
    return db.transaction(async (tx) => {
      const [c] = await tx.select().from(pryConsumos).where(and(eq(pryConsumos.id, id), eq(pryConsumos.empresaId, ctx.empresaId)));
      if (!c) throw notFound();
      if (c.cantidad <= 0) throw badRequest('Esa línea ya es una devolución');
      const p = await cargarProyecto(tx, ctx, c.proyectoId);
      if (c.personaId !== ctx.personaId && !(await puedeEditarProyecto(ctx, p))) throw forbidden();
      const [dev] = await tx.select({ d: sql<number>`coalesce(sum(-${pryConsumos.cantidad}), 0)::float` }).from(pryConsumos).where(eq(pryConsumos.devueltoDeId, c.id));
      const max = round(c.cantidad - (dev?.d ?? 0), 4);
      const q = Math.min(cantidad ?? max, max);
      if (q <= 0) throw conflict('Ya se devolvió todo');
      const [row] = await tx
        .insert(pryConsumos)
        .values({ empresaId: ctx.empresaId, proyectoId: c.proyectoId, partidaId: c.partidaId, articuloId: c.articuloId, descripcion: `Devolución: ${c.descripcion}`, cantidad: -q, costeUnitario: c.costeUnitario, almacenId: c.almacenId, lote: c.lote, fecha: hoy(), personaId: ctx.personaId, devueltoDeId: c.id, creadoPor: usuarioDe(ctx) })
        .returning();
      if (c.articuloId) await emit(tx, ctx, 'pry.material_consumido', { proyectoId: c.proyectoId, lineas: [{ lineaId: row!.id, articuloId: c.articuloId, almacenId: c.almacenId, cantidad: -q, lote: c.lote }] });
      await audit(tx, ctx, 'devolver', 'pry_consumo', c.id, { cantidad: q });
      return row;
    });
  });

  /* ── Documentos comerciales del proyecto (compras y ventas) ── */
  app.get('/proyectos/:id/documentos-resumen', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await cargarProyecto(db, ctx, id);
    return db
      .select({ tipo: documentos.tipo, n: sql<number>`count(*)::int`, base: sql<number>`coalesce(sum(${documentos.baseImponible}), 0)::float` })
      .from(documentos)
      .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.proyectoId, id), isNull(documentos.archivadoEn)))
      .groupBy(documentos.tipo);
  });
}

/** Material consumido: guarda el coste en el proyecto y publica el evento para que STK descuente el stock. */
export async function registrarMaterial(
  tx: Tx,
  ctx: Ctx,
  proyectoId: string,
  body: { fecha?: string; almacenId?: string | null; partidaId?: string | null; lineas: { articuloId?: string | null; descripcion?: string | null; cantidad: number; costeUnitario?: number | null; lote?: string | null; series?: string[] | null }[] },
) {
  const p = await cargarProyecto(tx, ctx, proyectoId);
  if (['terminado', 'cancelado'].includes(p.estado)) throw conflict(`El proyecto ${p.codigo} está cerrado`);
  if (body.partidaId) {
    const [pa] = await tx.select({ id: pryPartidas.id }).from(pryPartidas).where(and(eq(pryPartidas.id, body.partidaId), eq(pryPartidas.proyectoId, p.id)));
    if (!pa) throw badRequest('La partida no es de este proyecto');
  }
  // por defecto sale de la furgoneta de quien lo registra, si tiene
  let almacenId = body.almacenId ?? null;
  if (!almacenId && ctx.modules.has('stk') && ctx.personaId) {
    const [f] = await tx.select({ id: stkAlmacenes.id }).from(stkAlmacenes).where(and(eq(stkAlmacenes.empresaId, ctx.empresaId), eq(stkAlmacenes.personaId, ctx.personaId), eq(stkAlmacenes.tipo, 'furgoneta'), eq(stkAlmacenes.activo, true))).limit(1);
    almacenId = f?.id ?? null;
  }
  const ids = body.lineas.map((l) => l.articuloId).filter(Boolean) as string[];
  const arts = ids.length ? await tx.select().from(articulos).where(and(eq(articulos.empresaId, ctx.empresaId), inArray(articulos.id, ids))) : [];
  const rows = [];
  for (const l of body.lineas) {
    const a = arts.find((x) => x.id === l.articuloId);
    if (l.articuloId && !a) throw badRequest('Algún artículo no existe');
    if (!a && !l.descripcion) throw badRequest('Describe el material o elige un artículo');
    const coste = l.costeUnitario ?? (a ? await costeArticulo(tx, ctx, a.id, almacenId) : 0);
    const [row] = await tx
      .insert(pryConsumos)
      .values({ empresaId: ctx.empresaId, proyectoId: p.id, partidaId: body.partidaId ?? null, articuloId: a?.id ?? null, descripcion: a ? `${a.referencia} · ${a.nombre}` : l.descripcion!, cantidad: l.cantidad, costeUnitario: coste, almacenId, lote: l.lote || null, fecha: body.fecha ?? hoy(), personaId: ctx.personaId, creadoPor: usuarioDe(ctx) })
      .returning();
    rows.push({ row: row!, series: l.series });
  }
  const lineas = rows.filter((r) => r.row.articuloId).map((r) => ({ lineaId: r.row.id, articuloId: r.row.articuloId!, almacenId: r.row.almacenId, cantidad: r.row.cantidad, lote: r.row.lote, series: r.series ?? null }));
  if (lineas.length) await emit(tx, ctx, 'pry.material_consumido', { proyectoId: p.id, lineas });
  await audit(tx, ctx, 'consumir', 'pry_proyecto', p.id, { lineas: rows.map((r) => ({ descripcion: r.row.descripcion, cantidad: r.row.cantidad })) });
  await comprobarDesviacion(tx, ctx, p, [body.partidaId]);
  return { consumos: rows.map((r) => r.row) };
}
