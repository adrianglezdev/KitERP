import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  DOC_ESTADOS,
  DOC_MODULO,
  DOC_TIPOS,
  fmtMoney,
  optionLabel,
  type ApprovalItem,
  type DashboardWidget,
  type DocTipo,
  type SearchResult,
  type TimelineEntry,
} from '@kite/shared';
import { db } from '../db/client';
import { anuncios, articulos, auditoria, documentos, personas, tareas, terceros, usuarios } from '../db/schema';
import { canViewEntity } from '../core/entities';
import { forbidden } from '../core/errors';
import { can, scopeCondition } from '../core/permissions';
import { searchRefs } from '../core/refs';
import { moduleDefs } from '../modules/registry';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.warn('[hub]', (e as Error).message);
    return fallback;
  }
}

export async function hubRoutes(app: FastifyInstance) {
  /* Selectores de referencia */
  app.get('/refs/:target', async (req) => {
    const { target } = req.params as { target: string };
    const q = req.query as Record<string, string>;
    const filter: Record<string, string> = {};
    for (const [k, v] of Object.entries(q)) if (k.startsWith('f.')) filter[k.slice(2)] = v;
    const ids = q.ids ? q.ids.split(',').filter(Boolean) : null;
    return searchRefs(req.ctx, target, q.q ?? '', ids, filter, Math.min(50, Number(q.limit) || 20));
  });

  /* Búsqueda global (Ctrl+K) */
  app.get('/buscar', async (req) => {
    const ctx = req.ctx;
    const q = String((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const out: SearchResult[] = [];
    if (can(ctx, 'terceros.ver')) {
      const scope = await scopeCondition(ctx, ctx.perms.get('terceros.ver')!, terceros.comercialId);
      const rows = await db
        .select({ id: terceros.id, nombre: terceros.nombre, nif: terceros.nif, localidad: terceros.localidad, esProveedor: terceros.esProveedor })
        .from(terceros)
        .where(and(eq(terceros.empresaId, ctx.empresaId), isNull(terceros.archivadoEn), scope, or(ilike(terceros.nombre, like), ilike(terceros.razonSocial, like), ilike(terceros.nif, like), ilike(terceros.email, like))))
        .limit(6);
      out.push(...rows.map((r) => ({ id: r.id, modulo: 'core', tipo: r.esProveedor ? 'Proveedor' : 'Cliente', titulo: r.nombre, subtitulo: [r.nif, r.localidad].filter(Boolean).join(' · '), enlace: `/terceros/${r.id}`, icono: 'Building2' })));
    }
    if (can(ctx, 'personas.ver')) {
      const rows = await db
        .select({ id: personas.id, nombre: sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`, puesto: personas.puesto, email: personas.email })
        .from(personas)
        .where(and(eq(personas.empresaId, ctx.empresaId), isNull(personas.archivadoEn), or(ilike(personas.nombre, like), ilike(personas.apellidos, like), ilike(personas.email, like))))
        .limit(5);
      out.push(...rows.map((r) => ({ id: r.id, modulo: 'core', tipo: 'Persona', titulo: r.nombre, subtitulo: r.puesto ?? r.email, enlace: `/personas/${r.id}`, icono: 'User' })));
    }
    if (can(ctx, 'catalogo.ver')) {
      const rows = await db
        .select({ id: articulos.id, referencia: articulos.referencia, nombre: articulos.nombre })
        .from(articulos)
        .where(and(eq(articulos.empresaId, ctx.empresaId), isNull(articulos.archivadoEn), or(ilike(articulos.referencia, like), ilike(articulos.nombre, like), ilike(articulos.ean, like))))
        .limit(5);
      out.push(...rows.map((r) => ({ id: r.id, modulo: 'core', tipo: 'Artículo', titulo: r.nombre, subtitulo: r.referencia, enlace: `/catalogo/${r.id}`, icono: 'Package' })));
    }
    // Documentos comerciales que el usuario puede ver
    const tiposVisibles = DOC_TIPOS.map((t) => t.value).filter((t) => ctx.modules.has(DOC_MODULO[t]) && can(ctx, `${DOC_MODULO[t]}.ver`));
    if (tiposVisibles.length) {
      const rows = await db
        .select({ id: documentos.id, tipo: documentos.tipo, codigo: documentos.codigo, titulo: documentos.titulo, total: documentos.total, tercero: terceros.nombre, comercialId: documentos.comercialId })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .where(and(eq(documentos.empresaId, ctx.empresaId), inArray(documentos.tipo, tiposVisibles), or(ilike(documentos.codigo, like), ilike(documentos.titulo, like), ilike(documentos.referenciaExterna, like))))
        .orderBy(desc(documentos.fecha))
        .limit(15);
      for (const r of rows) {
        const mod = DOC_MODULO[r.tipo as DocTipo];
        const s = ctx.perms.get(`${mod}.ver`);
        if (s !== 'todo' && r.comercialId !== ctx.personaId && !(await ctx.teamIds()).includes(r.comercialId ?? '')) continue;
        out.push({ id: r.id, modulo: mod, tipo: optionLabel(DOC_TIPOS, r.tipo)?.label ?? r.tipo, titulo: `${r.codigo ?? 'Borrador'}${r.titulo ? ' · ' + r.titulo : ''}`, subtitulo: `${r.tercero} · ${fmtMoney(r.total)}`, enlace: `/documentos/${r.id}`, icono: 'FileText' });
      }
    }
    for (const def of moduleDefs) {
      if (!def.search || !ctx.modules.has(def.code)) continue;
      out.push(...(await safe(def.search(db, ctx, q), [])));
    }
    return out.slice(0, 40);
  });

  /* Línea de tiempo de una ficha */
  app.get('/timeline/:entidad/:id', async (req) => {
    const ctx = req.ctx;
    const { entidad, id } = req.params as { entidad: string; id: string };
    if (!(await canViewEntity(ctx, entidad, id))) throw forbidden();
    const out: TimelineEntry[] = [];
    if (entidad === 'tercero') {
      const tipos = DOC_TIPOS.map((t) => t.value).filter((t) => ctx.modules.has(DOC_MODULO[t]) && can(ctx, `${DOC_MODULO[t]}.ver`));
      if (tipos.length) {
        const docs = await db
          .select()
          .from(documentos)
          .where(and(eq(documentos.terceroId, id), inArray(documentos.tipo, tipos), isNull(documentos.archivadoEn)))
          .orderBy(desc(documentos.fecha))
          .limit(60);
        out.push(
          ...docs.map((d) => {
            const est = optionLabel(DOC_ESTADOS[d.tipo as DocTipo], d.estado);
            return {
              id: d.id,
              modulo: DOC_MODULO[d.tipo as DocTipo],
              tipo: d.tipo,
              icono: d.tipo.includes('factura') ? 'Receipt' : d.tipo === 'presupuesto' ? 'FileSignature' : 'FileText',
              titulo: `${optionLabel(DOC_TIPOS, d.tipo)?.label} ${d.codigo ?? '(borrador)'} · ${fmtMoney(d.total)}`,
              detalle: [est?.label, d.titulo].filter(Boolean).join(' · '),
              fecha: (d.emitidoEn ?? d.creadoEn).toISOString?.() ?? String(d.fecha),
              enlace: `/documentos/${d.id}`,
              tone: est?.tone,
            };
          }),
        );
      }
    }
    // Cambios registrados en la auditoría de la propia ficha
    const audits = await db
      .select({ id: auditoria.id, accion: auditoria.accion, creadoEn: auditoria.creadoEn, usuario: usuarios.email })
      .from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
      .where(and(eq(auditoria.entidad, entidad), eq(auditoria.entidadId, id)))
      .orderBy(desc(auditoria.id))
      .limit(20);
    out.push(...audits.map((a) => ({ id: `a${a.id}`, modulo: 'core', tipo: 'auditoria', icono: 'History', titulo: `Ficha: ${a.accion.replace(/_/g, ' ')}`, autor: a.usuario, fecha: a.creadoEn.toISOString(), tone: 'gray' })));
    for (const def of moduleDefs) {
      if (!def.timeline || !ctx.modules.has(def.code)) continue;
      out.push(...(await safe(def.timeline(db, ctx, entidad, id), [])));
    }
    return out.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 150);
  });

  /* Panel de inicio */
  app.get('/panel', async (req) => {
    const ctx = req.ctx;
    const widgets: DashboardWidget[] = [];
    if (ctx.personaId) {
      const ts = await db
        .select()
        .from(tareas)
        .where(and(eq(tareas.empresaId, ctx.empresaId), eq(tareas.asignadoA, ctx.personaId), inArray(tareas.estado, ['pendiente', 'en_curso'])))
        .orderBy(sql`${tareas.vence} NULLS LAST`)
        .limit(6);
      widgets.push({
        id: 'core.tareas',
        modulo: 'msg',
        titulo: 'Mis tareas',
        size: 'md',
        data: { kind: 'list', vacio: 'No tienes tareas pendientes', enlace: '/tareas', items: ts.map((t) => ({ titulo: t.titulo, subtitulo: t.vence ? `Vence el ${t.vence.split('-').reverse().join('/')}` : undefined, enlace: '/tareas', tone: t.prioridad === 'alta' ? 'red' : undefined })) },
      });
      const sinLeer = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(anuncios)
        .where(
          and(
            eq(anuncios.empresaId, ctx.empresaId),
            isNull(anuncios.archivadoEn),
            sql`NOT EXISTS (SELECT 1 FROM anuncio_lecturas l WHERE l.anuncio_id = ${anuncios.id} AND l.persona_id = ${ctx.personaId})`,
            or(sql`cardinality(${anuncios.departamentos}) = 0`, ctx.departamentoId ? sql`${ctx.departamentoId} = ANY(${anuncios.departamentos})` : sql`false`),
          ),
        );
      if ((sinLeer[0]?.n ?? 0) > 0)
        widgets.push({ id: 'core.anuncios', modulo: 'msg', titulo: 'Avisos sin leer', size: 'sm', data: { kind: 'stat', value: sinLeer[0]!.n, format: 'number', enlace: '/tablon', hint: 'en el tablón' } });
    }
    for (const def of moduleDefs) {
      if (!def.dashboard || !ctx.modules.has(def.code)) continue;
      widgets.push(...(await safe(def.dashboard(db, ctx), [])));
    }
    return widgets;
  });

  /* Bandeja de aprobaciones */
  app.get('/aprobaciones', async (req) => {
    const ctx = req.ctx;
    const out: ApprovalItem[] = [];
    for (const def of moduleDefs) {
      if (!def.approvals || !ctx.modules.has(def.code)) continue;
      out.push(...(await safe(def.approvals(db, ctx), [])));
    }
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  });
}
