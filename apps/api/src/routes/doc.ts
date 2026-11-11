import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fmtDate } from '@kite/shared';
import { config } from '../config';
import { db } from '../db/client';
import { empresas, firmas, personas, plantillas, terceros } from '../db/schema';
import { randomToken, sha256 } from '../core/auth';
import { audit } from '../core/audit';
import { canViewEntity } from '../core/entities';
import { badRequest, forbidden, notFound, parse } from '../core/errors';
import { fileBuffer, fileUrl, getFile, saveFile } from '../core/files';
import { emailLayout, queueEmail } from '../core/mail';
import { notify } from '../core/notify';
import { appendSignaturePage, renderTextPdf } from '../core/pdf';
import { guard } from '../core/permissions';
import { systemCtx } from '../core/context';
import { activeModules } from '../core/modules';

/** Rellena {{campo}} con datos de la persona o del tercero y de la empresa. */
async function datosPara(empresaId: string, entidad: string | null | undefined, id: string | null | undefined) {
  const [e] = await db.select().from(empresas).where(eq(empresas.id, empresaId));
  const datos: Record<string, string> = {
    'empresa.nombre': e?.nombre ?? '',
    'empresa.razonSocial': e?.razonSocial ?? e?.nombre ?? '',
    'empresa.nif': e?.nif ?? '',
    'empresa.direccion': [e?.direccion, e?.codigoPostal, e?.localidad].filter(Boolean).join(', '),
    hoy: fmtDate(new Date()),
  };
  if (entidad === 'persona' && id) {
    const [p] = await db.select().from(personas).where(eq(personas.id, id));
    if (p) Object.assign(datos, { 'persona.nombre': `${p.nombre} ${p.apellidos ?? ''}`.trim(), 'persona.email': p.email ?? '', 'persona.puesto': p.puesto ?? '' });
    const extra = await db.execute<Record<string, string>>(sql`SELECT * FROM fic_trabajadores WHERE persona_id = ${id}`).catch(() => []);
    const t = extra[0];
    if (t) for (const [k, v] of Object.entries(t)) if (v !== null && typeof v !== 'object') datos[`trabajador.${k.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())}`] = String(v);
  }
  if (entidad === 'tercero' && id) {
    const [t] = await db.select().from(terceros).where(eq(terceros.id, id));
    if (t) Object.assign(datos, { 'tercero.nombre': t.nombre, 'tercero.razonSocial': t.razonSocial ?? t.nombre, 'tercero.nif': t.nif ?? '', 'tercero.direccion': [t.direccion, t.codigoPostal, t.localidad].filter(Boolean).join(', ') });
  }
  return { datos, empresa: e! };
}

export function renderPlantilla(contenido: string, datos: Record<string, string>) {
  return contenido.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => datos[k] ?? `[${k}]`);
}

export async function docRoutes(app: FastifyInstance) {
  /* ── Plantillas ── */
  const plantillaSchema = z.object({
    nombre: z.string().trim().min(1),
    tipo: z.string().default('documento'),
    entidad: z.enum(['persona', 'tercero', 'ninguna']).default('persona'),
    contenido: z.string().min(1),
    activo: z.boolean().default(true),
  });
  app.get('/plantillas', async (req) => db.select().from(plantillas).where(eq(plantillas.empresaId, req.ctx.empresaId)).orderBy(asc(plantillas.nombre)));
  app.post('/plantillas', { preHandler: guard('doc.plantillas') }, async (req) => {
    const body = parse(plantillaSchema, req.body);
    const [p] = await db.insert(plantillas).values({ ...body, empresaId: req.ctx.empresaId }).returning();
    await audit(db, req.ctx, 'crear', 'plantilla', p!.id);
    return p;
  });
  app.patch('/plantillas/:id', { preHandler: guard('doc.plantillas') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(plantillaSchema.partial(), req.body);
    const [p] = await db.update(plantillas).set(body).where(and(eq(plantillas.id, id), eq(plantillas.empresaId, req.ctx.empresaId))).returning();
    if (!p) throw notFound();
    await audit(db, req.ctx, 'editar', 'plantilla', id);
    return p;
  });
  app.delete('/plantillas/:id', { preHandler: guard('doc.plantillas') }, async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(plantillas).where(and(eq(plantillas.id, id), eq(plantillas.empresaId, req.ctx.empresaId)));
    return { ok: true };
  });

  /** Genera un documento a partir de una plantilla para una persona o tercero; opcionalmente lo guarda como adjunto. */
  app.post('/plantillas/:id/generar', async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ entidad: z.string().nullish(), entidadId: z.string().uuid().nullish() }), req.body);
    if (body.entidad && body.entidadId && !(await canViewEntity(req.ctx, body.entidad, body.entidadId))) throw forbidden();
    const [p] = await db.select().from(plantillas).where(and(eq(plantillas.id, id), eq(plantillas.empresaId, req.ctx.empresaId)));
    if (!p) throw notFound();
    const { datos, empresa } = await datosPara(req.ctx.empresaId, body.entidad, body.entidadId);
    const texto = renderPlantilla(p.contenido, datos);
    const pdf = await renderTextPdf(p.nombre, texto, { nombre: empresa.nombre, nif: empresa.nif, direccion: empresa.direccion, localidad: empresa.localidad });
    const f = await saveFile(db, { empresaId: req.ctx.empresaId, nombre: `${p.nombre}.pdf`, mime: 'application/pdf', data: pdf, subidoPor: req.ctx.usuarioId });
    return { archivoId: f.id, url: fileUrl(f.id), texto };
  });

  /* ── Firma electrónica ── */
  const firmaSchema = z.object({
    titulo: z.string().trim().min(1),
    archivoId: z.string().uuid().nullish(),
    plantillaId: z.string().uuid().nullish(),
    entidad: z.string().nullish(),
    entidadId: z.string().uuid().nullish(),
    firmanteNombre: z.string().trim().min(1),
    firmanteEmail: z.string().email().nullish().or(z.literal('')),
    personaId: z.string().uuid().nullish(),
    diasValidez: z.number().int().min(1).max(90).default(15),
  });
  app.get('/firmas', async (req) => {
    const q = req.query as { entidad?: string; entidadId?: string; mias?: string };
    if (q.entidad && q.entidadId && !(await canViewEntity(req.ctx, q.entidad, q.entidadId))) throw forbidden();
    const conds = [eq(firmas.empresaId, req.ctx.empresaId)];
    if (q.entidad && q.entidadId) conds.push(eq(firmas.entidad, q.entidad), eq(firmas.entidadId, q.entidadId));
    else if (q.mias) conds.push(req.ctx.personaId ? eq(firmas.personaId, req.ctx.personaId) : sql`false`);
    else if (!req.ctx.perms.has('doc.firmas')) throw forbidden();
    const rows = await db.select().from(firmas).where(and(...conds)).orderBy(desc(firmas.creadoEn)).limit(200);
    return rows.map(({ tokenHash: _t, firmaImagen: _f, ...r }) => ({ ...r, url: fileUrl(r.archivoFirmadoId ?? r.archivoId) }));
  });
  app.post('/firmas', { preHandler: guard('doc.firmas') }, async (req) => {
    const body = parse(firmaSchema, req.body);
    if (!body.archivoId && !body.plantillaId) throw badRequest('Indica el documento o la plantilla a firmar');
    if (body.entidad && body.entidadId && !(await canViewEntity(req.ctx, body.entidad, body.entidadId))) throw forbidden();
    let archivoId = body.archivoId ?? null;
    let contenido: string | null = null;
    if (body.plantillaId) {
      const [p] = await db.select().from(plantillas).where(and(eq(plantillas.id, body.plantillaId), eq(plantillas.empresaId, req.ctx.empresaId)));
      if (!p) throw notFound('Plantilla no encontrada');
      const { datos, empresa } = await datosPara(req.ctx.empresaId, body.entidad, body.entidadId);
      contenido = renderPlantilla(p.contenido, datos);
      const pdf = await renderTextPdf(body.titulo, contenido, { nombre: empresa.nombre, nif: empresa.nif, direccion: empresa.direccion, localidad: empresa.localidad });
      archivoId = (await saveFile(db, { empresaId: req.ctx.empresaId, nombre: `${body.titulo}.pdf`, mime: 'application/pdf', data: pdf, subidoPor: req.ctx.usuarioId })).id;
    }
    const token = randomToken(24);
    const result = await db.transaction(async (tx) => {
      const [f] = await tx
        .insert(firmas)
        .values({
          empresaId: req.ctx.empresaId,
          titulo: body.titulo,
          archivoId,
          contenido,
          entidad: body.entidad ?? null,
          entidadId: body.entidadId ?? null,
          firmanteNombre: body.firmanteNombre,
          firmanteEmail: body.firmanteEmail || null,
          personaId: body.personaId ?? null,
          tokenHash: sha256(token),
          expiraEn: new Date(Date.now() + body.diasValidez * 86400_000),
          creadoPor: req.ctx.usuarioId,
        })
        .returning();
      const url = `${config.appUrl}/firmar/${token}`;
      const [emp] = await tx.select({ nombre: empresas.nombre }).from(empresas).where(eq(empresas.id, req.ctx.empresaId));
      if (body.firmanteEmail)
        await queueEmail(tx, {
          empresaId: req.ctx.empresaId,
          para: body.firmanteEmail,
          asunto: `Documento para firmar: ${body.titulo}`,
          html: emailLayout({ empresa: emp!.nombre, titulo: 'Tienes un documento pendiente de firma', cuerpo: `<p>${emp!.nombre} te envía <b>${body.titulo}</b> para que lo revises y lo firmes.</p>`, boton: { texto: 'Revisar y firmar', url } }),
        });
      if (body.personaId) await notify(tx, req.ctx, { modulo: 'doc', tipo: 'firma', titulo: `Documento para firmar: ${body.titulo}`, enlace: `/firmar/${token}`, personaIds: [body.personaId] });
      await audit(tx, req.ctx, 'solicitar_firma', 'firma', f!.id, { titulo: body.titulo, firmante: body.firmanteNombre });
      return { id: f!.id, url };
    });
    return result;
  });

  app.get('/public/firmas/:token', { config: { public: true } }, async (req) => {
    const { token } = req.params as { token: string };
    const [f] = await db.select().from(firmas).where(eq(firmas.tokenHash, sha256(token)));
    if (!f) throw notFound('Este enlace de firma no existe');
    const [e] = await db.select({ nombre: empresas.nombre }).from(empresas).where(eq(empresas.id, f.empresaId));
    const caducada = f.expiraEn && new Date(f.expiraEn) < new Date() && f.estado === 'pendiente';
    return {
      empresa: e?.nombre,
      titulo: f.titulo,
      firmante: f.firmanteNombre,
      estado: caducada ? 'caducado' : f.estado,
      firmadoEn: f.firmadoEn,
      contenido: f.contenido,
      url: fileUrl(f.archivoFirmadoId ?? f.archivoId, 3600),
    };
  });
  app.post('/public/firmas/:token', { config: { public: true, rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req) => {
    const { token } = req.params as { token: string };
    const body = parse(z.object({ firma: z.string().startsWith('data:image/png;base64,'), acepto: z.literal(true), rechazar: z.boolean().optional() }), req.body);
    const [f] = await db.select().from(firmas).where(eq(firmas.tokenHash, sha256(token)));
    if (!f) throw notFound();
    if (f.estado !== 'pendiente') throw badRequest('Este documento ya no está pendiente de firma');
    if (f.expiraEn && new Date(f.expiraEn) < new Date()) throw badRequest('El plazo para firmar ha caducado');
    const png = Buffer.from(body.firma.split(',')[1]!, 'base64');
    if (png.length > 600_000) throw badRequest('La imagen de la firma es demasiado grande');
    const original = f.archivoId ? await getFile(db, f.archivoId) : null;
    const origBuf = original ? await fileBuffer(original.ruta) : await renderTextPdf(f.titulo, f.contenido ?? '', { nombre: '' });
    const fecha = new Date();
    const huella = sha256(origBuf);
    const signed = await appendSignaturePage(origBuf, {
      firmante: f.firmanteNombre,
      email: f.firmanteEmail,
      fecha,
      ip: req.ip,
      userAgent: String(req.headers['user-agent'] ?? ''),
      firmaPng: png,
      huella,
      titulo: f.titulo,
    });
    await db.transaction(async (tx) => {
      const out = await saveFile(tx, { empresaId: f.empresaId, nombre: `${f.titulo} (firmado).pdf`, mime: 'application/pdf', data: signed });
      await tx
        .update(firmas)
        .set({ estado: 'firmado', firmadoEn: fecha, ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300), firmaImagen: body.firma, evidenciaHash: huella, archivoFirmadoId: out.id })
        .where(eq(firmas.id, f.id));
      const ctx = systemCtx(f.empresaId, await activeModules(f.empresaId));
      await audit(tx, ctx, 'firmar', 'firma', f.id, { firmante: f.firmanteNombre, ip: req.ip, huella });
      if (f.creadoPor) await notify(tx, ctx, { modulo: 'doc', tipo: 'firmado', titulo: `${f.firmanteNombre} ha firmado ${f.titulo}`, usuarioIds: [f.creadoPor], enlace: f.entidad === 'persona' ? `/personas/${f.entidadId}` : null });
    });
    return { ok: true };
  });
}
