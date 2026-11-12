import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MODULES,
  OPTIONAL_MODULE_CODES,
  aparienciaSchema,
  centroResource,
  departamentoResource,
  dependents,
  festivoResource,
  formaPagoResource,
  missingRequirements,
  moduleInfo,
  personaResource,
} from '@kite/shared';
import { db } from '../db/client';
import { centros, departamentos, empresas, festivos, formasPago, modulosEmpresa, personas, series, usuarioEmpresas } from '../db/schema';
import { audit, diff } from '../core/audit';
import { registerCrud } from '../core/crud';
import { badRequest, conflict, forbidden, parse } from '../core/errors';
import { emit } from '../core/events';
import { fileUrl } from '../core/files';
import { activeModules, invalidateModules } from '../core/modules';
import { can, guard, invalidatePermissions } from '../core/permissions';
import { AJUSTES_DEFECTO } from '../core/settings';

const empresaSchema = z.object({
  nombre: z.string().trim().min(1),
  razonSocial: z.string().trim().nullish(),
  nif: z.string().trim().toUpperCase().nullish(),
  direccion: z.string().nullish(),
  codigoPostal: z.string().nullish(),
  localidad: z.string().nullish(),
  provincia: z.string().nullish(),
  pais: z.string().length(2).optional(),
  telefono: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  web: z.string().nullish(),
  iban: z.string().nullish(),
  bic: z.string().nullish(),
  sufijoSepa: z.string().max(3).optional(),
  logoArchivoId: z.string().uuid().nullish(),
  colorMarca: z.string().nullish(),
  ajustes: z.record(z.unknown()).optional(),
});

export async function orgRoutes(app: FastifyInstance) {
  /* ── Empresa ── */
  app.get('/empresa', async (req) => {
    const [e] = await db.select().from(empresas).where(eq(empresas.id, req.ctx.empresaId));
    return { ...e, ajustes: { ...AJUSTES_DEFECTO, ...(e!.ajustes ?? {}) }, logoUrl: fileUrl(e!.logoArchivoId, 86400) };
  });
  app.patch('/empresa', { preHandler: guard('cfg.gestionar') }, async (req) => {
    const body = parse(empresaSchema.partial(), req.body);
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(empresas).where(eq(empresas.id, req.ctx.empresaId));
      const data: Record<string, unknown> = { ...body };
      if (body.ajustes) {
        const ajustes: Record<string, unknown> = { ...body.ajustes };
        // La apariencia se valida entera: colores #RRGGBB, tipografías conocidas y opciones cerradas
        if (ajustes.apariencia !== undefined) ajustes.apariencia = ajustes.apariencia === null ? undefined : parse(aparienciaSchema, ajustes.apariencia);
        data.ajustes = { ...(before!.ajustes ?? {}), ...ajustes };
      }
      const [after] = await tx.update(empresas).set(data).where(eq(empresas.id, req.ctx.empresaId)).returning();
      await audit(tx, req.ctx, 'editar', 'empresa', req.ctx.empresaId, diff(before, after));
      return after;
    });
  });

  /* ── Módulos activables ── */
  app.get('/modulos', async (req) => {
    const rows = await db.select().from(modulosEmpresa).where(eq(modulosEmpresa.empresaId, req.ctx.empresaId));
    const active = await activeModules(req.ctx.empresaId);
    return MODULES.map((m) => ({
      ...m,
      activo: active.has(m.code),
      cambiadoEn: rows.find((r) => r.modulo === m.code)?.cambiadoEn ?? null,
      faltan: missingRequirements(m.code, active),
    }));
  });
  app.post('/modulos/:code', { preHandler: guard('cfg.gestionar') }, async (req) => {
    const { code } = req.params as { code: string };
    const { activo } = parse(z.object({ activo: z.boolean() }), req.body);
    if (!OPTIONAL_MODULE_CODES.includes(code as never)) throw badRequest('Este módulo forma parte del núcleo y siempre está activo');
    const active = await activeModules(req.ctx.empresaId);
    if (activo) {
      const faltan = missingRequirements(code, active);
      if (faltan.length)
        throw conflict(
          `Para activar ${moduleInfo(code)!.name} antes tienes que activar ${faltan.map((g) => g.map((c) => moduleInfo(c)!.name).join(' o ')).join(' y ')}`,
          { faltan },
        );
    } else {
      const deps = dependents(code, active);
      if (deps.length)
        throw conflict(`No se puede desactivar: lo necesitan ${deps.map((c) => moduleInfo(c)!.name).join(', ')}. Desactívalos primero.`, { dependientes: deps });
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(modulosEmpresa)
        .values({ empresaId: req.ctx.empresaId, modulo: code, activo, cambiadoPor: req.ctx.usuarioId })
        .onConflictDoUpdate({ target: [modulosEmpresa.empresaId, modulosEmpresa.modulo], set: { activo, cambiadoEn: new Date(), cambiadoPor: req.ctx.usuarioId } });
      await audit(tx, req.ctx, activo ? 'activar_modulo' : 'desactivar_modulo', 'modulo', code);
    });
    invalidateModules(req.ctx.empresaId);
    return { ok: true };
  });

  /* ── Centros, departamentos, festivos y formas de pago ── */
  registerCrud(app, {
    path: '/centros',
    resource: centroResource,
    table: centros,
    entity: 'centro',
    perms: { ver: 'personas.ver', crear: 'cfg.gestionar' },
  });
  registerCrud(app, {
    path: '/departamentos',
    resource: departamentoResource,
    table: departamentos,
    entity: 'departamento',
    perms: { ver: 'personas.ver', crear: 'personas.gestionar' },
  });
  registerCrud(app, {
    path: '/festivos',
    resource: festivoResource,
    table: festivos,
    entity: 'festivo',
    perms: { ver: 'personas.ver', crear: 'cfg.gestionar' },
    hardDelete: true,
  });
  registerCrud(app, {
    path: '/formas-pago',
    resource: formaPagoResource,
    table: formasPago,
    entity: 'forma_pago',
    perms: { ver: ['catalogo.ver', 'terceros.ver', 'cfg.gestionar'], crear: 'cfg.gestionar' },
    hardDelete: false,
  });

  /* ── Personas (directorio) ── */
  registerCrud(app, {
    path: '/personas',
    resource: personaResource,
    table: personas,
    entity: 'persona',
    perms: { ver: 'personas.ver', crear: 'personas.gestionar' },
    beforeSave: async (tx, ctx, data, existing) => {
      if (existing && data.responsableId) {
        if (data.responsableId === existing.id) throw badRequest('Una persona no puede ser su propia responsable');
        const ciclo = await tx.execute<{ id: string }>(sql`
          WITH RECURSIVE sup AS (SELECT id, responsable_id FROM personas WHERE id = ${data.responsableId}
            UNION SELECT p.id, p.responsable_id FROM personas p JOIN sup s ON p.id = s.responsable_id)
          SELECT id FROM sup WHERE id = ${existing.id}`);
        if (ciclo.length) throw badRequest('Ese responsable depende de esta persona: se formaría un círculo');
      }
      return data;
    },
    afterSave: async (tx, ctx, row, existing) => {
      invalidatePermissions();
      if (!existing) await emit(tx, ctx, 'persona.creada', { personaId: row.id });
      if (existing?.activo && row.activo === false) {
        await emit(tx, ctx, 'persona.baja', { personaId: row.id, fecha: new Date().toISOString().slice(0, 10) });
        await tx.update(usuarioEmpresas).set({ activo: false }).where(eq(usuarioEmpresas.personaId, row.id));
      }
    },
    transformOut: (r) => ({ ...r, fotoUrl: fileUrl(r.fotoArchivoId, 86400) }),
  });

  app.get('/organigrama', { preHandler: guard('personas.ver') }, async (req) => {
    const rows = await db
      .select({
        id: personas.id,
        nombre: sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`,
        puesto: personas.puesto,
        responsableId: personas.responsableId,
        departamento: departamentos.nombre,
        color: departamentos.color,
        foto: personas.fotoArchivoId,
      })
      .from(personas)
      .leftJoin(departamentos, eq(departamentos.id, personas.departamentoId))
      .where(and(eq(personas.empresaId, req.ctx.empresaId), eq(personas.activo, true), isNull(personas.archivadoEn)))
      .orderBy(asc(personas.nombre));
    return rows.map((r) => ({ ...r, fotoUrl: fileUrl(r.foto, 86400) }));
  });

  app.post('/personas/:id/foto', async (req) => {
    const { id } = req.params as { id: string };
    const { archivoId } = parse(z.object({ archivoId: z.string().uuid() }), req.body);
    if (id !== req.ctx.personaId && !can(req.ctx, 'personas.gestionar')) throw forbidden();
    await db.update(personas).set({ fotoArchivoId: archivoId }).where(and(eq(personas.id, id), eq(personas.empresaId, req.ctx.empresaId)));
    return { ok: true };
  });

  /* ── Series de numeración ── */
  app.get('/series', { preHandler: guard(['cfg.gestionar', 'fac.ver', 'pre.ver']) }, async (req) => {
    return db.select().from(series).where(eq(series.empresaId, req.ctx.empresaId)).orderBy(asc(series.tipo), asc(series.anio));
  });
  app.post('/series', { preHandler: guard('cfg.gestionar') }, async (req) => {
    const body = parse(
      z.object({ tipo: z.string(), codigo: z.string().trim().min(1).max(6).toUpperCase(), nombre: z.string().min(1), anio: z.number().int(), porDefecto: z.boolean().default(false), digitos: z.number().int().min(3).max(8).default(5) }),
      req.body,
    );
    return db.transaction(async (tx) => {
      if (body.porDefecto)
        await tx.update(series).set({ porDefecto: false }).where(and(eq(series.empresaId, req.ctx.empresaId), eq(series.tipo, body.tipo), eq(series.anio, body.anio)));
      const [s] = await tx.insert(series).values({ ...body, empresaId: req.ctx.empresaId }).returning();
      await audit(tx, req.ctx, 'crear', 'serie', s!.id, s);
      return s;
    });
  });
  app.patch('/series/:id', { preHandler: guard('cfg.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ nombre: z.string().optional(), porDefecto: z.boolean().optional(), activo: z.boolean().optional() }), req.body);
    return db.transaction(async (tx) => {
      const [s] = await tx.select().from(series).where(and(eq(series.id, id), eq(series.empresaId, req.ctx.empresaId)));
      if (!s) throw badRequest('Serie no encontrada');
      if (body.porDefecto)
        await tx.update(series).set({ porDefecto: false }).where(and(eq(series.empresaId, req.ctx.empresaId), eq(series.tipo, s.tipo), eq(series.anio, s.anio)));
      const [after] = await tx.update(series).set(body).where(eq(series.id, id)).returning();
      await audit(tx, req.ctx, 'editar', 'serie', id, diff(s, after));
      return after;
    });
  });
}
