import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actShared, round, toZod } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { personas, terceros } from '../../db/schema/core';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { fileUrl } from '../../core/files';
import { nextCode } from '../../core/numbering';
import { can, canOnOwner, guard, scopeCondition } from '../../core/permissions';
import { resolveRefs } from '../../core/refs';
import { actActivos, actAmortizaciones, actAsignaciones, actRegistros, actVencimientos } from './schema';
import { amortizarPeriodo, completarVencimiento, periodoAnterior, resumenActivo } from './service';

const { activoResource, vencimientoResource, registroResource } = actShared;
const SISTEMA = '00000000-0000-0000-0000-000000000000';
const usuarioDe = (ctx: Ctx) => (ctx.usuarioId === SISTEMA ? null : ctx.usuarioId);
const hoy = () => new Date().toISOString().slice(0, 10);
const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;
const PREFIJO: Record<string, string> = { vehiculo: 'VEH', maquinaria: 'MAQ', informatica: 'INF', herramienta: 'HER', otro: 'ACT' };

export async function codigoActivo(tx: Tx, empresaId: string, tipo: string) {
  const prefijo = PREFIJO[tipo] ?? 'ACT';
  const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(actActivos).where(and(eq(actActivos.empresaId, empresaId), sql`${actActivos.codigo} LIKE ${prefijo + '-%'}`));
  // código corto y estable por tipo (VEH-0001); si choca se usa la secuencia general
  const propuesto = `${prefijo}-${String((m?.n ?? 0) + 1).padStart(4, '0')}`;
  const [existe] = await tx.select({ id: actActivos.id }).from(actActivos).where(and(eq(actActivos.empresaId, empresaId), eq(actActivos.codigo, propuesto)));
  return existe ? nextCode(tx, empresaId, `act_${tipo}`, prefijo) : propuesto;
}

/** Carga un activo comprobando que el usuario lo puede ver (con "propio", solo los que tiene asignados). */
async function cargarActivo(tx: Tx | typeof db, ctx: Ctx, id: string) {
  const [a] = await tx.select().from(actActivos).where(and(eq(actActivos.id, id), eq(actActivos.empresaId, ctx.empresaId)));
  if (!a || !(await canOnOwner(ctx, 'act.ver', a.asignadoId))) throw notFound('Activo no encontrado');
  return a;
}

export async function actRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: '/activos',
    resource: activoResource,
    table: actActivos,
    entity: 'act_activo',
    perms: { ver: 'act.ver', crear: 'act.gestionar' },
    scopeCol: actActivos.asignadoId,
    beforeSave: async (tx, ctx, data, existing) => {
      if (!existing) {
        data.codigo = await codigoActivo(tx, ctx.empresaId, data.tipo ?? 'otro');
        data.cuentaAmortizacion ||= '281';
        data.cuentaGasto ||= '681';
      }
      return data;
    },
    afterSave: async (tx, ctx, row, existing) => {
      // si cambia la persona asignada desde el formulario, queda en el historial
      if ((existing?.asignadoId ?? null) === (row.asignadoId ?? null)) return;
      await tx.update(actAsignaciones).set({ hasta: hoy() }).where(and(eq(actAsignaciones.activoId, row.id), isNull(actAsignaciones.hasta)));
      if (row.asignadoId) await tx.insert(actAsignaciones).values({ empresaId: ctx.empresaId, activoId: row.id, personaId: row.asignadoId, desde: hoy(), kmEntrega: row.km ?? null, creadoPor: usuarioDe(ctx) });
    },
    // un técnico con alcance "propio" solo ve sus activos: la creación exige act.gestionar
  });

  app.get('/activos/:id/resumen', async (req) => {
    const a = await cargarActivo(db, req.ctx, (req.params as { id: string }).id);
    const proximos = await db.select().from(actVencimientos).where(and(eq(actVencimientos.activoId, a.id), eq(actVencimientos.estado, 'pendiente'))).orderBy(asc(actVencimientos.fecha)).limit(5);
    return { ...(await resumenActivo(db, a)), proximos, puedeGestionar: can(req.ctx, 'act.gestionar') };
  });

  /* ── Vencimientos ── */
  app.get('/vencimientos', { preHandler: guard('act.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const conds: (SQL | undefined)[] = [eq(actVencimientos.empresaId, ctx.empresaId), isNull(actActivos.archivadoEn), await scopeCondition(ctx, ctx.perms.get('act.ver')!, actActivos.asignadoId)];
    if (q.activoId) conds.push(eq(actVencimientos.activoId, q.activoId));
    if (q.estado) conds.push(inArray(actVencimientos.estado, q.estado.split(',')));
    if (q.tipo) conds.push(eq(actVencimientos.tipo, q.tipo));
    if (q.desde) conds.push(gte(actVencimientos.fecha, q.desde));
    if (q.hasta) conds.push(lte(actVencimientos.fecha, q.hasta));
    const rows = await db
      .select({ v: actVencimientos, activo: actActivos.nombre, codigo: actActivos.codigo, matricula: actActivos.matricula, tipoActivo: actActivos.tipo, asignadoId: actActivos.asignadoId, asignado: nombrePersona })
      .from(actVencimientos)
      .innerJoin(actActivos, eq(actActivos.id, actVencimientos.activoId))
      .leftJoin(personas, eq(personas.id, actActivos.asignadoId))
      .where(and(...conds))
      .orderBy(q.estado === 'hecho' ? desc(actVencimientos.fecha) : asc(actVencimientos.fecha))
      .limit(Math.min(1000, Number(q.limit) || 300));
    const h = hoy();
    return rows.map((r) => {
      const dias = Math.round((Date.parse(r.v.fecha) - Date.parse(h)) / 86400_000);
      return { ...r.v, activo: r.activo, codigo: r.codigo, matricula: r.matricula, tipoActivo: r.tipoActivo, asignadoId: r.asignadoId, asignado: r.asignado, dias, enAviso: r.v.estado === 'pendiente' && dias <= r.v.avisoDias, vencido: r.v.estado === 'pendiente' && dias < 0 };
    });
  });

  registerCrud(app, {
    path: '/vencimientos',
    resource: vencimientoResource,
    table: actVencimientos,
    entity: 'act_vencimiento',
    perms: { ver: 'act.gestionar', crear: 'act.gestionar' },
    hardDelete: true,
    only: ['get', 'create', 'update', 'delete'],
    beforeSave: async (tx, ctx, data, existing) => {
      if (data.activoId) {
        const [a] = await tx.select({ id: actActivos.id }).from(actActivos).where(and(eq(actActivos.id, data.activoId), eq(actActivos.empresaId, ctx.empresaId)));
        if (!a) throw badRequest('El activo no existe');
      }
      // si se cambia la fecha se vuelve a avisar
      if (existing && data.fecha && data.fecha !== existing.fecha) data.avisadoEn = null;
      return data;
    },
  });

  app.post('/vencimientos/:id/completar', { preHandler: guard('act.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(hoy()), coste: z.coerce.number().min(0).nullish(), proveedorId: z.string().uuid().nullish(), km: z.coerce.number().int().min(0).nullish(), notas: z.string().max(500).nullish(), archivoId: z.string().uuid().nullish() }),
      req.body ?? {},
    );
    return db.transaction(async (tx) => {
      const [v] = await tx.select().from(actVencimientos).where(and(eq(actVencimientos.id, id), eq(actVencimientos.empresaId, ctx.empresaId))).for('update');
      if (!v) throw notFound();
      if (v.estado !== 'pendiente') throw conflict('Este vencimiento ya está resuelto');
      const r = await completarVencimiento(tx, ctx, v, body);
      await audit(tx, ctx, 'completar', 'act_vencimiento', id, { siguiente: r.siguiente?.fecha ?? null });
      return r;
    });
  });

  app.post('/vencimientos/:id/cancelar', { preHandler: guard('act.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const r = await tx.update(actVencimientos).set({ estado: 'cancelado' }).where(and(eq(actVencimientos.id, id), eq(actVencimientos.empresaId, req.ctx.empresaId), eq(actVencimientos.estado, 'pendiente'))).returning();
      if (!r.length) throw notFound();
      await audit(tx, req.ctx, 'cancelar', 'act_vencimiento', id);
    });
    return { ok: true };
  });

  /* ── Registros (mantenimientos, combustible, km…) ── */
  app.get('/activos/:id/registros', async (req) => {
    const ctx = req.ctx;
    const a = await cargarActivo(db, ctx, (req.params as { id: string }).id);
    const rows = await db
      .select({ r: actRegistros, proveedor: terceros.nombre, persona: nombrePersona })
      .from(actRegistros)
      .leftJoin(terceros, eq(terceros.id, actRegistros.proveedorId))
      .leftJoin(personas, eq(personas.id, actRegistros.personaId))
      .where(eq(actRegistros.activoId, a.id))
      .orderBy(desc(actRegistros.fecha), desc(actRegistros.creadoEn))
      .limit(500);
    return rows.map((x) => ({ ...x.r, proveedor: x.proveedor, persona: x.persona, archivoUrl: fileUrl(x.r.archivoId) }));
  });

  const registroCreate = toZod(registroResource, { omit: ['activoId'] });
  app.post('/activos/:id/registros', { preHandler: guard('act.ver') }, async (req, reply) => {
    const ctx = req.ctx;
    const data = parse(registroCreate, req.body) as Record<string, any>;
    const r = await db.transaction(async (tx) => {
      const a = await cargarActivo(tx, ctx, (req.params as { id: string }).id);
      // quien lleva el vehículo puede apuntar repostajes y kilómetros; el resto lo registra quien gestiona activos
      const propio = a.asignadoId && a.asignadoId === ctx.personaId && ['combustible', 'km'].includes(data.tipo);
      if (!can(ctx, 'act.gestionar') && !propio) throw forbidden('Solo puedes registrar repostajes y kilómetros de tus vehículos');
      if (data.km && a.km && data.km < a.km - 5 && data.tipo === 'km') throw badRequest(`El vehículo ya marcaba ${a.km} km`);
      const [row] = await tx.insert(actRegistros).values({ ...data, empresaId: ctx.empresaId, activoId: a.id, personaId: ctx.personaId, creadoPor: usuarioDe(ctx) } as typeof actRegistros.$inferInsert).returning();
      if (data.km && (a.km ?? 0) < data.km) await tx.update(actActivos).set({ km: data.km }).where(eq(actActivos.id, a.id));
      await audit(tx, ctx, 'crear', 'act_registro', row!.id, { activo: a.codigo, tipo: data.tipo, coste: data.coste });
      return row!;
    });
    reply.code(201);
    return r;
  });

  registerCrud(app, {
    path: '/registros',
    resource: registroResource,
    table: actRegistros,
    entity: 'act_registro',
    perms: { ver: 'act.gestionar', crear: 'act.gestionar' },
    hardDelete: true,
    only: ['get', 'update', 'delete'],
  });

  /* ── Asignaciones (entrega y devolución firmadas) ── */
  app.get('/activos/:id/asignaciones', async (req) => {
    const a = await cargarActivo(db, req.ctx, (req.params as { id: string }).id);
    const rows = await db
      .select({ x: actAsignaciones, persona: nombrePersona })
      .from(actAsignaciones)
      .innerJoin(personas, eq(personas.id, actAsignaciones.personaId))
      .where(eq(actAsignaciones.activoId, a.id))
      .orderBy(desc(actAsignaciones.desde), desc(actAsignaciones.creadoEn));
    return rows.map((r) => ({ ...r.x, firmaEntrega: !!r.x.firmaEntrega, firmaDevolucion: !!r.x.firmaDevolucion, persona: r.persona }));
  });

  app.get('/asignaciones/:id/firma/:cual', async (req) => {
    const { id, cual } = req.params as { id: string; cual: string };
    const [x] = await db.select().from(actAsignaciones).where(and(eq(actAsignaciones.id, id), eq(actAsignaciones.empresaId, req.ctx.empresaId)));
    if (!x) throw notFound();
    await cargarActivo(db, req.ctx, x.activoId);
    const firma = cual === 'devolucion' ? x.firmaDevolucion : x.firmaEntrega;
    if (!firma) throw notFound('Sin firma');
    return { firma };
  });

  const firmaSchema = z.string().startsWith('data:image/png').max(400_000).nullish();
  app.post('/activos/:id/asignar', { preHandler: guard('act.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(z.object({ personaId: z.string().uuid('Elige la persona'), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(hoy()), km: z.coerce.number().int().min(0).nullish(), notas: z.string().max(1000).nullish(), firma: firmaSchema }), req.body);
    return db.transaction(async (tx) => {
      const [a] = await tx.select().from(actActivos).where(and(eq(actActivos.id, (req.params as { id: string }).id), eq(actActivos.empresaId, ctx.empresaId))).for('update');
      if (!a) throw notFound();
      if (a.estado === 'baja') throw conflict('El activo está de baja');
      const [p] = await tx.select({ id: personas.id }).from(personas).where(and(eq(personas.id, body.personaId), eq(personas.empresaId, ctx.empresaId)));
      if (!p) throw badRequest('La persona no existe');
      await tx.update(actAsignaciones).set({ hasta: body.fecha, kmDevolucion: body.km ?? a.km }).where(and(eq(actAsignaciones.activoId, a.id), isNull(actAsignaciones.hasta)));
      const [x] = await tx.insert(actAsignaciones).values({ empresaId: ctx.empresaId, activoId: a.id, personaId: body.personaId, desde: body.fecha, kmEntrega: body.km ?? a.km, notasEntrega: body.notas ?? null, firmaEntrega: body.firma ?? null, creadoPor: usuarioDe(ctx) }).returning();
      await tx.update(actActivos).set({ asignadoId: body.personaId, estado: 'activo', km: body.km && body.km > (a.km ?? 0) ? body.km : a.km }).where(eq(actActivos.id, a.id));
      await audit(tx, ctx, 'asignar', 'act_activo', a.id, { personaId: body.personaId, firmado: !!body.firma });
      return { ...x, firmaEntrega: !!x!.firmaEntrega };
    });
  });

  app.post('/activos/:id/devolver', { preHandler: guard('act.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(hoy()), km: z.coerce.number().int().min(0).nullish(), notas: z.string().max(1000).nullish(), firma: firmaSchema }), req.body ?? {});
    return db.transaction(async (tx) => {
      const [a] = await tx.select().from(actActivos).where(and(eq(actActivos.id, (req.params as { id: string }).id), eq(actActivos.empresaId, ctx.empresaId))).for('update');
      if (!a) throw notFound();
      if (!a.asignadoId) throw conflict('El activo no está asignado a nadie');
      await tx.update(actAsignaciones).set({ hasta: body.fecha, kmDevolucion: body.km ?? a.km, notasDevolucion: body.notas ?? null, firmaDevolucion: body.firma ?? null }).where(and(eq(actAsignaciones.activoId, a.id), isNull(actAsignaciones.hasta)));
      await tx.update(actActivos).set({ asignadoId: null, estado: 'disponible', km: body.km && body.km > (a.km ?? 0) ? body.km : a.km }).where(eq(actActivos.id, a.id));
      await audit(tx, ctx, 'devolver', 'act_activo', a.id, { personaId: a.asignadoId });
      return { ok: true };
    });
  });

  /* ── Amortizaciones ── */
  app.get('/activos/:id/amortizaciones', async (req) => {
    const a = await cargarActivo(db, req.ctx, (req.params as { id: string }).id);
    if (!can(req.ctx, 'act.gestionar') && !can(req.ctx, 'cnt.ver')) return [];
    return db.select().from(actAmortizaciones).where(eq(actAmortizaciones.activoId, a.id)).orderBy(desc(actAmortizaciones.periodo));
  });

  app.get('/amortizaciones', { preHandler: guard(['act.gestionar', 'cnt.ver']) }, async (req) => {
    const q = req.query as { periodo?: string };
    const periodo = q.periodo ?? periodoAnterior();
    const rows = await db
      .select({ m: actAmortizaciones, codigo: actActivos.codigo, nombre: actActivos.nombre, cuentaGasto: actActivos.cuentaGasto, cuentaAmortizacion: actActivos.cuentaAmortizacion })
      .from(actAmortizaciones)
      .innerJoin(actActivos, eq(actActivos.id, actAmortizaciones.activoId))
      .where(and(eq(actAmortizaciones.empresaId, req.ctx.empresaId), eq(actAmortizaciones.periodo, periodo)))
      .orderBy(asc(actActivos.codigo));
    return { periodo, total: round(rows.reduce((a, r) => a + r.m.importe, 0)), items: rows.map((r) => ({ ...r.m, codigo: r.codigo, nombre: r.nombre, cuentaGasto: r.cuentaGasto, cuentaAmortizacion: r.cuentaAmortizacion })) };
  });

  app.post('/amortizaciones/generar', { preHandler: guard('act.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { periodo, activoId } = parse(z.object({ periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo no válido (AAAA-MM)').default(periodoAnterior()), activoId: z.string().uuid().nullish() }), req.body ?? {});
    if (periodo > new Date().toISOString().slice(0, 7)) throw badRequest('No se puede amortizar un mes futuro');
    return db.transaction(async (tx) => {
      const r = await amortizarPeriodo(tx, ctx, periodo, activoId ?? undefined);
      await audit(tx, ctx, 'amortizar', 'act_amortizacion', null, r);
      return r;
    });
  });

  /* ── Flota ── */
  app.get('/flota', { preHandler: guard('act.ver') }, async (req) => {
    const ctx = req.ctx;
    const scope = await scopeCondition(ctx, ctx.perms.get('act.ver')!, actActivos.asignadoId);
    const vehs = await db
      .select({ a: actActivos, asignado: nombrePersona })
      .from(actActivos)
      .leftJoin(personas, eq(personas.id, actActivos.asignadoId))
      .where(and(eq(actActivos.empresaId, ctx.empresaId), eq(actActivos.tipo, 'vehiculo'), isNull(actActivos.archivadoEn), scope))
      .orderBy(asc(actActivos.codigo));
    const out = [];
    for (const v of vehs) {
      const r = await resumenActivo(db, v.a);
      const [prox] = await db.select().from(actVencimientos).where(and(eq(actVencimientos.activoId, v.a.id), eq(actVencimientos.estado, 'pendiente'))).orderBy(asc(actVencimientos.fecha)).limit(1);
      out.push({ ...v.a, asignado: v.asignado, costes: r.costes, valorNeto: r.amortizacion?.valorNeto ?? v.a.valorCompra, proximoVencimiento: prox ?? null });
    }
    const total = out.reduce((a, v) => a + v.costes.ultimoAnio, 0);
    const km = out.reduce((a, v) => a + v.costes.kmRecorridos, 0);
    return { vehiculos: out, resumen: { vehiculos: out.length, costeAnio: round(total), kmRecorridos: km, costeKm: km ? round(out.reduce((a, v) => a + v.costes.total, 0) / km, 3) : null } };
  });

  /** Activos de una persona (pestaña de su ficha). */
  app.get('/persona/:personaId', { preHandler: guard('act.ver') }, async (req) => {
    const ctx = req.ctx;
    const { personaId } = req.params as { personaId: string };
    if (!(await canOnOwner(ctx, 'act.ver', personaId))) return { activos: [], historial: [] };
    const activos = await db.select().from(actActivos).where(and(eq(actActivos.empresaId, ctx.empresaId), eq(actActivos.asignadoId, personaId), isNull(actActivos.archivadoEn))).orderBy(asc(actActivos.codigo));
    const historial = await db
      .select({ x: actAsignaciones, codigo: actActivos.codigo, nombre: actActivos.nombre, tipo: actActivos.tipo })
      .from(actAsignaciones)
      .innerJoin(actActivos, eq(actActivos.id, actAsignaciones.activoId))
      .where(and(eq(actAsignaciones.personaId, personaId), eq(actAsignaciones.empresaId, ctx.empresaId)))
      .orderBy(desc(actAsignaciones.desde))
      .limit(50);
    const vencs = activos.length
      ? await db.select().from(actVencimientos).where(and(inArray(actVencimientos.activoId, activos.map((a) => a.id)), eq(actVencimientos.estado, 'pendiente'))).orderBy(asc(actVencimientos.fecha))
      : [];
    return {
      activos: activos.map((a) => ({ ...a, proximo: vencs.find((v) => v.activoId === a.id) ?? null })),
      historial: historial.map((h) => ({ ...h.x, firmaEntrega: !!h.x.firmaEntrega, firmaDevolucion: !!h.x.firmaDevolucion, codigo: h.codigo, nombre: h.nombre, tipo: h.tipo })),
      refs: await resolveRefs(ctx, activoResource, activos),
    };
  });
}
