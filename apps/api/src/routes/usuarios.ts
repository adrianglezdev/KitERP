import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, SCOPES, moduleInfo } from '@kite/shared';
import { config } from '../config';
import { db } from '../db/client';
import { auditoria, empresas, personas, rolPermisos, roles, sesiones, usuarioEmpresas, usuarioPermisos, usuarios } from '../db/schema';
import { hashPassword, passwordProblems, randomToken } from '../core/auth';
import { audit } from '../core/audit';
import { badRequest, conflict, notFound, parse } from '../core/errors';
import { emailLayout, queueEmail } from '../core/mail';
import { guard, invalidatePermissions } from '../core/permissions';

const usuarioSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email no válido'),
  personaId: z.string().uuid().nullish(),
  rolId: z.string().uuid().nullish(),
  activo: z.boolean().default(true),
  accesoHasta: z.string().nullish(),
  password: z.string().optional(),
  enviarInvitacion: z.boolean().default(true),
  permisosExtra: z.array(z.object({ permiso: z.string(), alcance: z.enum(SCOPES) })).optional(),
});

const rolSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  descripcion: z.string().nullish(),
  permisos: z.array(z.object({ permiso: z.string(), alcance: z.enum(SCOPES) })),
});

export async function usuariosRoutes(app: FastifyInstance) {
  app.get('/permisos/catalogo', async () =>
    PERMISSIONS.map((p) => ({ ...p, moduloNombre: p.module === 'core' ? 'Núcleo' : (moduleInfo(p.module)?.name ?? p.module) })),
  );

  /* ── Roles ── */
  app.get('/roles', { preHandler: guard('usr.gestionar') }, async (req) => {
    const rs = await db.select().from(roles).where(eq(roles.empresaId, req.ctx.empresaId)).orderBy(asc(roles.nombre));
    const perms = rs.length ? await db.select().from(rolPermisos).where(inArray(rolPermisos.rolId, rs.map((r) => r.id))) : [];
    const counts = await db
      .select({ rolId: usuarioEmpresas.rolId, n: sql<number>`count(*)::int` })
      .from(usuarioEmpresas)
      .where(and(eq(usuarioEmpresas.empresaId, req.ctx.empresaId), eq(usuarioEmpresas.activo, true)))
      .groupBy(usuarioEmpresas.rolId);
    return rs.map((r) => ({
      ...r,
      permisos: perms.filter((p) => p.rolId === r.id).map((p) => ({ permiso: p.permiso, alcance: p.alcance })),
      usuarios: counts.find((c) => c.rolId === r.id)?.n ?? 0,
    }));
  });
  app.post('/roles', { preHandler: guard('usr.gestionar') }, async (req) => {
    const body = parse(rolSchema, req.body);
    return db.transaction(async (tx) => {
      const [r] = await tx.insert(roles).values({ empresaId: req.ctx.empresaId, nombre: body.nombre, descripcion: body.descripcion }).returning();
      if (body.permisos.length) await tx.insert(rolPermisos).values(body.permisos.map((p) => ({ rolId: r!.id, ...p })));
      await audit(tx, req.ctx, 'crear', 'rol', r!.id, body);
      return r;
    });
  });
  app.put('/roles/:id', { preHandler: guard('usr.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(rolSchema, req.body);
    await db.transaction(async (tx) => {
      const [r] = await tx.select().from(roles).where(and(eq(roles.id, id), eq(roles.empresaId, req.ctx.empresaId)));
      if (!r) throw notFound('Rol no encontrado');
      if (r.clave === 'admin') throw badRequest('El rol Administrador siempre tiene todos los permisos');
      const before = await tx.select().from(rolPermisos).where(eq(rolPermisos.rolId, id));
      await tx.update(roles).set({ nombre: body.nombre, descripcion: body.descripcion }).where(eq(roles.id, id));
      await tx.delete(rolPermisos).where(eq(rolPermisos.rolId, id));
      if (body.permisos.length) await tx.insert(rolPermisos).values(body.permisos.map((p) => ({ rolId: id, ...p })));
      await audit(tx, req.ctx, 'editar', 'rol', id, { antes: before.map((p) => `${p.permiso}:${p.alcance}`), despues: body.permisos.map((p) => `${p.permiso}:${p.alcance}`) });
    });
    invalidatePermissions();
    return { ok: true };
  });
  app.delete('/roles/:id', { preHandler: guard('usr.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(roles).where(and(eq(roles.id, id), eq(roles.empresaId, req.ctx.empresaId)));
    if (!r) throw notFound();
    if (r.sistema) throw badRequest('Los roles de partida no se borran; puedes editarlos');
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(usuarioEmpresas).where(eq(usuarioEmpresas.rolId, id));
    if ((n?.n ?? 0) > 0) throw conflict('Hay usuarios con este rol. Cámbiales el rol antes de borrarlo.');
    await db.transaction(async (tx) => {
      await tx.delete(roles).where(eq(roles.id, id));
      await audit(tx, req.ctx, 'borrar', 'rol', id, r);
    });
    return { ok: true };
  });

  /* ── Usuarios ── */
  app.get('/usuarios', { preHandler: guard('usr.gestionar') }, async (req) => {
    const q = (req.query as { q?: string }).q?.trim();
    const rows = await db
      .select({
        id: usuarioEmpresas.id,
        usuarioId: usuarios.id,
        email: usuarios.email,
        activo: usuarioEmpresas.activo,
        usuarioActivo: usuarios.activo,
        totp: usuarios.totpActivo,
        ultimoAcceso: usuarios.ultimoAcceso,
        accesoHasta: usuarioEmpresas.accesoHasta,
        personaId: personas.id,
        nombre: sql<string>`coalesce(trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, '')), ${usuarios.email})`,
        puesto: personas.puesto,
        rolId: roles.id,
        rol: roles.nombre,
      })
      .from(usuarioEmpresas)
      .innerJoin(usuarios, eq(usuarios.id, usuarioEmpresas.usuarioId))
      .leftJoin(personas, eq(personas.id, usuarioEmpresas.personaId))
      .leftJoin(roles, eq(roles.id, usuarioEmpresas.rolId))
      .where(
        and(
          eq(usuarioEmpresas.empresaId, req.ctx.empresaId),
          q ? or(ilike(usuarios.email, `%${q}%`), ilike(personas.nombre, `%${q}%`), ilike(personas.apellidos, `%${q}%`)) : undefined,
        ),
      )
      .orderBy(asc(sql`2`));
    const extras = rows.length ? await db.select().from(usuarioPermisos).where(inArray(usuarioPermisos.usuarioEmpresaId, rows.map((r) => r.id))) : [];
    return rows.map((r) => ({ ...r, permisosExtra: extras.filter((e) => e.usuarioEmpresaId === r.id).map((e) => ({ permiso: e.permiso, alcance: e.alcance })) }));
  });

  app.post('/usuarios', { preHandler: guard('usr.gestionar') }, async (req) => {
    const body = parse(usuarioSchema, req.body);
    const tempPassword = body.password || `Kite-${randomToken(6)}9`;
    const p = passwordProblems(tempPassword);
    if (p) throw badRequest(p);
    const result = await db.transaction(async (tx) => {
      let [u] = await tx.select().from(usuarios).where(eq(sql`lower(${usuarios.email})`, body.email));
      if (!u) {
        [u] = await tx
          .insert(usuarios)
          .values({ email: body.email, passwordHash: await hashPassword(tempPassword), debeCambiarPassword: !body.password })
          .returning();
      }
      const [exists] = await tx
        .select()
        .from(usuarioEmpresas)
        .where(and(eq(usuarioEmpresas.usuarioId, u!.id), eq(usuarioEmpresas.empresaId, req.ctx.empresaId)));
      if (exists) throw conflict('Ese email ya tiene acceso a esta empresa');
      if (body.personaId) {
        const [ya] = await tx.select().from(usuarioEmpresas).where(eq(usuarioEmpresas.personaId, body.personaId));
        if (ya) throw conflict('Esa persona ya tiene un usuario');
      }
      const [ue] = await tx
        .insert(usuarioEmpresas)
        .values({ usuarioId: u!.id, empresaId: req.ctx.empresaId, personaId: body.personaId ?? null, rolId: body.rolId ?? null, activo: body.activo, accesoHasta: body.accesoHasta || null })
        .returning();
      if (body.permisosExtra?.length) await tx.insert(usuarioPermisos).values(body.permisosExtra.map((x) => ({ usuarioEmpresaId: ue!.id, ...x })));
      await audit(tx, req.ctx, 'crear', 'usuario', ue!.id, { email: body.email, rolId: body.rolId, personaId: body.personaId });
      if (body.enviarInvitacion) {
        const [emp] = await tx.select({ nombre: empresas.nombre }).from(empresas).where(eq(empresas.id, req.ctx.empresaId));
        await queueEmail(tx, {
          empresaId: req.ctx.empresaId,
          para: body.email,
          asunto: `Tu acceso a ${emp!.nombre}`,
          html: emailLayout({
            empresa: emp!.nombre,
            titulo: 'Ya tienes acceso',
            cuerpo: `<p>Se ha creado tu usuario en ${emp!.nombre}.</p><p>Email: <b>${body.email}</b><br>Contraseña temporal: <b>${tempPassword}</b></p><p>Te pediremos cambiarla al entrar.</p>`,
            boton: { texto: 'Entrar', url: config.appUrl + '/login' },
          }),
        });
      }
      return { id: ue!.id, passwordTemporal: body.password ? null : tempPassword };
    });
    invalidatePermissions();
    return result;
  });

  app.patch('/usuarios/:id', { preHandler: guard('usr.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(usuarioSchema.partial().omit({ email: true, password: true, enviarInvitacion: true }), req.body);
    await db.transaction(async (tx) => {
      const [ue] = await tx.select().from(usuarioEmpresas).where(and(eq(usuarioEmpresas.id, id), eq(usuarioEmpresas.empresaId, req.ctx.empresaId)));
      if (!ue) throw notFound('Usuario no encontrado');
      if (ue.usuarioId === req.ctx.usuarioId && body.activo === false) throw badRequest('No puedes desactivar tu propio usuario');
      const data: Record<string, unknown> = {};
      if (body.rolId !== undefined) data.rolId = body.rolId;
      if (body.personaId !== undefined) data.personaId = body.personaId;
      if (body.activo !== undefined) data.activo = body.activo;
      if (body.accesoHasta !== undefined) data.accesoHasta = body.accesoHasta || null;
      if (Object.keys(data).length) await tx.update(usuarioEmpresas).set(data).where(eq(usuarioEmpresas.id, id));
      if (body.permisosExtra) {
        await tx.delete(usuarioPermisos).where(eq(usuarioPermisos.usuarioEmpresaId, id));
        if (body.permisosExtra.length) await tx.insert(usuarioPermisos).values(body.permisosExtra.map((x) => ({ usuarioEmpresaId: id, ...x })));
      }
      if (body.activo === false) await tx.delete(sesiones).where(and(eq(sesiones.usuarioId, ue.usuarioId), eq(sesiones.empresaId, req.ctx.empresaId)));
      await audit(tx, req.ctx, 'editar', 'usuario', id, body);
    });
    invalidatePermissions(id);
    return { ok: true };
  });

  app.post('/usuarios/:id/reset-password', { preHandler: guard('usr.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const [ue] = await db.select().from(usuarioEmpresas).where(and(eq(usuarioEmpresas.id, id), eq(usuarioEmpresas.empresaId, req.ctx.empresaId)));
    if (!ue) throw notFound();
    const temp = `Kite-${randomToken(6)}7`;
    await db.transaction(async (tx) => {
      await tx.update(usuarios).set({ passwordHash: await hashPassword(temp), debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: null }).where(eq(usuarios.id, ue.usuarioId));
      await tx.delete(sesiones).where(eq(sesiones.usuarioId, ue.usuarioId));
      await audit(tx, req.ctx, 'reset_password', 'usuario', id);
    });
    return { passwordTemporal: temp };
  });

  /* ── Auditoría ── */
  app.get('/auditoria', { preHandler: guard('auditoria.ver') }, async (req) => {
    const q = req.query as { entidad?: string; entidadId?: string; usuarioId?: string; page?: string; desde?: string; hasta?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const conds = [eq(auditoria.empresaId, req.ctx.empresaId)];
    if (q.entidad) conds.push(eq(auditoria.entidad, q.entidad));
    if (q.entidadId) conds.push(eq(auditoria.entidadId, q.entidadId));
    if (q.usuarioId) conds.push(eq(auditoria.usuarioId, q.usuarioId));
    if (q.desde) conds.push(sql`${auditoria.creadoEn} >= ${q.desde}::date`);
    if (q.hasta) conds.push(sql`${auditoria.creadoEn} < (${q.hasta}::date + 1)`);
    const rows = await db
      .select({
        id: auditoria.id,
        accion: auditoria.accion,
        entidad: auditoria.entidad,
        entidadId: auditoria.entidadId,
        cambios: auditoria.cambios,
        ip: auditoria.ip,
        creadoEn: auditoria.creadoEn,
        usuario: usuarios.email,
      })
      .from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
      .where(and(...conds))
      .orderBy(desc(auditoria.id))
      .limit(50)
      .offset((page - 1) * 50);
    return { items: rows, page };
  });
}
