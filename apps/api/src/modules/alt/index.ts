import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { altShared, fmtDate, optionLabel, type ApprovalItem, type DashboardWidget } from '@kite/shared';
import { db, type DbOrTx, type Tx } from '../../db/client';
import { departamentos, personas, tareas, usuarioEmpresas } from '../../db/schema/core';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { emit } from '../../core/events';
import { fileUrl } from '../../core/files';
import { defineModule } from '../../core/modules';
import { notify } from '../../core/notify';
import { can, canOnOwner, guard, invalidatePermissions } from '../../core/permissions';
import { ficTrabajadores } from '../fic/schema';
import { condAlcance, nombrePersona, nombres, personaPorId } from '../fic/personas';
import { addDays, hoyMadrid } from '../hor/tiempo';
import { ausSolicitudes, ausTipos } from '../aus/schema';
import { saldos } from '../aus/calculo';
import { altCandidatos, altEvaluaciones, altOfertas, altPlanFormacion, altPlantillas, altProcesoTareas, altProcesos } from './schema';
import { seedAlt } from './seed';

const { ofertaResource, candidatoResource, planFormacionResource, CANDIDATO_ESTADOS, PROCESO_TIPOS, puntuacionGlobal } = altShared;
type PlantillaTarea = altShared.PlantillaTarea;
const fechaRe = /^\d{4}-\d{2}-\d{2}$/;

const tareaSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().max(2000).nullish(),
  responsable: z.enum(['rrhh', 'responsable', 'persona', 'departamento', 'concreta']),
  departamentoId: z.string().uuid().nullish(),
  personaId: z.string().uuid().nullish(),
  dias: z.coerce.number().int().min(-90).max(365).default(0),
});

/* ──────────────── Procesos de alta y baja ──────────────── */

/** Material asignado a la persona en Activos (si el módulo está activo). */
export async function activosAsignados(ctx: Ctx, personaId: string): Promise<{ id: string; nombre: string; codigo: string | null }[]> {
  if (!ctx.modules.has('act')) return [];
  try {
    const cols = await db.execute<{ column_name: string }>(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'act_activos' AND column_name IN ('asignado_persona_id', 'asignado_id')`);
    const col = cols.find((c) => c.column_name === 'asignado_persona_id')?.column_name ?? cols[0]?.column_name;
    if (!col) return [];
    const rows = await db.execute<Record<string, any>>(sql`SELECT * FROM act_activos WHERE ${sql.identifier(col)} = ${personaId} AND archivado_en IS NULL`);
    return rows.map((r) => ({ id: r.id, nombre: r.nombre ?? r.descripcion ?? 'Activo', codigo: r.codigo ?? r.matricula ?? null }));
  } catch {
    return [];
  }
}

async function resolverAsignado(tx: DbOrTx, ctx: Ctx, t: PlantillaTarea, persona: { id: string; responsableId: string | null }) {
  switch (t.responsable) {
    case 'persona':
      return persona.id;
    case 'responsable':
      return persona.responsableId ?? ctx.personaId;
    case 'departamento': {
      if (!t.departamentoId) return ctx.personaId;
      const [d] = await tx.select({ r: departamentos.responsableId }).from(departamentos).where(eq(departamentos.id, t.departamentoId));
      return d?.r ?? ctx.personaId;
    }
    case 'concreta':
      return t.personaId ?? ctx.personaId;
    default:
      return ctx.personaId;
  }
}

/** Crea el proceso y sus tareas (tareas del núcleo asignadas a cada responsable). */
async function crearProceso(
  tx: Tx,
  ctx: Ctx,
  o: { personaId: string; tipo: 'alta' | 'baja'; fecha: string; plantillaId?: string | null; motivo?: string | null; candidatoId?: string | null; bloquearAcceso?: boolean; extra?: PlantillaTarea[]; notas?: string | null },
) {
  const [p] = await tx.select({ id: personas.id, responsableId: personas.responsableId, nombre: nombrePersona }).from(personas).where(eq(personas.id, o.personaId));
  if (!p) throw notFound('Persona no encontrada');
  let lista: PlantillaTarea[] = [];
  if (o.plantillaId) {
    const [pl] = await tx.select().from(altPlantillas).where(and(eq(altPlantillas.id, o.plantillaId), eq(altPlantillas.empresaId, ctx.empresaId)));
    if (!pl) throw badRequest('Plantilla no válida');
    if (pl.tipo !== o.tipo) throw badRequest('La plantilla no corresponde a este tipo de proceso');
    lista = pl.tareas;
  }
  lista = [...lista, ...(o.extra ?? [])];
  const [proc] = await tx
    .insert(altProcesos)
    .values({ empresaId: ctx.empresaId, personaId: o.personaId, tipo: o.tipo, plantillaId: o.plantillaId ?? null, fecha: o.fecha, motivo: o.motivo ?? null, candidatoId: o.candidatoId ?? null, bloquearAcceso: o.bloquearAcceso ?? o.tipo === 'baja', notas: o.notas ?? null, creadoPor: ctx.usuarioId })
    .returning();
  const asignados = new Map<string, string[]>();
  let orden = 0;
  for (const t of lista) {
    const asignadoA = await resolverAsignado(tx, ctx, t, p);
    const [tarea] = await tx
      .insert(tareas)
      .values({
        empresaId: ctx.empresaId,
        titulo: `${t.titulo} · ${p.nombre}`,
        descripcion: [t.descripcion, `${o.tipo === 'alta' ? 'Incorporación' : 'Salida'} prevista el ${fmtDate(o.fecha)}.`].filter(Boolean).join('\n'),
        asignadoA: asignadoA ?? null,
        creadoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId,
        entidad: 'persona',
        entidadId: o.personaId,
        vence: addDays(o.fecha, t.dias ?? 0),
        prioridad: (t.dias ?? 0) <= 0 ? 'alta' : 'normal',
      })
      .returning();
    await tx.insert(altProcesoTareas).values({ procesoId: proc!.id, tareaId: tarea!.id, titulo: t.titulo, orden: orden++ });
    if (asignadoA && asignadoA !== ctx.personaId) asignados.set(asignadoA, [...(asignados.get(asignadoA) ?? []), t.titulo]);
  }
  for (const [pid, titulos] of asignados)
    await notify(tx, ctx, {
      modulo: 'alt',
      tipo: o.tipo === 'alta' ? 'onboarding' : 'offboarding',
      titulo: `${o.tipo === 'alta' ? 'Incorporación' : 'Salida'} de ${p.nombre}: tienes ${titulos.length} ${titulos.length === 1 ? 'tarea' : 'tareas'}`,
      cuerpo: titulos.join(' · '),
      enlace: '/tareas',
      personaIds: [pid],
      email: true,
    });
  await audit(tx, ctx, o.tipo === 'alta' ? 'iniciar_alta' : 'iniciar_baja', 'alt_proceso', proc!.id, { personaId: o.personaId, fecha: o.fecha, tareas: lista.length });
  return proc!;
}

/** Bloquea el acceso en la fecha de baja: desactiva la persona y sus usuarios (igual que el núcleo al editar la persona). */
export async function aplicarBaja(tx: Tx, ctx: Ctx, procesoId: string) {
  const [proc] = await tx.select().from(altProcesos).where(eq(altProcesos.id, procesoId));
  if (!proc || proc.accesoBloqueadoEn) return;
  const [p] = await tx.select({ activo: personas.activo }).from(personas).where(eq(personas.id, proc.personaId));
  if (p?.activo) {
    await tx.update(personas).set({ activo: false }).where(eq(personas.id, proc.personaId));
    await tx.update(usuarioEmpresas).set({ activo: false }).where(eq(usuarioEmpresas.personaId, proc.personaId));
    await audit(tx, ctx, 'editar', 'persona', proc.personaId, { activo: { antes: true, despues: false }, motivo: 'baja' });
    await emit(tx, ctx, 'persona.baja', { personaId: proc.personaId, fecha: proc.fecha });
  }
  await tx.update(altProcesos).set({ accesoBloqueadoEn: new Date() }).where(eq(altProcesos.id, procesoId));
  invalidatePermissions();
}

async function progreso(procesoIds: string[]) {
  if (!procesoIds.length) return new Map<string, { total: number; hechas: number }>();
  const rows = await db
    .select({ procesoId: altProcesoTareas.procesoId, total: sql<number>`count(*)::int`, hechas: sql<number>`count(*) FILTER (WHERE ${tareas.estado} = 'hecha')::int` })
    .from(altProcesoTareas)
    .leftJoin(tareas, eq(tareas.id, altProcesoTareas.tareaId))
    .where(inArray(altProcesoTareas.procesoId, procesoIds))
    .groupBy(altProcesoTareas.procesoId);
  return new Map(rows.map((r) => [r.procesoId, { total: r.total, hechas: r.hechas }]));
}

/* ──────────────── Rutas ──────────────── */

async function routes(app: FastifyInstance) {
  /* ── Selección ── */
  registerCrud(app, {
    path: '/ofertas',
    resource: ofertaResource,
    table: altOfertas,
    entity: 'alt_oferta',
    perms: { ver: 'alt.ver', crear: 'alt.gestionar' },
    defaults: (ctx) => ({ creadoPor: ctx.usuarioId }),
  });
  app.get('/ofertas-resumen', { preHandler: guard('alt.ver') }, async (req) => {
    const rows = await db
      .select({ o: altOfertas, departamento: departamentos.nombre, candidatos: sql<number>`(SELECT count(*)::int FROM alt_candidatos c WHERE c.oferta_id = ${altOfertas.id} AND c.archivado_en IS NULL)`, activos: sql<number>`(SELECT count(*)::int FROM alt_candidatos c WHERE c.oferta_id = ${altOfertas.id} AND c.archivado_en IS NULL AND c.estado NOT IN ('descartado','contratado'))` })
      .from(altOfertas)
      .leftJoin(departamentos, eq(departamentos.id, altOfertas.departamentoId))
      .where(and(eq(altOfertas.empresaId, req.ctx.empresaId), isNull(altOfertas.archivadoEn)))
      .orderBy(sql`CASE ${altOfertas.estado} WHEN 'abierta' THEN 0 WHEN 'pausada' THEN 1 WHEN 'borrador' THEN 2 ELSE 3 END`, desc(altOfertas.creadoEn));
    return rows.map((r) => ({ ...r.o, departamento: r.departamento, candidatos: r.candidatos, activos: r.activos }));
  });

  registerCrud(app, {
    path: '/candidatos',
    resource: candidatoResource,
    table: altCandidatos,
    entity: 'alt_candidato',
    perms: { ver: 'alt.ver', crear: 'alt.gestionar' },
    defaults: (ctx) => ({ creadoPor: ctx.usuarioId }),
    beforeSave: async (_tx, _ctx, data, existing) => {
      if (data.estado === 'contratado' && existing?.estado !== 'contratado') throw badRequest('Para contratar usa el botón «Contratar»: así se da de alta a la persona');
      return data;
    },
    transformOut: (r) => ({ ...r, cvUrl: fileUrl(r.cvArchivoId) }),
  });

  /** Mover un candidato de fase (tablero). */
  app.post('/candidatos/:id/mover', { preHandler: guard('alt.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(z.object({ estado: z.enum(['nuevo', 'cribado', 'entrevista', 'oferta', 'descartado']), orden: z.number().int().optional() }), req.body);
    const [c] = await db.select().from(altCandidatos).where(and(eq(altCandidatos.id, id), eq(altCandidatos.empresaId, ctx.empresaId)));
    if (!c) throw notFound();
    if (c.estado === 'contratado') throw badRequest('Esta persona ya está contratada');
    await db.transaction(async (tx) => {
      await tx.update(altCandidatos).set({ estado: b.estado, orden: b.orden ?? c.orden }).where(eq(altCandidatos.id, id));
      if (b.estado !== c.estado) await audit(tx, ctx, 'mover_candidato', 'alt_candidato', id, { estado: { antes: c.estado, despues: b.estado } });
    });
    return { ok: true };
  });

  /** Convierte el candidato en persona e inicia la incorporación. */
  app.post('/candidatos/:id/contratar', { preHandler: guard('alt.gestionar') }, async (req) => {
    const ctx = req.ctx;
    if (!can(ctx, 'personas.gestionar') && !ctx.isAdmin) throw forbidden('Necesitas permiso para crear personas');
    const { id } = req.params as { id: string };
    const b = parse(
      z.object({
        nombre: z.string().trim().min(1),
        apellidos: z.string().trim().nullish(),
        email: z.string().trim().email().nullish().or(z.literal('')),
        telefono: z.string().trim().nullish(),
        puesto: z.string().trim().nullish(),
        departamentoId: z.string().uuid().nullish(),
        centroId: z.string().uuid().nullish(),
        responsableId: z.string().uuid().nullish(),
        fechaAlta: z.string().regex(fechaRe, 'Fecha no válida'),
        plantillaId: z.string().uuid().nullish(),
      }),
      req.body,
    );
    const [c] = await db.select().from(altCandidatos).where(and(eq(altCandidatos.id, id), eq(altCandidatos.empresaId, ctx.empresaId)));
    if (!c) throw notFound('Candidato no encontrado');
    if (c.personaId) throw conflict('Este candidato ya está dado de alta');
    const [of] = await db.select().from(altOfertas).where(eq(altOfertas.id, c.ofertaId));
    const res = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(personas)
        .values({
          empresaId: ctx.empresaId,
          nombre: b.nombre,
          apellidos: b.apellidos ?? null,
          email: b.email || null,
          telefono: b.telefono ?? null,
          puesto: b.puesto ?? of?.titulo ?? null,
          departamentoId: b.departamentoId ?? of?.departamentoId ?? null,
          centroId: b.centroId ?? of?.centroId ?? null,
          responsableId: b.responsableId ?? of?.responsableId ?? null,
        })
        .returning();
      await audit(tx, ctx, 'crear', 'persona', p!.id, { origen: 'candidato', candidatoId: c.id });
      const proc = await crearProceso(tx, ctx, { personaId: p!.id, tipo: 'alta', fecha: b.fechaAlta, plantillaId: b.plantillaId, candidatoId: c.id });
      await emit(tx, ctx, 'persona.creada', { personaId: p!.id });
      await tx.update(altCandidatos).set({ estado: 'contratado', personaId: p!.id }).where(eq(altCandidatos.id, c.id));
      await audit(tx, ctx, 'contratar', 'alt_candidato', c.id, { personaId: p!.id });
      invalidatePermissions();
      return { personaId: p!.id, procesoId: proc.id };
    });
    return res;
  });

  /* ── Plantillas ── */
  app.get('/plantillas', { preHandler: guard('alt.ver') }, async (req) => {
    const q = req.query as { tipo?: string };
    return db
      .select()
      .from(altPlantillas)
      .where(and(eq(altPlantillas.empresaId, req.ctx.empresaId), eq(altPlantillas.activo, true), q.tipo ? eq(altPlantillas.tipo, q.tipo) : undefined))
      .orderBy(asc(altPlantillas.tipo), asc(altPlantillas.nombre));
  });
  const plantillaSchema = z.object({ nombre: z.string().trim().min(1).max(120), tipo: z.enum(['alta', 'baja']), tareas: z.array(tareaSchema).max(60) });
  app.post('/plantillas', { preHandler: guard('alt.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const b = parse(plantillaSchema, req.body);
    return db.transaction(async (tx) => {
      const [p] = await tx.insert(altPlantillas).values({ ...b, empresaId: ctx.empresaId }).returning();
      await audit(tx, ctx, 'crear', 'alt_plantilla', p!.id, { nombre: b.nombre });
      return p;
    });
  });
  app.patch('/plantillas/:id', { preHandler: guard('alt.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(plantillaSchema.partial().extend({ activo: z.boolean().optional() }), req.body);
    return db.transaction(async (tx) => {
      const [p] = await tx.update(altPlantillas).set(b).where(and(eq(altPlantillas.id, id), eq(altPlantillas.empresaId, ctx.empresaId))).returning();
      if (!p) throw notFound();
      await audit(tx, ctx, 'editar', 'alt_plantilla', id, { campos: Object.keys(b) });
      return p;
    });
  });

  /* ── Procesos ── */
  app.get('/procesos', { preHandler: guard('alt.ver') }, async (req) => {
    const q = req.query as { tipo?: string; estado?: string };
    const rows = await db
      .select({ p: altProcesos, nombre: nombrePersona, puesto: personas.puesto, activo: personas.activo })
      .from(altProcesos)
      .innerJoin(personas, eq(personas.id, altProcesos.personaId))
      .where(and(eq(altProcesos.empresaId, req.ctx.empresaId), q.tipo ? eq(altProcesos.tipo, q.tipo) : undefined, q.estado ? eq(altProcesos.estado, q.estado) : undefined))
      .orderBy(sql`CASE ${altProcesos.estado} WHEN 'en_curso' THEN 0 ELSE 1 END`, desc(altProcesos.fecha))
      .limit(200);
    const prog = await progreso(rows.map((r) => r.p.id));
    return rows.map((r) => ({ ...r.p, persona: r.nombre, puesto: r.puesto, personaActiva: r.activo, ...(prog.get(r.p.id) ?? { total: 0, hechas: 0 }) }));
  });

  app.get('/procesos/:id', { preHandler: guard('alt.ver') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [p] = await db.select().from(altProcesos).where(and(eq(altProcesos.id, id), eq(altProcesos.empresaId, ctx.empresaId)));
    if (!p) throw notFound();
    const ts = await db
      .select({ id: altProcesoTareas.id, titulo: altProcesoTareas.titulo, orden: altProcesoTareas.orden, tareaId: tareas.id, estado: tareas.estado, vence: tareas.vence, asignadoA: tareas.asignadoA, completadaEn: tareas.completadaEn })
      .from(altProcesoTareas)
      .leftJoin(tareas, eq(tareas.id, altProcesoTareas.tareaId))
      .where(eq(altProcesoTareas.procesoId, id))
      .orderBy(asc(altProcesoTareas.orden));
    const n = await nombres(db, [p.personaId, ...ts.map((t) => t.asignadoA)]);
    return {
      ...p,
      persona: await personaPorId(db, ctx.empresaId, p.personaId),
      tareas: ts.map((t) => ({ ...t, asignado: t.asignadoA ? n[t.asignadoA] : null })),
      activos: p.tipo === 'baja' ? await activosAsignados(ctx, p.personaId) : [],
    };
  });

  /** Cambia el estado de una tarea del proceso (equivale a marcarla en Tareas). */
  app.post('/procesos/:id/tareas/:tareaId', { preHandler: guard('alt.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id, tareaId } = req.params as { id: string; tareaId: string };
    const { estado } = parse(z.object({ estado: z.enum(['pendiente', 'en_curso', 'hecha']) }), req.body);
    const [pt] = await db.select().from(altProcesoTareas).where(and(eq(altProcesoTareas.procesoId, id), eq(altProcesoTareas.tareaId, tareaId)));
    if (!pt) throw notFound();
    await db.transaction(async (tx) => {
      await tx.update(tareas).set({ estado, completadaEn: estado === 'hecha' ? new Date() : null }).where(and(eq(tareas.id, tareaId), eq(tareas.empresaId, ctx.empresaId)));
      await audit(tx, ctx, 'editar', 'tarea', tareaId, { estado });
    });
    return { ok: true };
  });

  /** Lo que hay que revisar antes de dar de baja a alguien. */
  app.get('/bajas/preview', { preHandler: guard('alt.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { personaId } = req.query as { personaId?: string };
    if (!personaId) throw badRequest('Indica la persona');
    const p = await personaPorId(db, ctx.empresaId, personaId);
    if (!p) throw notFound();
    const hoy = hoyMadrid();
    const abiertas = await db
      .select({ id: tareas.id, titulo: tareas.titulo, vence: tareas.vence })
      .from(tareas)
      .where(and(eq(tareas.empresaId, ctx.empresaId), eq(tareas.asignadoA, personaId), inArray(tareas.estado, ['pendiente', 'en_curso'])));
    const equipo = await db.select({ id: personas.id, nombre: nombrePersona }).from(personas).where(and(eq(personas.responsableId, personaId), eq(personas.activo, true)));
    const futuras = ctx.modules.has('aus')
      ? await db
          .select({ id: ausSolicitudes.id, desde: ausSolicitudes.desde, hasta: ausSolicitudes.hasta, tipo: ausTipos.nombre, estado: ausSolicitudes.estado })
          .from(ausSolicitudes)
          .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
          .where(and(eq(ausSolicitudes.personaId, personaId), inArray(ausSolicitudes.estado, ['pendiente', 'aprobada_responsable', 'aprobada']), sql`${ausSolicitudes.hasta} >= ${hoy}`))
      : [];
    const sal = ctx.modules.has('aus') ? await saldos(db, ctx.empresaId, personaId, Number(hoy.slice(0, 4))) : [];
    const [f] = await db.select({ alta: ficTrabajadores.fechaAlta, tipoContrato: ficTrabajadores.tipoContrato, finContrato: ficTrabajadores.finContrato }).from(ficTrabajadores).where(eq(ficTrabajadores.personaId, personaId));
    return { persona: p, activos: await activosAsignados(ctx, personaId), tareasAbiertas: abiertas, equipo, ausenciasFuturas: futuras, saldos: sal, ficha: f ?? null };
  });

  const procesoSchema = z.object({
    personaId: z.string().uuid(),
    fecha: z.string().regex(fechaRe, 'Fecha no válida'),
    plantillaId: z.string().uuid().nullish(),
    motivo: z.string().trim().max(1000).nullish(),
    motivoBaja: z.string().nullish(),
    bloquearAcceso: z.boolean().default(true),
    notas: z.string().max(2000).nullish(),
  });
  app.post('/altas', { preHandler: guard('alt.gestionar') }, async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(procesoSchema, req.body);
    if (!(await personaPorId(db, ctx.empresaId, b.personaId))) throw notFound('Persona no encontrada');
    const [abierto] = await db.select({ id: altProcesos.id }).from(altProcesos).where(and(eq(altProcesos.personaId, b.personaId), eq(altProcesos.tipo, 'alta'), eq(altProcesos.estado, 'en_curso')));
    if (abierto) throw conflict('Esta persona ya tiene una incorporación en curso');
    const proc = await db.transaction((tx) => crearProceso(tx, ctx, { personaId: b.personaId, tipo: 'alta', fecha: b.fecha, plantillaId: b.plantillaId, notas: b.notas }));
    reply.code(201);
    return proc;
  });

  app.post('/bajas', { preHandler: guard('alt.gestionar') }, async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(procesoSchema, req.body);
    const p = await personaPorId(db, ctx.empresaId, b.personaId);
    if (!p) throw notFound('Persona no encontrada');
    if (b.personaId === ctx.personaId) throw badRequest('No puedes tramitar tu propia baja');
    const [abierto] = await db.select({ id: altProcesos.id }).from(altProcesos).where(and(eq(altProcesos.personaId, b.personaId), eq(altProcesos.tipo, 'baja'), eq(altProcesos.estado, 'en_curso')));
    if (abierto) throw conflict('Esta persona ya tiene una salida en curso');
    const activos = await activosAsignados(ctx, b.personaId);
    const extra: PlantillaTarea[] = activos.map((a) => ({ titulo: `Recoger ${a.nombre}${a.codigo ? ` (${a.codigo})` : ''}`, responsable: 'responsable', dias: 0 }));
    const proc = await db.transaction(async (tx) => {
      const proc = await crearProceso(tx, ctx, { personaId: b.personaId, tipo: 'baja', fecha: b.fecha, plantillaId: b.plantillaId, motivo: b.motivo, bloquearAcceso: b.bloquearAcceso, extra, notas: b.notas });
      // la ficha laboral recoge la fecha y el motivo (si el módulo FIC está activo)
      if (ctx.modules.has('fic') && b.motivoBaja) await tx.update(ficTrabajadores).set({ fechaBaja: b.fecha, motivoBaja: b.motivoBaja }).where(eq(ficTrabajadores.personaId, b.personaId));
      if (b.bloquearAcceso && b.fecha <= hoyMadrid()) await aplicarBaja(tx, ctx, proc.id);
      return proc;
    });
    reply.code(201);
    return { ...proc, activos };
  });

  app.post('/procesos/:id/:accion', { preHandler: guard('alt.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id, accion } = req.params as { id: string; accion: string };
    if (!['completar', 'cancelar', 'bloquear'].includes(accion)) throw notFound();
    const [p] = await db.select().from(altProcesos).where(and(eq(altProcesos.id, id), eq(altProcesos.empresaId, ctx.empresaId)));
    if (!p) throw notFound();
    if (p.estado !== 'en_curso' && accion !== 'bloquear') throw badRequest('El proceso ya está cerrado');
    await db.transaction(async (tx) => {
      if (accion === 'bloquear') {
        if (p.tipo !== 'baja') throw badRequest('Solo en procesos de salida');
        await aplicarBaja(tx, ctx, id);
      } else {
        await tx.update(altProcesos).set({ estado: accion === 'completar' ? 'completado' : 'cancelado', completadoEn: new Date() }).where(eq(altProcesos.id, id));
        if (accion === 'cancelar') {
          const ts = await tx.select({ t: altProcesoTareas.tareaId }).from(altProcesoTareas).where(eq(altProcesoTareas.procesoId, id));
          const ids = ts.map((x) => x.t).filter(Boolean) as string[];
          if (ids.length) await tx.delete(tareas).where(and(inArray(tareas.id, ids), ne(tareas.estado, 'hecha')));
        }
      }
      await audit(tx, ctx, `${accion}_proceso`, 'alt_proceso', id);
    });
    return { ok: true };
  });

  /* ── Evaluaciones ── */
  const objetivoSchema = z.object({ titulo: z.string().trim().min(1).max(200), descripcion: z.string().max(1000).nullish(), peso: z.coerce.number().min(0).max(100), puntuacion: z.coerce.number().min(0).max(altShared.PUNTUACION_MAX).nullable().default(null), comentario: z.string().max(2000).nullish() });
  const evalSchema = z.object({
    personaId: z.string().uuid(),
    periodo: z.string().trim().min(1).max(60),
    fecha: z.string().regex(fechaRe),
    objetivos: z.array(objetivoSchema).max(30).default([]),
    fortalezas: z.string().max(4000).nullish(),
    mejoras: z.string().max(4000).nullish(),
    comentarios: z.string().max(4000).nullish(),
  });

  async function evaluacion(ctx: Ctx, id: string) {
    const [e] = await db.select().from(altEvaluaciones).where(and(eq(altEvaluaciones.id, id), eq(altEvaluaciones.empresaId, ctx.empresaId)));
    if (!e) throw notFound('Evaluación no encontrada');
    const esEvaluado = e.personaId === ctx.personaId;
    const esEvaluador = e.evaluadorId === ctx.personaId || (await canOnOwner(ctx, 'alt.evaluar', e.personaId)) || can(ctx, 'alt.gestionar');
    if (esEvaluado && e.estado === 'borrador' && !esEvaluador) throw forbidden('Esta evaluación todavía no se ha compartido contigo');
    if (!esEvaluado && !esEvaluador) throw forbidden();
    return { e, esEvaluado, esEvaluador: esEvaluador && !esEvaluado };
  }

  app.get('/evaluaciones', async (req) => {
    const ctx = req.ctx;
    const q = req.query as { mias?: string; personaId?: string };
    const conds = [eq(altEvaluaciones.empresaId, ctx.empresaId)];
    if (q.mias || !can(ctx, 'alt.evaluar')) {
      if (!ctx.personaId) return [];
      conds.push(eq(altEvaluaciones.personaId, ctx.personaId), ne(altEvaluaciones.estado, 'borrador'));
    } else {
      const c = await condAlcance(ctx, 'alt.evaluar', altEvaluaciones.personaId);
      conds.push(or(c ?? sql`true`, eq(altEvaluaciones.evaluadorId, ctx.personaId ?? '00000000-0000-0000-0000-000000000000'))!);
      if (ctx.personaId) conds.push(or(ne(altEvaluaciones.personaId, ctx.personaId), ne(altEvaluaciones.estado, 'borrador'))!);
    }
    if (q.personaId) conds.push(eq(altEvaluaciones.personaId, q.personaId));
    const rows = await db.select().from(altEvaluaciones).where(and(...conds)).orderBy(desc(altEvaluaciones.fecha)).limit(300);
    const n = await nombres(db, [...rows.map((r) => r.personaId), ...rows.map((r) => r.evaluadorId)]);
    return rows.map(({ firmaImagen: _f, ...r }) => ({ ...r, persona: n[r.personaId], evaluador: n[r.evaluadorId], propia: r.personaId === ctx.personaId }));
  });

  app.get('/evaluaciones/:id', async (req) => {
    const ctx = req.ctx;
    const { e, esEvaluado, esEvaluador } = await evaluacion(ctx, (req.params as { id: string }).id);
    const n = await nombres(db, [e.personaId, e.evaluadorId]);
    const { firmaImagen: _f, ...rest } = e;
    return { ...rest, persona: n[e.personaId], evaluador: n[e.evaluadorId], esEvaluado, esEvaluador, puedeEditar: esEvaluador && e.estado !== 'firmada', puedeFirmar: esEvaluado && e.estado === 'compartida' };
  });

  app.post('/evaluaciones', async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(evalSchema, req.body);
    if (!ctx.personaId) throw forbidden();
    if (b.personaId === ctx.personaId) throw badRequest('No puedes evaluarte a ti mismo');
    if (!(await canOnOwner(ctx, 'alt.evaluar', b.personaId))) throw forbidden('Solo puedes evaluar a personas de tu equipo');
    const row = await db.transaction(async (tx) => {
      const [e] = await tx.insert(altEvaluaciones).values({ ...b, empresaId: ctx.empresaId, evaluadorId: ctx.personaId!, puntuacion: puntuacionGlobal(b.objetivos), creadoPor: ctx.usuarioId }).returning();
      await audit(tx, ctx, 'crear', 'alt_evaluacion', e!.id, { personaId: b.personaId, periodo: b.periodo });
      return e!;
    });
    reply.code(201);
    return row;
  });

  app.patch('/evaluaciones/:id', async (req) => {
    const ctx = req.ctx;
    const { e, esEvaluador } = await evaluacion(ctx, (req.params as { id: string }).id);
    if (!esEvaluador) throw forbidden();
    if (e.estado === 'firmada') throw badRequest('La evaluación ya está firmada');
    const b = parse(evalSchema.omit({ personaId: true }).partial(), req.body);
    const set: Partial<typeof altEvaluaciones.$inferInsert> = { ...b };
    if (b.objetivos) set.puntuacion = puntuacionGlobal(b.objetivos);
    return db.transaction(async (tx) => {
      const [r] = await tx.update(altEvaluaciones).set(set).where(eq(altEvaluaciones.id, e.id)).returning();
      await audit(tx, ctx, 'editar', 'alt_evaluacion', e.id, { campos: Object.keys(b) });
      return r;
    });
  });

  app.post('/evaluaciones/:id/compartir', async (req) => {
    const ctx = req.ctx;
    const { e, esEvaluador } = await evaluacion(ctx, (req.params as { id: string }).id);
    if (!esEvaluador) throw forbidden();
    if (e.estado !== 'borrador') throw badRequest('Ya está compartida');
    if (!e.objetivos.length) throw badRequest('Añade al menos un objetivo');
    await db.transaction(async (tx) => {
      await tx.update(altEvaluaciones).set({ estado: 'compartida', compartidaEn: new Date() }).where(eq(altEvaluaciones.id, e.id));
      await audit(tx, ctx, 'compartir', 'alt_evaluacion', e.id);
      await notify(tx, ctx, { modulo: 'alt', tipo: 'evaluacion', titulo: `${ctx.nombre} ha compartido tu evaluación (${e.periodo})`, cuerpo: 'Revísala, añade tus comentarios y fírmala.', enlace: `/evaluaciones/${e.id}`, personaIds: [e.personaId], email: true });
    });
    return { ok: true };
  });

  app.post('/evaluaciones/:id/firmar', async (req) => {
    const ctx = req.ctx;
    const { e, esEvaluado } = await evaluacion(ctx, (req.params as { id: string }).id);
    if (!esEvaluado) throw forbidden('Solo la persona evaluada puede firmar');
    if (e.estado !== 'compartida') throw badRequest('La evaluación no está pendiente de firma');
    const b = parse(z.object({ firma: z.string().startsWith('data:image/png;base64,').max(800_000), comentarios: z.string().max(4000).nullish() }), req.body);
    await db.transaction(async (tx) => {
      await tx.update(altEvaluaciones).set({ estado: 'firmada', firmadaEn: new Date(), firmaImagen: b.firma, comentariosEvaluado: b.comentarios ?? null }).where(eq(altEvaluaciones.id, e.id));
      await audit(tx, ctx, 'firmar', 'alt_evaluacion', e.id);
      await notify(tx, ctx, { modulo: 'alt', tipo: 'evaluacion_firmada', titulo: `${ctx.nombre} ha firmado su evaluación (${e.periodo})`, enlace: `/evaluaciones/${e.id}`, personaIds: [e.evaluadorId] });
    });
    return { ok: true };
  });

  /* ── Plan de formación anual ── */
  registerCrud(app, {
    path: '/plan',
    resource: planFormacionResource,
    table: altPlanFormacion,
    entity: 'alt_plan',
    perms: { ver: 'alt.ver', crear: 'alt.gestionar' },
  });
}

export default defineModule({
  code: 'alt',
  routes,
  refTargets: {
    'alt.ofertas': {
      table: altOfertas,
      id: altOfertas.id,
      label: sql<string>`${altOfertas.titulo}`,
      search: [altOfertas.titulo],
      empresaCol: altOfertas.empresaId,
      archivedCol: altOfertas.archivadoEn,
      perm: 'alt.ver',
    },
  },
  entities: {
    alt_candidato: {
      label: 'Candidato',
      module: 'alt',
      canView: async (ctx) => can(ctx, 'alt.ver'),
      canEdit: async (ctx) => can(ctx, 'alt.gestionar'),
      title: async (id) => (await db.select({ n: sql<string>`${altCandidatos.nombre} || ' ' || coalesce(${altCandidatos.apellidos}, '')` }).from(altCandidatos).where(eq(altCandidatos.id, id)))[0]?.n ?? null,
      url: () => '/seleccion',
    },
    alt_proceso: {
      label: 'Proceso de alta o baja',
      module: 'alt',
      canView: async (ctx) => can(ctx, 'alt.ver'),
      canEdit: async (ctx) => can(ctx, 'alt.gestionar'),
      url: (id) => `/altas-bajas/${id}`,
    },
  },
  dashboard: async (dbx, ctx): Promise<DashboardWidget[]> => {
    const out: DashboardWidget[] = [];
    if (can(ctx, 'alt.ver')) {
      const rows = await dbx
        .select({ p: altProcesos, nombre: nombrePersona })
        .from(altProcesos)
        .innerJoin(personas, eq(personas.id, altProcesos.personaId))
        .where(and(eq(altProcesos.empresaId, ctx.empresaId), eq(altProcesos.estado, 'en_curso')))
        .orderBy(asc(altProcesos.fecha))
        .limit(6);
      const prog = await progreso(rows.map((r) => r.p.id));
      out.push({
        id: 'alt.procesos',
        modulo: 'alt',
        titulo: 'Incorporaciones y salidas',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'No hay procesos en curso',
          enlace: '/altas-bajas',
          items: rows.map((r) => {
            const pr = prog.get(r.p.id);
            return { titulo: `${optionLabel(PROCESO_TIPOS, r.p.tipo)?.label}: ${r.nombre}`, subtitulo: `${fmtDate(r.p.fecha)} · ${pr?.hechas ?? 0} de ${pr?.total ?? 0} tareas`, enlace: `/altas-bajas/${r.p.id}`, tone: r.p.tipo === 'alta' ? 'green' : 'red' };
          }),
        },
      });
    }
    if (ctx.personaId) {
      const [pend] = await dbx.select({ id: altEvaluaciones.id, periodo: altEvaluaciones.periodo }).from(altEvaluaciones).where(and(eq(altEvaluaciones.personaId, ctx.personaId), eq(altEvaluaciones.estado, 'compartida'))).limit(1);
      if (pend) out.push({ id: 'alt.mi_evaluacion', modulo: 'alt', titulo: 'Tu evaluación', size: 'sm', data: { kind: 'stat', value: pend.periodo, hint: 'Pendiente de tu firma', enlace: `/evaluaciones/${pend.id}` } });
    }
    return out;
  },
  approvals: async (): Promise<ApprovalItem[]> => [],
  timeline: async (dbx, ctx, entidad, id) => {
    if (entidad !== 'persona' || !can(ctx, 'alt.ver')) return [];
    const rows = await dbx.select().from(altProcesos).where(eq(altProcesos.personaId, id)).orderBy(desc(altProcesos.creadoEn));
    return rows.map((p) => ({ id: `ap-${p.id}`, modulo: 'alt', tipo: p.tipo, icono: 'UserPlus', titulo: `${optionLabel(PROCESO_TIPOS, p.tipo)?.label} el ${fmtDate(p.fecha)}`, detalle: p.motivo, fecha: p.creadoEn.toISOString(), enlace: `/altas-bajas/${p.id}`, tone: p.tipo === 'alta' ? 'green' : 'red' }));
  },
  jobs: [
    {
      id: 'alt.bloqueo_bajas',
      every: 30,
      run: async (empresaId, ctx) => {
        const hoy = hoyMadrid();
        const rows = await db
          .select({ id: altProcesos.id })
          .from(altProcesos)
          .where(and(eq(altProcesos.empresaId, empresaId), eq(altProcesos.tipo, 'baja'), eq(altProcesos.bloquearAcceso, true), isNull(altProcesos.accesoBloqueadoEn), lte(altProcesos.fecha, hoy), ne(altProcesos.estado, 'cancelado')));
        for (const r of rows) await db.transaction((tx) => aplicarBaja(tx, ctx, r.id));
        return rows.length ? `${rows.length} accesos bloqueados` : undefined;
      },
    },
  ],
  seed: seedAlt,
});

export const _cand = CANDIDATO_ESTADOS;
