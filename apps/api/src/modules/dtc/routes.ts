import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dtcShared } from '@kite/shared';
import { db } from '../../db/client';
import { archivos, departamentos, personas } from '../../db/schema/core';
import { audit } from '../../core/audit';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { fileUrl } from '../../core/files';
import { nextCode } from '../../core/numbering';
import { can, guard } from '../../core/permissions';
import { searchRefs } from '../../core/refs';
import { dtcDistribucion, dtcDocumentos, dtcLecturas, dtcVersiones, dtcVinculos } from './schema';
import {
  aprobarVersion,
  cargarDoc,
  documentosVinculados,
  enviarARevision,
  etiquetasVinculos,
  hoyMadrid,
  informeLecturas,
  marcarLeido,
  nuevaVersion,
  pendientesDeLeer,
  puedeGestionar,
  rechazarVersion,
  sumarMeses,
  visibilidad,
} from './service';

const { dtcDocumentoResource, DTC_VINCULOS, DTC_VINCULO_REF } = dtcShared;
const nombre = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;
const VINCULOS = DTC_VINCULOS.map((v) => v.value) as [string, ...string[]];

export async function dtcRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: '/documentos',
    resource: dtcDocumentoResource,
    table: dtcDocumentos,
    entity: 'dtc_documento',
    perms: { ver: 'dtc.ver', crear: 'dtc.editar' },
    searchCols: [dtcDocumentos.codigo, dtcDocumentos.titulo, dtcDocumentos.descripcion],
    baseWhere: (ctx, req) => {
      const q = req.query as Record<string, string>;
      const conds = [visibilidad(ctx)];
      // ?vinculo=articulo:<uuid>  ·  ?vinculoTipo=sat_equipo  ·  ?etiqueta=…
      if (q.vinculo) {
        const [ent, id] = q.vinculo.split(':');
        if (ent && id && /^[0-9a-f-]{36}$/i.test(id)) conds.push(sql`EXISTS (SELECT 1 FROM dtc_vinculos v WHERE v.documento_id = ${dtcDocumentos.id} AND v.entidad = ${ent} AND v.entidad_id = ${id})`);
      } else if (q.vinculoTipo && VINCULOS.includes(q.vinculoTipo)) conds.push(sql`EXISTS (SELECT 1 FROM dtc_vinculos v WHERE v.documento_id = ${dtcDocumentos.id} AND v.entidad = ${q.vinculoTipo})`);
      if (q.etiqueta) conds.push(sql`${dtcDocumentos.etiquetas} @> ARRAY[${q.etiqueta}]::text[]`);
      if (q.revisionVencida === '1') conds.push(sql`${dtcDocumentos.proximaRevision} <= ${hoyMadrid()}`);
      const c = conds.filter(Boolean);
      return c.length ? and(...c) : undefined;
    },
    beforeSave: async (tx, ctx, data, existing) => {
      for (const k of ['etiquetas', 'revisionMeses', 'tipo', 'confidencialidad']) if (data[k] === null) delete data[k];
      if (data.confidencialidad === 'restringido' && !can(ctx, 'dtc.restringido')) throw forbidden('No puedes clasificar documentos como restringidos');
      if (data.codigo !== undefined) data.codigo = data.codigo ? String(data.codigo).trim().toUpperCase() : null;
      if (!existing) {
        if (!data.codigo) data.codigo = await nextCode(tx, ctx.empresaId, 'dtc_documento', 'DT');
        data.responsableId ??= ctx.personaId;
        data.estado = 'borrador';
      } else if (data.codigo === null) delete data.codigo;
      if (data.codigo) {
        const [dup] = await tx.select({ id: dtcDocumentos.id }).from(dtcDocumentos).where(and(eq(dtcDocumentos.empresaId, ctx.empresaId), eq(dtcDocumentos.codigo, data.codigo)));
        if (dup && dup.id !== existing?.id) throw conflict(`Ya existe un documento con el código ${data.codigo}`);
      }
      return data;
    },
  });

  /** Ficha completa: versiones, vínculos, distribución y mi lectura. */
  app.get('/documentos/:id/ficha', async (req) => {
    const ctx = req.ctx;
    const d = await cargarDoc(ctx, (req.params as { id: string }).id);
    const gestiona = puedeGestionar(ctx);
    const versiones = await db
      .select({
        id: dtcVersiones.id,
        numero: dtcVersiones.numero,
        estado: dtcVersiones.estado,
        resumenCambios: dtcVersiones.resumenCambios,
        archivoId: dtcVersiones.archivoId,
        nombreArchivo: archivos.nombre,
        tamano: archivos.tamano,
        mime: archivos.mime,
        autorId: dtcVersiones.autorId,
        autor: sql<string | null>`(SELECT trim(p.nombre || ' ' || coalesce(p.apellidos, '')) FROM personas p WHERE p.id = ${dtcVersiones.autorId})`,
        aprobador: sql<string | null>`(SELECT trim(p.nombre || ' ' || coalesce(p.apellidos, '')) FROM personas p WHERE p.id = ${dtcVersiones.aprobadoPor})`,
        aprobadoEn: dtcVersiones.aprobadoEn,
        enviadoEn: dtcVersiones.enviadoEn,
        rechazoMotivo: dtcVersiones.rechazoMotivo,
        creadoEn: dtcVersiones.creadoEn,
      })
      .from(dtcVersiones)
      .innerJoin(archivos, eq(archivos.id, dtcVersiones.archivoId))
      .where(eq(dtcVersiones.documentoId, d.id))
      .orderBy(desc(dtcVersiones.creadoEn));
    // quien no gestiona solo ve las versiones publicadas (vigente y obsoletas)
    const visibles = gestiona ? versiones : versiones.filter((v) => ['aprobada', 'obsoleta'].includes(v.estado));
    const vinculos = await db.select({ id: dtcVinculos.id, entidad: dtcVinculos.entidad, entidadId: dtcVinculos.entidadId }).from(dtcVinculos).where(eq(dtcVinculos.documentoId, d.id));
    const distribucion = await db.select({ id: departamentos.id, nombre: departamentos.nombre }).from(dtcDistribucion).innerJoin(departamentos, eq(departamentos.id, dtcDistribucion.departamentoId)).where(eq(dtcDistribucion.documentoId, d.id)).orderBy(asc(departamentos.nombre));
    const [mia] = d.versionVigenteId && ctx.personaId ? await db.select({ leidoEn: dtcLecturas.leidoEn }).from(dtcLecturas).where(and(eq(dtcLecturas.versionId, d.versionVigenteId), eq(dtcLecturas.personaId, ctx.personaId))) : [];
    const [resp] = d.responsableId ? await db.select({ nombre }).from(personas).where(eq(personas.id, d.responsableId)) : [];
    const [rev] = d.revisorId ? await db.select({ nombre }).from(personas).where(eq(personas.id, d.revisorId)) : [];
    const debeLeer = !!ctx.departamentoId && distribucion.some((x) => x.id === ctx.departamentoId);
    return {
      ...d,
      responsable: resp?.nombre ?? null,
      revisor: rev?.nombre ?? null,
      versiones: visibles.map(({ archivoId, ...v }) => ({ ...v, url: fileUrl(archivoId), descarga: `${fileUrl(archivoId)}&descargar=1`, esMia: !!v.autorId && v.autorId === ctx.personaId })),
      vinculos: await etiquetasVinculos(ctx, vinculos),
      distribucion,
      lectura: { debeLeer, leidoEn: mia?.leidoEn ?? null },
      permisos: { editar: can(ctx, 'dtc.editar'), aprobar: can(ctx, 'dtc.aprobar'), restringido: can(ctx, 'dtc.restringido') },
    };
  });

  /* Versiones */
  app.post('/documentos/:id/versiones', { preHandler: guard('dtc.editar') }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(z.object({ archivoId: z.string().uuid({ message: 'Sube el archivo de la versión' }), numero: z.string().trim().regex(/^\d+(\.\d+){0,2}$/, 'Usa un número como 1.0 o 2.1').nullish(), mayor: z.boolean().default(false), resumenCambios: z.string().trim().max(2000).nullish(), enviar: z.boolean().default(false) }), req.body);
    const v = await db.transaction(async (tx) => {
      const v = await nuevaVersion(tx, ctx, (req.params as { id: string }).id, body);
      if (body.enviar) await enviarARevision(tx, ctx, v.id);
      return v;
    });
    reply.code(201);
    return v;
  });
  app.post('/versiones/:id/enviar', { preHandler: guard('dtc.editar') }, async (req) => {
    await db.transaction((tx) => enviarARevision(tx, req.ctx, (req.params as { id: string }).id));
    return { ok: true };
  });
  app.post('/versiones/:id/aprobar', { preHandler: guard('dtc.aprobar') }, async (req) => {
    await db.transaction((tx) => aprobarVersion(tx, req.ctx, (req.params as { id: string }).id));
    return { ok: true };
  });
  app.post('/versiones/:id/rechazar', { preHandler: guard('dtc.aprobar') }, async (req) => {
    const body = parse(z.object({ motivo: z.string().trim().max(2000).nullish() }), req.body ?? {});
    await db.transaction((tx) => rechazarVersion(tx, req.ctx, (req.params as { id: string }).id, body.motivo ?? null));
    return { ok: true };
  });
  app.delete('/versiones/:id', { preHandler: guard('dtc.editar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const [v] = await tx.select().from(dtcVersiones).where(eq(dtcVersiones.id, id)).for('update');
      if (!v) throw notFound();
      await cargarDoc(ctx, v.documentoId, tx);
      if (!['borrador', 'rechazada'].includes(v.estado)) throw conflict('Solo se pueden borrar versiones en borrador o rechazadas: las publicadas se conservan en el historial');
      await tx.delete(dtcVersiones).where(eq(dtcVersiones.id, id));
      await audit(tx, ctx, 'borrar_version', 'dtc_documento', v.documentoId, { version: v.numero });
    });
    return { ok: true };
  });

  /* Estado del documento */
  app.post('/documentos/:id/obsoleto', { preHandler: guard('dtc.editar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(z.object({ motivo: z.string().trim().max(1000).nullish() }), req.body ?? {});
    const d = await cargarDoc(ctx, (req.params as { id: string }).id);
    if (d.estado === 'obsoleto') return { ok: true };
    await db.transaction(async (tx) => {
      await tx.update(dtcDocumentos).set({ estado: 'obsoleto', proximaRevision: null }).where(eq(dtcDocumentos.id, d.id));
      await audit(tx, ctx, 'obsoleto', 'dtc_documento', d.id, { motivo: body.motivo ?? null });
    });
    return { ok: true };
  });
  app.post('/documentos/:id/reactivar', { preHandler: guard('dtc.editar') }, async (req) => {
    const ctx = req.ctx;
    const d = await cargarDoc(ctx, (req.params as { id: string }).id);
    if (d.estado !== 'obsoleto') return { ok: true };
    await db.transaction(async (tx) => {
      await tx.update(dtcDocumentos).set({ estado: d.versionVigenteId ? 'aprobado' : 'borrador', proximaRevision: d.versionVigenteId ? sumarMeses(hoyMadrid(), d.revisionMeses) : null }).where(eq(dtcDocumentos.id, d.id));
      await audit(tx, ctx, 'reactivar', 'dtc_documento', d.id);
    });
    return { ok: true };
  });
  /** Revisión periódica sin cambios: sigue vigente hasta la próxima revisión. */
  app.post('/documentos/:id/confirmar-vigencia', { preHandler: guard(['dtc.editar', 'dtc.aprobar']) }, async (req) => {
    const ctx = req.ctx;
    const d = await cargarDoc(ctx, (req.params as { id: string }).id);
    if (!d.versionVigenteId) throw conflict('El documento no tiene versión vigente');
    const proxima = sumarMeses(hoyMadrid(), d.revisionMeses);
    await db.transaction(async (tx) => {
      await tx.update(dtcDocumentos).set({ proximaRevision: proxima, avisoRevisionEn: null }).where(eq(dtcDocumentos.id, d.id));
      await audit(tx, ctx, 'confirmar_vigencia', 'dtc_documento', d.id, { version: d.versionVigente, proximaRevision: proxima });
    });
    return { ok: true, proximaRevision: proxima };
  });

  /* Lecturas */
  app.post('/documentos/:id/leido', { preHandler: guard('dtc.ver') }, async (req) => db.transaction((tx) => marcarLeido(tx, req.ctx, (req.params as { id: string }).id)));
  app.get('/documentos/:id/lecturas', { preHandler: guard('dtc.ver') }, async (req) => {
    const ctx = req.ctx;
    const d = await cargarDoc(ctx, (req.params as { id: string }).id);
    if (!puedeGestionar(ctx) && d.responsableId !== ctx.personaId) throw forbidden('Solo los responsables de la documentación ven el informe de lecturas');
    return informeLecturas(ctx, d.id);
  });
  app.get('/pendientes-leer', { preHandler: guard('dtc.ver') }, async (req) => pendientesDeLeer(req.ctx));
  app.get('/pendientes-leer/contador', async (req) => ({ n: (await pendientesDeLeer(req.ctx, 99)).length }));

  /* Distribución */
  app.put('/documentos/:id/distribucion', { preHandler: guard('dtc.editar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(z.object({ departamentoIds: z.array(z.string().uuid()).max(100) }), req.body);
    const d = await cargarDoc(ctx, (req.params as { id: string }).id);
    if (body.departamentoIds.length) {
      const ok = await db.select({ id: departamentos.id }).from(departamentos).where(and(eq(departamentos.empresaId, ctx.empresaId), sql`${departamentos.id} IN (${sql.join(body.departamentoIds.map((x) => sql`${x}`), sql`, `)})`));
      if (ok.length !== new Set(body.departamentoIds).size) throw badRequest('Departamento no válido');
    }
    await db.transaction(async (tx) => {
      await tx.delete(dtcDistribucion).where(eq(dtcDistribucion.documentoId, d.id));
      if (body.departamentoIds.length) await tx.insert(dtcDistribucion).values([...new Set(body.departamentoIds)].map((departamentoId) => ({ documentoId: d.id, departamentoId })));
      await audit(tx, ctx, 'distribucion', 'dtc_documento', d.id, { departamentoIds: body.departamentoIds });
    });
    return { ok: true };
  });

  /* Vínculos */
  app.post('/documentos/:id/vinculos', { preHandler: guard('dtc.editar') }, async (req, reply) => {
    const ctx = req.ctx;
    const body = parse(z.object({ entidad: z.enum(VINCULOS), entidadId: z.string().uuid() }), req.body);
    const d = await cargarDoc(ctx, (req.params as { id: string }).id);
    const target = DTC_VINCULO_REF[body.entidad as dtcShared.DtcVinculo];
    const found = await searchRefs(ctx, target, '', [body.entidadId], {});
    if (!found.length) throw badRequest('No se encuentra ese registro (o su módulo no está activo)');
    const row = await db.transaction(async (tx) => {
      const [v] = await tx.insert(dtcVinculos).values({ empresaId: ctx.empresaId, documentoId: d.id, entidad: body.entidad, entidadId: body.entidadId }).onConflictDoNothing().returning();
      await audit(tx, ctx, 'vincular', 'dtc_documento', d.id, { entidad: body.entidad, entidadId: body.entidadId });
      return v ?? null;
    });
    reply.code(201);
    return { ok: true, id: row?.id ?? null, label: found[0]!.label };
  });
  app.delete('/vinculos/:id', { preHandler: guard('dtc.editar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [v] = await db.select().from(dtcVinculos).where(and(eq(dtcVinculos.id, id), eq(dtcVinculos.empresaId, ctx.empresaId)));
    if (!v) throw notFound();
    await cargarDoc(ctx, v.documentoId);
    await db.transaction(async (tx) => {
      await tx.delete(dtcVinculos).where(eq(dtcVinculos.id, id));
      await audit(tx, ctx, 'desvincular', 'dtc_documento', v.documentoId, { entidad: v.entidad, entidadId: v.entidadId });
    });
    return { ok: true };
  });

  /** Documentos de un artículo, equipo, activo, proyecto o tercero (p. ej. "Manuales de este equipo"). */
  app.get('/vinculados', { preHandler: guard('dtc.ver') }, async (req) => {
    const q = req.query as { entidad?: string; id?: string; articuloId?: string };
    if (!q.entidad || !q.id || !VINCULOS.includes(q.entidad)) throw badRequest('Indica la entidad');
    const refs = [{ entidad: q.entidad, id: q.id }];
    if (q.articuloId && q.entidad !== 'articulo') refs.push({ entidad: 'articulo', id: q.articuloId });
    return documentosVinculados(req.ctx, refs);
  });
}
