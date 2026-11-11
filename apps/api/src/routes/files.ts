import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client';
import { adjuntos, archivos, usuarios } from '../db/schema';
import { verifyFileSignature } from '../core/auth';
import { audit } from '../core/audit';
import { canEditEntity, canViewEntity } from '../core/entities';
import { badRequest, forbidden, notFound, parse, unauthorized } from '../core/errors';
import { fileStream, fileUrl, getFile, saveFile } from '../core/files';

export async function filesRoutes(app: FastifyInstance) {
  /** Subida de uno o varios archivos. Devuelve sus ids para asociarlos después. */
  app.post('/archivos', async (req) => {
    const out: { id: string; nombre: string; mime: string; tamano: number; url: string | null }[] = [];
    for await (const part of req.files()) {
      const data = await part.toBuffer();
      if (!data.length) continue;
      const f = await saveFile(db, { empresaId: req.ctx.empresaId, nombre: part.filename, mime: part.mimetype, data, subidoPor: req.ctx.usuarioId });
      out.push({ id: f.id, nombre: f.nombre, mime: f.mime, tamano: f.tamano, url: fileUrl(f.id) });
    }
    if (!out.length) throw badRequest('No se ha recibido ningún archivo');
    return out;
  });

  /** Descarga con URL firmada (la firma la emite quien ya comprobó el permiso). */
  app.get('/archivos/:id', { config: { public: true } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { exp, sig, descargar } = req.query as { exp: string; sig: string; descargar?: string };
    if (!verifyFileSignature(id, exp, sig)) throw unauthorized('Enlace caducado o no válido');
    const f = await getFile(db, id);
    reply.header('content-type', f.mime);
    reply.header('cache-control', 'private, max-age=3600');
    reply.header('content-disposition', `${descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.nombre)}`);
    return reply.send(fileStream(f.ruta));
  });

  /* ── Adjuntos de cualquier entidad (respetan los permisos de la entidad) ── */
  app.get('/adjuntos/:entidad/:id', async (req) => {
    const { entidad, id } = req.params as { entidad: string; id: string };
    if (!(await canViewEntity(req.ctx, entidad, id))) throw forbidden();
    const rows = await db
      .select({
        id: adjuntos.id,
        carpeta: adjuntos.carpeta,
        descripcion: adjuntos.descripcion,
        caduca: adjuntos.caduca,
        version: adjuntos.version,
        grupoId: adjuntos.grupoId,
        creadoEn: adjuntos.creadoEn,
        archivoId: archivos.id,
        nombre: archivos.nombre,
        mime: archivos.mime,
        tamano: archivos.tamano,
        subidoPor: usuarios.email,
      })
      .from(adjuntos)
      .innerJoin(archivos, eq(archivos.id, adjuntos.archivoId))
      .leftJoin(usuarios, eq(usuarios.id, adjuntos.subidoPor))
      .where(and(eq(adjuntos.entidad, entidad), eq(adjuntos.entidadId, id), isNull(adjuntos.archivadoEn)))
      .orderBy(desc(adjuntos.creadoEn));
    return rows.map((r) => ({ ...r, url: fileUrl(r.archivoId) }));
  });

  app.post('/adjuntos/:entidad/:id', async (req) => {
    const { entidad, id } = req.params as { entidad: string; id: string };
    const body = parse(
      z.object({ archivoIds: z.array(z.string().uuid()).min(1), carpeta: z.string().nullish(), descripcion: z.string().nullish(), caduca: z.string().nullish(), grupoId: z.string().uuid().nullish() }),
      req.body,
    );
    if (!(await canEditEntity(req.ctx, entidad, id))) throw forbidden();
    return db.transaction(async (tx) => {
      let version = 1;
      if (body.grupoId) {
        const [v] = await tx.select({ v: sql<number>`max(${adjuntos.version})::int` }).from(adjuntos).where(eq(adjuntos.grupoId, body.grupoId));
        version = (v?.v ?? 0) + 1;
      }
      const rows = await tx
        .insert(adjuntos)
        .values(
          body.archivoIds.map((archivoId) => ({
            empresaId: req.ctx.empresaId,
            entidad,
            entidadId: id,
            archivoId,
            carpeta: body.carpeta ?? null,
            descripcion: body.descripcion ?? null,
            caduca: body.caduca || null,
            grupoId: body.grupoId ?? null,
            version,
            subidoPor: req.ctx.usuarioId,
          })),
        )
        .returning();
      // cada adjunto nuevo inicia su propio grupo de versiones
      for (const r of rows) if (!r.grupoId) await tx.update(adjuntos).set({ grupoId: r.id }).where(eq(adjuntos.id, r.id));
      await audit(tx, req.ctx, 'adjuntar', entidad, id, { archivos: body.archivoIds });
      return rows;
    });
  });

  app.delete('/adjuntos/:adjuntoId', async (req) => {
    const { adjuntoId } = req.params as { adjuntoId: string };
    const [a] = await db.select().from(adjuntos).where(and(eq(adjuntos.id, adjuntoId), eq(adjuntos.empresaId, req.ctx.empresaId)));
    if (!a) throw notFound();
    if (!(await canEditEntity(req.ctx, a.entidad, a.entidadId))) throw forbidden();
    await db.transaction(async (tx) => {
      await tx.update(adjuntos).set({ archivadoEn: new Date() }).where(eq(adjuntos.id, adjuntoId));
      await audit(tx, req.ctx, 'quitar_adjunto', a.entidad, a.entidadId, { adjuntoId });
    });
    return { ok: true };
  });

  /** Documentos que caducan pronto (solo de entidades que el usuario puede ver). */
  app.get('/adjuntos-caducan', async (req) => {
    const limite = new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10);
    const rows = await db
      .select({ id: adjuntos.id, entidad: adjuntos.entidad, entidadId: adjuntos.entidadId, caduca: adjuntos.caduca, nombre: archivos.nombre })
      .from(adjuntos)
      .innerJoin(archivos, eq(archivos.id, adjuntos.archivoId))
      .where(and(eq(adjuntos.empresaId, req.ctx.empresaId), isNull(adjuntos.archivadoEn), lte(adjuntos.caduca, limite)))
      .orderBy(adjuntos.caduca)
      .limit(100);
    const out = [];
    for (const r of rows) if (await canViewEntity(req.ctx, r.entidad, r.entidadId)) out.push(r);
    return out;
  });
}
