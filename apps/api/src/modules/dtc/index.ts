import { and, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { dtcShared, optionLabel, type ApprovalItem, type DashboardWidget, type SearchResult, type TimelineEntry } from '@kite/shared';
import { db } from '../../db/client';
import { defineModule } from '../../core/modules';
import { can } from '../../core/permissions';
import { dtcDocumentos, dtcVersiones, dtcVinculos } from './schema';
import { avisarRevisiones, hoyMadrid, pendientesDeLeer, puedeGestionar, puedeVerDoc, visibilidad } from './service';
import { dtcRoutes } from './routes';
import { seedDtc } from './seed';

const { DTC_TIPOS } = dtcShared;
const NADIE = '00000000-0000-0000-0000-000000000000';

export default defineModule({
  code: 'dtc',
  routes: dtcRoutes,

  refTargets: {
    dtc_documentos: {
      table: dtcDocumentos,
      id: dtcDocumentos.id,
      label: sql<string>`${dtcDocumentos.codigo} || ' · ' || ${dtcDocumentos.titulo}`,
      sub: sql<string>`coalesce('v' || ${dtcDocumentos.versionVigente}, 'Sin versión vigente')`,
      search: [dtcDocumentos.codigo, dtcDocumentos.titulo],
      empresaCol: dtcDocumentos.empresaId,
      archivedCol: dtcDocumentos.archivadoEn,
      perm: 'dtc.ver',
      where: (ctx) => visibilidad(ctx),
      order: dtcDocumentos.codigo,
    },
  },

  entities: {
    dtc_documento: {
      label: 'Documento técnico',
      module: 'dtc',
      canView: async (ctx, id) => {
        const [d] = await db.select().from(dtcDocumentos).where(eq(dtcDocumentos.id, id));
        return !!d && puedeVerDoc(ctx, d);
      },
      canEdit: async (ctx, id) => {
        const [d] = await db.select().from(dtcDocumentos).where(eq(dtcDocumentos.id, id));
        return !!d && puedeVerDoc(ctx, d) && can(ctx, 'dtc.editar');
      },
      title: async (id) => (await db.select({ c: dtcDocumentos.codigo, t: dtcDocumentos.titulo }).from(dtcDocumentos).where(eq(dtcDocumentos.id, id))).map((r) => `${r.c} · ${r.t}`)[0] ?? null,
      url: (id) => `/dtc/documentos/${id}`,
      watchers: async (id) => (await db.select({ r: dtcDocumentos.responsableId }).from(dtcDocumentos).where(eq(dtcDocumentos.id, id))).map((r) => r.r).filter(Boolean) as string[],
    },
  },

  /** Revisiones de versiones pendientes de aprobar (no se aprueban las propias). */
  approvals: async (dbx, ctx) => {
    if (!can(ctx, 'dtc.aprobar')) return [];
    const rows = await dbx
      .select({ v: dtcVersiones, d: dtcDocumentos, autor: sql<string | null>`(SELECT trim(p.nombre || ' ' || coalesce(p.apellidos, '')) FROM personas p WHERE p.id = ${dtcVersiones.autorId})` })
      .from(dtcVersiones)
      .innerJoin(dtcDocumentos, eq(dtcDocumentos.id, dtcVersiones.documentoId))
      .where(
        and(
          eq(dtcDocumentos.empresaId, ctx.empresaId),
          eq(dtcVersiones.estado, 'en_revision'),
          isNull(dtcDocumentos.archivadoEn),
          or(isNull(dtcDocumentos.revisorId), eq(dtcDocumentos.revisorId, ctx.personaId ?? NADIE), ctx.isAdmin ? sql`true` : undefined),
          ctx.isAdmin ? undefined : or(isNull(dtcVersiones.autorId), ne(dtcVersiones.autorId, ctx.personaId ?? NADIE)),
          visibilidad(ctx),
        ),
      )
      .orderBy(dtcVersiones.enviadoEn)
      .limit(50);
    return rows.map(({ v, d, autor }): ApprovalItem => ({
      id: v.id,
      modulo: 'dtc',
      tipo: 'Documentación técnica',
      titulo: `${d.codigo} · ${d.titulo} (v${v.numero})`,
      detalle: [optionLabel(DTC_TIPOS, d.tipo)?.label, v.resumenCambios].filter(Boolean).join(' · '),
      solicitante: autor,
      fecha: (v.enviadoEn ?? v.creadoEn).toISOString(),
      enlace: `/dtc/documentos/${d.id}`,
      aprobarUrl: `/dtc/versiones/${v.id}/aprobar`,
      rechazarUrl: `/dtc/versiones/${v.id}/rechazar`,
    }));
  },

  dashboard: async (dbx, ctx) => {
    if (!can(ctx, 'dtc.ver')) return [];
    const widgets: DashboardWidget[] = [];
    const pend = await pendientesDeLeer(ctx, 6);
    if (pend.length)
      widgets.push({
        id: 'dtc.pendientes',
        modulo: 'dtc',
        titulo: 'Documentación pendiente de leer',
        size: 'md',
        data: { kind: 'list', enlace: '/dtc/pendientes', items: pend.map((p) => ({ titulo: p.titulo, subtitulo: `${p.codigo} · v${p.version}`, valor: optionLabel(DTC_TIPOS, p.tipo)?.label, enlace: `/dtc/documentos/${p.id}` })) },
      });
    if (puedeGestionar(ctx)) {
      const [r] = await dbx
        .select({
          vencidas: sql<number>`count(*) FILTER (WHERE ${dtcDocumentos.proximaRevision} <= ${hoyMadrid()} AND ${dtcDocumentos.estado} IN ('aprobado','en_revision'))::int`,
          revision: sql<number>`count(*) FILTER (WHERE ${dtcDocumentos.estado} = 'en_revision')::int`,
        })
        .from(dtcDocumentos)
        .where(and(eq(dtcDocumentos.empresaId, ctx.empresaId), isNull(dtcDocumentos.archivadoEn), visibilidad(ctx)));
      if ((r?.vencidas ?? 0) + (r?.revision ?? 0) > 0)
        widgets.push({ id: 'dtc.revision', modulo: 'dtc', titulo: 'Documentación por revisar', size: 'sm', data: { kind: 'stat', value: (r?.vencidas ?? 0) + (r?.revision ?? 0), format: 'number', hint: `${r?.revision ?? 0} versiones en revisión · ${r?.vencidas ?? 0} revisiones periódicas vencidas`, enlace: '/dtc/documentos' } });
    }
    return widgets;
  },

  search: async (dbx, ctx, q) => {
    if (!can(ctx, 'dtc.ver')) return [];
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = await dbx
      .select({ id: dtcDocumentos.id, codigo: dtcDocumentos.codigo, titulo: dtcDocumentos.titulo, tipo: dtcDocumentos.tipo, version: dtcDocumentos.versionVigente })
      .from(dtcDocumentos)
      .where(and(eq(dtcDocumentos.empresaId, ctx.empresaId), isNull(dtcDocumentos.archivadoEn), or(ilike(dtcDocumentos.codigo, like), ilike(dtcDocumentos.titulo, like)), visibilidad(ctx)))
      .orderBy(dtcDocumentos.codigo)
      .limit(6);
    return rows.map((r): SearchResult => ({ id: r.id, modulo: 'dtc', tipo: optionLabel(DTC_TIPOS, r.tipo)?.label ?? 'Documento técnico', titulo: `${r.codigo} · ${r.titulo}`, subtitulo: r.version ? `Versión ${r.version}` : 'Sin versión vigente', enlace: `/dtc/documentos/${r.id}`, icono: 'BookOpenCheck' }));
  },

  /** Documentación vinculada en la línea de tiempo de un tercero o equipo. */
  timeline: async (dbx, ctx, entidad, id) => {
    if (!can(ctx, 'dtc.ver') || !['tercero', 'sat_equipo', 'articulo'].includes(entidad)) return [];
    const rows = await dbx
      .select({ d: dtcDocumentos, creado: dtcVinculos.creadoEn })
      .from(dtcVinculos)
      .innerJoin(dtcDocumentos, eq(dtcDocumentos.id, dtcVinculos.documentoId))
      .where(and(eq(dtcVinculos.entidad, entidad), eq(dtcVinculos.entidadId, id), isNull(dtcDocumentos.archivadoEn), eq(dtcDocumentos.empresaId, ctx.empresaId), visibilidad(ctx)))
      .orderBy(desc(dtcVinculos.creadoEn))
      .limit(20);
    return rows.map(({ d, creado }): TimelineEntry => ({ id: `dtc-${d.id}`, modulo: 'dtc', tipo: 'documento_tecnico', icono: 'BookOpenCheck', titulo: `Documentación vinculada: ${d.codigo} · ${d.titulo}`, detalle: d.versionVigente ? `Versión ${d.versionVigente}` : null, fecha: creado.toISOString(), enlace: `/dtc/documentos/${d.id}`, tone: 'violet' }));
  },

  jobs: [{ id: 'dtc.revisiones', dailyAt: '07:00', run: async (empresaId, ctx) => `${await avisarRevisiones(empresaId, ctx)} documentos con la revisión vencida` }],

  seed: seedDtc,
});

