import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { initials, normalizarApariencia, preferenciasSchema, type SessionInfo } from '@kite/shared';
import { db } from '../db/client';
import { departamentos, empresas, personas, roles, sesiones, usuarioEmpresas, usuarios } from '../db/schema';
import {
  SESSION_COOKIE,
  createSession,
  hashPassword,
  newTotpSecret,
  passwordProblems,
  sessionCookieOptions,
  sha256,
  verifyPassword,
  verifyTotp,
} from '../core/auth';
import { audit } from '../core/audit';
import { badRequest, forbidden, parse, unauthorized } from '../core/errors';
import { fileUrl } from '../core/files';
import { marcaPublica } from '../core/marca-publica';
import { invalidatePermissions } from '../core/permissions';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un email válido'),
  password: z.string().min(1, 'Escribe la contraseña'),
  codigo: z.string().optional(),
  empresaId: z.string().uuid().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    { config: { public: true, rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parse(loginSchema, req.body);
      const [u] = await db.select().from(usuarios).where(eq(sql`lower(${usuarios.email})`, body.email));
      const fail = () => unauthorized('Email o contraseña incorrectos');
      if (!u || !u.activo) {
        await verifyPassword(body.password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'); // tiempo constante
        throw fail();
      }
      if (u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date())
        throw unauthorized('Cuenta bloqueada temporalmente por intentos fallidos. Prueba en 15 minutos.');
      if (!(await verifyPassword(body.password, u.passwordHash))) {
        const intentos = u.intentosFallidos + 1;
        await db
          .update(usuarios)
          .set({ intentosFallidos: intentos, bloqueadoHasta: intentos >= 8 ? new Date(Date.now() + 15 * 60_000) : null })
          .where(eq(usuarios.id, u.id));
        throw fail();
      }
      if (u.totpActivo) {
        if (!body.codigo) return reply.status(200).send({ requiereCodigo: true });
        if (!u.totpSecreto || !verifyTotp(u.totpSecreto, body.codigo)) throw unauthorized('Código de verificación incorrecto');
      }
      // Sin empresa indicada se entra en la primera a la que se le dio acceso
      const accesos = await db
        .select({ empresaId: usuarioEmpresas.empresaId })
        .from(usuarioEmpresas)
        .where(and(eq(usuarioEmpresas.usuarioId, u.id), eq(usuarioEmpresas.activo, true)))
        .orderBy(usuarioEmpresas.creadoEn);
      if (!accesos.length) throw forbidden('Tu usuario no tiene acceso a ninguna empresa');
      const empresaId = accesos.find((a) => a.empresaId === body.empresaId)?.empresaId ?? accesos[0]!.empresaId;
      const { token, expiraEn } = await createSession(u.id, empresaId, req);
      await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() }).where(eq(usuarios.id, u.id));
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiraEn));
      return { ok: true, debeCambiarPassword: u.debeCambiarPassword };
    },
  );

  app.post('/auth/logout', { config: { public: true } }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await db.delete(sesiones).where(eq(sesiones.id, sha256(token)));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (req): Promise<SessionInfo> => {
    const ctx = req.ctx;
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, ctx.usuarioId));
    const [emp] = await db.select().from(empresas).where(eq(empresas.id, ctx.empresaId));
    const [ue] = await db
      .select({ rolId: roles.id, rolNombre: roles.nombre, preferencias: usuarioEmpresas.preferencias })
      .from(usuarioEmpresas)
      .leftJoin(roles, eq(roles.id, usuarioEmpresas.rolId))
      .where(eq(usuarioEmpresas.id, ctx.usuarioEmpresaId));
    let persona: { foto: string | null; depId: string | null; depNombre: string | null } | undefined;
    let tieneEquipo = false;
    if (ctx.personaId) {
      [persona] = await db
        .select({ foto: personas.fotoArchivoId, depId: departamentos.id, depNombre: departamentos.nombre })
        .from(personas)
        .leftJoin(departamentos, eq(departamentos.id, personas.departamentoId))
        .where(eq(personas.id, ctx.personaId));
      const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(personas).where(and(eq(personas.responsableId, ctx.personaId), eq(personas.activo, true)));
      tieneEquipo = (n?.n ?? 0) > 0;
    }
    const emps = await db
      .select({ id: empresas.id, nombre: empresas.nombre })
      .from(usuarioEmpresas)
      .innerJoin(empresas, eq(empresas.id, usuarioEmpresas.empresaId))
      .where(and(eq(usuarioEmpresas.usuarioId, ctx.usuarioId), eq(usuarioEmpresas.activo, true)))
      .orderBy(empresas.creadoEn);
    return {
      user: {
        id: ctx.usuarioId,
        email: u!.email,
        personaId: ctx.personaId,
        nombre: ctx.nombre,
        iniciales: initials(ctx.nombre),
        fotoUrl: fileUrl(persona?.foto, 86400),
        rol: ue?.rolId ? { id: ue.rolId, nombre: ue.rolNombre! } : null,
        departamento: persona?.depId ? { id: persona.depId, nombre: persona.depNombre! } : null,
        tieneEquipo,
        totp: u!.totpActivo,
      },
      empresa: { id: emp!.id, nombre: emp!.nombre, nif: emp!.nif, logoUrl: fileUrl(emp!.logoArchivoId, 86400), apariencia: normalizarApariencia(emp!.ajustes?.apariencia) },
      empresas: emps,
      preferencias: ue?.preferencias ?? {},
      permisos: Object.fromEntries(ctx.perms),
      modulos: [...ctx.modules],
    };
  });

  /* Preferencias de la persona en la empresa actual (favoritos del lanzador de aplicaciones…) */
  app.patch('/auth/preferencias', async (req) => {
    const body = parse(preferenciasSchema, req.body);
    const [ue] = await db.select({ preferencias: usuarioEmpresas.preferencias }).from(usuarioEmpresas).where(eq(usuarioEmpresas.id, req.ctx.usuarioEmpresaId));
    const preferencias = { ...(ue?.preferencias ?? {}), ...body };
    await db.update(usuarioEmpresas).set({ preferencias }).where(eq(usuarioEmpresas.id, req.ctx.usuarioEmpresaId));
    return preferencias;
  });

  /**
   * Marca que se enseña antes de iniciar sesión (pantalla de entrada): nombre, logo y apariencia.
   * Con ?empresa=<id> la de esa empresa; sin él, la de la primera empresa de la instalación.
   */
  app.get('/public/marca', { config: { public: true } }, async (req) => {
    const { empresa } = parse(z.object({ empresa: z.string().uuid().optional() }), req.query);
    const [emp] = empresa
      ? await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresa))
      : await db.select({ id: empresas.id }).from(empresas).orderBy(empresas.creadoEn).limit(1);
    if (!emp) return { id: null, nombre: null, logoUrl: null, apariencia: normalizarApariencia(null) };
    return { id: emp.id, ...(await marcaPublica(emp.id)) };
  });

  app.post('/auth/empresa', async (req) => {
    const { empresaId } = parse(z.object({ empresaId: z.string().uuid() }), req.body);
    const [ue] = await db
      .select()
      .from(usuarioEmpresas)
      .where(and(eq(usuarioEmpresas.usuarioId, req.ctx.usuarioId), eq(usuarioEmpresas.empresaId, empresaId), eq(usuarioEmpresas.activo, true)));
    if (!ue) throw forbidden('No tienes acceso a esa empresa');
    await db.update(sesiones).set({ empresaId }).where(eq(sesiones.id, req.sessionId!));
    return { ok: true };
  });

  app.post('/auth/password', async (req) => {
    const body = parse(z.object({ actual: z.string(), nueva: z.string() }), req.body);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, req.ctx.usuarioId));
    if (!u || !(await verifyPassword(body.actual, u.passwordHash))) throw badRequest('La contraseña actual no es correcta');
    const p = passwordProblems(body.nueva);
    if (p) throw badRequest(p);
    await db.transaction(async (tx) => {
      await tx.update(usuarios).set({ passwordHash: await hashPassword(body.nueva), debeCambiarPassword: false }).where(eq(usuarios.id, u.id));
      // cierra el resto de sesiones
      await tx.delete(sesiones).where(and(eq(sesiones.usuarioId, u.id), sql`${sesiones.id} <> ${req.sessionId ?? ''}`));
      await audit(tx, req.ctx, 'cambiar_password', 'usuario', u.id);
    });
    return { ok: true };
  });

  /* Doble factor */
  app.post('/auth/2fa/preparar', async (req) => {
    const secreto = newTotpSecret();
    await db.update(usuarios).set({ totpSecreto: secreto, totpActivo: false }).where(eq(usuarios.id, req.ctx.usuarioId));
    const [u] = await db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.id, req.ctx.usuarioId));
    const uri = `otpauth://totp/KiteERP:${encodeURIComponent(u!.email)}?secret=${secreto}&issuer=KiteERP`;
    const QR = await import('qrcode');
    return { secreto, uri, qr: await QR.toDataURL(uri, { margin: 1, width: 220 }) };
  });
  app.post('/auth/2fa/activar', async (req) => {
    const { codigo } = parse(z.object({ codigo: z.string().min(6) }), req.body);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, req.ctx.usuarioId));
    if (!u?.totpSecreto || !verifyTotp(u.totpSecreto, codigo)) throw badRequest('El código no es correcto. Comprueba la hora del móvil.');
    await db.update(usuarios).set({ totpActivo: true }).where(eq(usuarios.id, u.id));
    await audit(db, req.ctx, 'activar_2fa', 'usuario', u.id);
    return { ok: true };
  });
  app.post('/auth/2fa/desactivar', async (req) => {
    const { password } = parse(z.object({ password: z.string() }), req.body);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, req.ctx.usuarioId));
    if (!u || !(await verifyPassword(password, u.passwordHash))) throw badRequest('Contraseña incorrecta');
    await db.update(usuarios).set({ totpActivo: false, totpSecreto: null }).where(eq(usuarios.id, u.id));
    await audit(db, req.ctx, 'desactivar_2fa', 'usuario', u.id);
    return { ok: true };
  });

  /* Sesiones abiertas */
  app.get('/auth/sesiones', async (req) => {
    const rows = await db
      .select({ id: sesiones.id, ip: sesiones.ip, userAgent: sesiones.userAgent, creadoEn: sesiones.creadoEn, ultimoUso: sesiones.ultimoUso })
      .from(sesiones)
      .where(eq(sesiones.usuarioId, req.ctx.usuarioId))
      .orderBy(desc(sesiones.ultimoUso));
    return rows.map((r) => ({ ...r, id: r.id.slice(0, 12), actual: r.id === req.sessionId }));
  });
  app.delete('/auth/sesiones/:id', async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(sesiones).where(and(eq(sesiones.usuarioId, req.ctx.usuarioId), sql`left(${sesiones.id}, 12) = ${id}`));
    return { ok: true };
  });

  invalidatePermissions; // referenciado para el bundler
}
