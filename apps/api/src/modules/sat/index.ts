import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { fmtNumber, optionLabel, satShared, type DashboardWidget, type SearchResult, type TimelineEntry } from '@kite/shared';
import { db } from '../../db/client';
import { personas, terceros } from '../../db/schema/core';
import { defineModule } from '../../core/modules';
import { can, canOnOwner, scopeCondition } from '../../core/permissions';
import type { Ctx } from '../../core/context';
import { satChecklists, satContratos, satEquipos, satOrdenes, satTickets } from './schema';
import { diaMadrid, generarPreventivos, madridDay, marcarSlaIncumplidos, nombrePersona, puedeVerTicket, slaInfo } from './service';
import { satRoutes, tecnicoSql } from './routes';
import { seedSat } from './seed';

const { TICKET_ESTADOS, ORDEN_ESTADOS, ORDEN_TIPOS, PRIORIDADES, TICKET_ABIERTOS } = satShared;

async function ordenVisible(ctx: Ctx, id: string) {
  const [o] = await db.select({ e: satOrdenes.empresaId, t: satOrdenes.tecnicoId }).from(satOrdenes).where(eq(satOrdenes.id, id));
  return !!o && o.e === ctx.empresaId && (await canOnOwner(ctx, 'sat.ver', o.t));
}

export default defineModule({
  code: 'sat',
  routes: satRoutes,

  refTargets: {
    sat_equipos: {
      table: satEquipos,
      id: satEquipos.id,
      label: sql<string>`${satEquipos.nombre} || coalesce(' · ' || ${satEquipos.numeroSerie}, '')`,
      sub: sql<string>`(SELECT t.nombre FROM terceros t WHERE t.id = ${satEquipos.terceroId}) || coalesce(' · ' || ${satEquipos.ubicacion}, '')`,
      search: [satEquipos.nombre, satEquipos.numeroSerie, satEquipos.modelo, satEquipos.ubicacion],
      empresaCol: satEquipos.empresaId,
      archivedCol: satEquipos.archivadoEn,
      perm: ['sat.ver', 'dtc.editar'],
      filterCols: { terceroId: satEquipos.terceroId, contratoId: satEquipos.contratoId },
    },
    sat_contratos: {
      table: satContratos,
      id: satContratos.id,
      label: sql<string>`${satContratos.codigo} || ' · ' || ${satContratos.nombre}`,
      sub: sql<string>`(SELECT t.nombre FROM terceros t WHERE t.id = ${satContratos.terceroId})`,
      search: [satContratos.codigo, satContratos.nombre],
      empresaCol: satContratos.empresaId,
      archivedCol: satContratos.archivadoEn,
      perm: 'sat.ver',
      filterCols: { terceroId: satContratos.terceroId },
    },
    sat_tickets: {
      table: satTickets,
      id: satTickets.id,
      label: sql<string>`${satTickets.codigo} || ' · ' || ${satTickets.asunto}`,
      sub: sql<string>`(SELECT t.nombre FROM terceros t WHERE t.id = ${satTickets.terceroId})`,
      search: [satTickets.codigo, satTickets.asunto],
      empresaCol: satTickets.empresaId,
      archivedCol: satTickets.archivadoEn,
      perm: 'sat.ver',
      scopeCol: satTickets.responsableId,
      filterCols: { terceroId: satTickets.terceroId },
      order: desc(satTickets.creadoEn) as any,
    },
    sat_checklists: {
      table: satChecklists,
      id: satChecklists.id,
      label: sql<string>`${satChecklists.nombre}`,
      search: [satChecklists.nombre],
      empresaCol: satChecklists.empresaId,
      archivedCol: satChecklists.archivadoEn,
      perm: 'sat.ver',
      where: () => eq(satChecklists.activo, true),
    },
    sat_tecnicos: {
      table: personas,
      id: personas.id,
      label: nombrePersona,
      sub: sql<string>`${personas.puesto}`,
      search: [personas.nombre, personas.apellidos],
      empresaCol: personas.empresaId,
      archivedCol: personas.archivadoEn,
      perm: 'sat.ver',
      where: () => and(eq(personas.activo, true), tecnicoSql),
      order: nombrePersona,
    },
  },

  entities: {
    sat_ticket: {
      label: 'Ticket',
      module: 'sat',
      canView: async (ctx, id) => {
        const [t] = await db.select({ empresaId: satTickets.empresaId, id: satTickets.id, responsableId: satTickets.responsableId }).from(satTickets).where(eq(satTickets.id, id));
        return !!t && puedeVerTicket(ctx, t);
      },
      canEdit: async (ctx, id) => {
        const [t] = await db.select({ empresaId: satTickets.empresaId, id: satTickets.id, responsableId: satTickets.responsableId }).from(satTickets).where(eq(satTickets.id, id));
        return !!t && (await puedeVerTicket(ctx, t)) && can(ctx, 'sat.editar');
      },
      title: async (id) => (await db.select({ c: satTickets.codigo, a: satTickets.asunto }).from(satTickets).where(eq(satTickets.id, id))).map((r) => `${r.c} · ${r.a}`)[0] ?? null,
      url: (id) => `/sat/tickets/${id}`,
      watchers: async (id) => (await db.select({ r: satTickets.responsableId }).from(satTickets).where(eq(satTickets.id, id))).map((r) => r.r).filter(Boolean) as string[],
    },
    sat_orden: {
      label: 'Orden de trabajo',
      module: 'sat',
      canView: ordenVisible,
      canEdit: async (ctx, id) => {
        const [o] = await db.select({ e: satOrdenes.empresaId, t: satOrdenes.tecnicoId }).from(satOrdenes).where(eq(satOrdenes.id, id));
        return !!o && o.e === ctx.empresaId && (await canOnOwner(ctx, 'sat.editar', o.t));
      },
      title: async (id) => (await db.select({ c: satOrdenes.codigo }).from(satOrdenes).where(eq(satOrdenes.id, id)))[0]?.c ?? null,
      url: (id) => `/sat/ordenes/${id}`,
      watchers: async (id) => (await db.select({ t: satOrdenes.tecnicoId }).from(satOrdenes).where(eq(satOrdenes.id, id))).map((r) => r.t).filter(Boolean) as string[],
    },
    sat_equipo: {
      label: 'Equipo instalado',
      module: 'sat',
      canView: async (ctx, id) => {
        const [e] = await db.select({ e: satEquipos.empresaId }).from(satEquipos).where(eq(satEquipos.id, id));
        return !!e && e.e === ctx.empresaId && can(ctx, 'sat.ver');
      },
      canEdit: async (ctx, id) => {
        const [e] = await db.select({ e: satEquipos.empresaId }).from(satEquipos).where(eq(satEquipos.id, id));
        return !!e && e.e === ctx.empresaId && (can(ctx, 'sat.contratos') || can(ctx, 'sat.editar'));
      },
      title: async (id) => (await db.select({ n: satEquipos.nombre }).from(satEquipos).where(eq(satEquipos.id, id)))[0]?.n ?? null,
      url: (id) => `/sat/equipos/${id}`,
    },
    sat_contrato: {
      label: 'Contrato de mantenimiento',
      module: 'sat',
      canView: async (ctx, id) => {
        const [c] = await db.select({ e: satContratos.empresaId }).from(satContratos).where(eq(satContratos.id, id));
        return !!c && c.e === ctx.empresaId && (can(ctx, 'sat.contratos') || can(ctx, 'sat.planificar'));
      },
      canEdit: async (ctx) => can(ctx, 'sat.contratos'),
      title: async (id) => (await db.select({ c: satContratos.codigo, n: satContratos.nombre }).from(satContratos).where(eq(satContratos.id, id))).map((r) => `${r.c} · ${r.n}`)[0] ?? null,
      url: (id) => `/sat/contratos/${id}`,
    },
  },

  /** Tickets y órdenes en la línea de tiempo del cliente, y las intervenciones de un equipo. Solo con sat.ver. */
  timeline: async (dbx, ctx, entidad, id) => {
    if (!can(ctx, 'sat.ver')) return [];
    const sv = ctx.perms.get('sat.ver')!;
    const out: TimelineEntry[] = [];
    if (entidad === 'tercero' || entidad === 'sat_equipo') {
      const col = entidad === 'tercero' ? satTickets.terceroId : satTickets.equipoId;
      const tks = await dbx
        .select()
        .from(satTickets)
        .where(and(eq(col, id), eq(satTickets.empresaId, ctx.empresaId), isNull(satTickets.archivadoEn), await scopeCondition(ctx, sv, satTickets.responsableId)))
        .orderBy(desc(satTickets.creadoEn))
        .limit(40);
      for (const t of tks) {
        const est = optionLabel(TICKET_ESTADOS, t.estado);
        out.push({ id: `tk-${t.id}`, modulo: 'sat', tipo: 'ticket', icono: 'LifeBuoy', titulo: `Ticket ${t.codigo} · ${t.asunto}`, detalle: [est?.label, optionLabel(PRIORIDADES, t.prioridad)?.label, t.valoracion ? `Valoración ${t.valoracion}/5` : null].filter(Boolean).join(' · '), fecha: t.creadoEn.toISOString(), enlace: `/sat/tickets/${t.id}`, tone: est?.tone });
      }
      const ocol = entidad === 'tercero' ? satOrdenes.terceroId : satOrdenes.equipoId;
      const ords = await dbx
        .select({ o: satOrdenes, tecnico: nombrePersona })
        .from(satOrdenes)
        .leftJoin(personas, eq(personas.id, satOrdenes.tecnicoId))
        .where(and(eq(ocol, id), eq(satOrdenes.empresaId, ctx.empresaId), isNull(satOrdenes.archivadoEn), await scopeCondition(ctx, sv, satOrdenes.tecnicoId)))
        .orderBy(desc(satOrdenes.creadoEn))
        .limit(40);
      for (const { o, tecnico } of ords) {
        const est = optionLabel(ORDEN_ESTADOS, o.estado);
        out.push({
          id: `ot-${o.id}`,
          modulo: 'sat',
          tipo: 'orden',
          icono: 'Wrench',
          titulo: `Orden ${o.codigo} · ${optionLabel(ORDEN_TIPOS, o.tipo)?.label ?? o.tipo}`,
          detalle: [est?.label, tecnico, o.trabajoRealizado?.slice(0, 120)].filter(Boolean).join(' · '),
          fecha: (o.finalizadaEn ?? o.planificadaInicio ?? o.creadoEn).toISOString(),
          enlace: `/sat/ordenes/${o.id}`,
          tone: est?.tone,
        });
      }
    }
    return out;
  },

  search: async (dbx, ctx, q) => {
    if (!can(ctx, 'sat.ver')) return [];
    const sv = ctx.perms.get('sat.ver')!;
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const out: SearchResult[] = [];
    const tks = await dbx
      .select({ id: satTickets.id, codigo: satTickets.codigo, asunto: satTickets.asunto, estado: satTickets.estado, cliente: terceros.nombre })
      .from(satTickets)
      .innerJoin(terceros, eq(terceros.id, satTickets.terceroId))
      .where(and(eq(satTickets.empresaId, ctx.empresaId), isNull(satTickets.archivadoEn), or(ilike(satTickets.codigo, like), ilike(satTickets.asunto, like)), await scopeCondition(ctx, sv, satTickets.responsableId)))
      .orderBy(desc(satTickets.creadoEn))
      .limit(6);
    out.push(...tks.map((t) => ({ id: t.id, modulo: 'sat', tipo: 'Ticket', titulo: `${t.codigo} · ${t.asunto}`, subtitulo: `${t.cliente} · ${optionLabel(TICKET_ESTADOS, t.estado)?.label ?? t.estado}`, enlace: `/sat/tickets/${t.id}`, icono: 'LifeBuoy' })));
    const ords = await dbx
      .select({ id: satOrdenes.id, codigo: satOrdenes.codigo, descripcion: satOrdenes.descripcion, estado: satOrdenes.estado, cliente: terceros.nombre })
      .from(satOrdenes)
      .innerJoin(terceros, eq(terceros.id, satOrdenes.terceroId))
      .where(and(eq(satOrdenes.empresaId, ctx.empresaId), isNull(satOrdenes.archivadoEn), or(ilike(satOrdenes.codigo, like), ilike(satOrdenes.descripcion, like)), await scopeCondition(ctx, sv, satOrdenes.tecnicoId)))
      .orderBy(desc(satOrdenes.creadoEn))
      .limit(6);
    out.push(...ords.map((o) => ({ id: o.id, modulo: 'sat', tipo: 'Orden de trabajo', titulo: `${o.codigo}${o.descripcion ? ' · ' + o.descripcion.slice(0, 60) : ''}`, subtitulo: `${o.cliente} · ${optionLabel(ORDEN_ESTADOS, o.estado)?.label ?? o.estado}`, enlace: `/sat/ordenes/${o.id}`, icono: 'Wrench' })));
    const eqs = await dbx
      .select({ id: satEquipos.id, nombre: satEquipos.nombre, serie: satEquipos.numeroSerie, cliente: terceros.nombre })
      .from(satEquipos)
      .innerJoin(terceros, eq(terceros.id, satEquipos.terceroId))
      .where(and(eq(satEquipos.empresaId, ctx.empresaId), isNull(satEquipos.archivadoEn), or(ilike(satEquipos.numeroSerie, like), ilike(satEquipos.nombre, like))))
      .limit(4);
    out.push(...eqs.map((e) => ({ id: e.id, modulo: 'sat', tipo: 'Equipo instalado', titulo: e.nombre, subtitulo: [e.cliente, e.serie].filter(Boolean).join(' · '), enlace: `/sat/equipos/${e.id}`, icono: 'Wrench' })));
    return out;
  },

  dashboard: async (dbx, ctx) => {
    if (!can(ctx, 'sat.ver')) return [];
    const sv = ctx.perms.get('sat.ver')!;
    const widgets: DashboardWidget[] = [];
    const tScope = await scopeCondition(ctx, sv, satTickets.responsableId);
    const oScope = await scopeCondition(ctx, sv, satOrdenes.tecnicoId);
    const { inicio, fin } = diaMadrid(madridDay());

    // Órdenes de hoy
    const hoy = await dbx
      .select({ id: satOrdenes.id, codigo: satOrdenes.codigo, estado: satOrdenes.estado, inicio: satOrdenes.planificadaInicio, cliente: terceros.nombre, tecnico: nombrePersona })
      .from(satOrdenes)
      .innerJoin(terceros, eq(terceros.id, satOrdenes.terceroId))
      .leftJoin(personas, eq(personas.id, satOrdenes.tecnicoId))
      .where(and(eq(satOrdenes.empresaId, ctx.empresaId), isNull(satOrdenes.archivadoEn), sql`${satOrdenes.estado} <> 'cancelada'`, or(and(gte(satOrdenes.planificadaInicio, inicio), lt(satOrdenes.planificadaInicio, fin)), inArray(satOrdenes.estado, ['en_ruta', 'en_curso'])), oScope))
      .orderBy(satOrdenes.planificadaInicio)
      .limit(12);
    const propio = sv === 'propio';
    widgets.push({
      id: 'sat.hoy',
      modulo: 'sat',
      titulo: propio ? 'Mis órdenes de hoy' : 'Órdenes de hoy',
      size: 'md',
      data: {
        kind: 'list',
        vacio: 'No hay órdenes para hoy',
        enlace: propio ? '/sat/hoy' : '/sat/planificacion',
        items: hoy.map((o) => ({
          titulo: `${o.inicio ? o.inicio.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) + ' · ' : ''}${o.cliente}`,
          subtitulo: [o.codigo, propio ? null : o.tecnico].filter(Boolean).join(' · '),
          valor: optionLabel(ORDEN_ESTADOS, o.estado)?.label,
          tone: optionLabel(ORDEN_ESTADOS, o.estado)?.tone,
          enlace: `/sat/ordenes/${o.id}`,
        })),
      },
    });

    // Tickets abiertos por prioridad y SLA en riesgo
    const abiertos = await dbx
      .select()
      .from(satTickets)
      .where(and(eq(satTickets.empresaId, ctx.empresaId), isNull(satTickets.archivadoEn), inArray(satTickets.estado, TICKET_ABIERTOS), tScope))
      .limit(1000);
    const porPrioridad = PRIORIDADES.map((p) => ({ prioridad: p.label, tickets: abiertos.filter((t) => t.prioridad === p.value).length }));
    widgets.push({ id: 'sat.abiertos', modulo: 'sat', titulo: 'Tickets abiertos por prioridad', size: 'md', data: { kind: 'chart', chart: 'bar', data: porPrioridad, xKey: 'prioridad', series: [{ key: 'tickets', label: 'Tickets', color: '#7D2CDD' }], format: 'number' } });
    const conSla = abiertos.map((t) => ({ t, s: slaInfo(t) }));
    const riesgo = conSla.filter((x) => x.s.enRiesgo || x.s.incumplido).sort((a, b) => (a.s.restanteMin ?? 0) - (b.s.restanteMin ?? 0));
    widgets.push({
      id: 'sat.sla',
      modulo: 'sat',
      titulo: 'SLA en riesgo',
      size: 'md',
      data: {
        kind: 'list',
        vacio: 'Todos los tickets van en plazo',
        enlace: '/sat/tickets',
        items: riesgo.slice(0, 8).map(({ t, s }) => ({
          titulo: `${t.codigo} · ${t.asunto}`,
          subtitulo: s.objetivo === 'respuesta' ? 'Pendiente de primera respuesta' : 'Pendiente de resolver',
          valor: s.incumplido ? 'Incumplido' : `Quedan ${s.restanteMin! >= 60 ? `${Math.floor(s.restanteMin! / 60)} h` : `${s.restanteMin} min`}`,
          tone: s.incumplido ? 'red' : 'orange',
          enlace: `/sat/tickets/${t.id}`,
        })),
      },
    });

    // Tiempo medio de resolución y valoración media (últimos 90 días)
    const desde = new Date(Date.now() - 90 * 86400_000);
    const [m] = await dbx
      .select({
        horas: sql<number | null>`avg(extract(epoch from (${satTickets.resueltoEn} - ${satTickets.creadoEn})) / 3600)::float`,
        valoracion: sql<number | null>`avg(${satTickets.valoracion})::float`,
        valorados: sql<number>`count(${satTickets.valoracion})::int`,
        resueltos: sql<number>`count(*)::int`,
        enPlazo: sql<number>`count(*) FILTER (WHERE NOT ${satTickets.slaIncumplido})::int`,
      })
      .from(satTickets)
      .where(and(eq(satTickets.empresaId, ctx.empresaId), isNotNull(satTickets.resueltoEn), gte(satTickets.resueltoEn, desde), tScope));
    widgets.push({ id: 'sat.resolucion', modulo: 'sat', titulo: 'Tiempo medio de resolución', size: 'sm', data: { kind: 'stat', value: m?.horas ?? 0, format: 'hours', hint: m?.resueltos ? `${m.resueltos} tickets en 90 días · ${Math.round(((m.enPlazo ?? 0) / m.resueltos) * 100)} % en plazo` : 'Sin tickets resueltos en 90 días' } });
    widgets.push({ id: 'sat.valoracion', modulo: 'sat', titulo: 'Valoración media', size: 'sm', data: { kind: 'stat', value: m?.valoracion ? `${fmtNumber(m.valoracion, 1)} / 5` : '—', hint: m?.valorados ? `${m.valorados} valoraciones en 90 días` : 'Aún sin valoraciones' } });
    return widgets;
  },

  jobs: [
    { id: 'sat.preventivos', dailyAt: '06:00', run: async (empresaId, ctx) => `${await generarPreventivos(empresaId, ctx)} órdenes preventivas generadas` },
    { id: 'sat.sla', every: 15, run: async (empresaId, ctx) => `${await marcarSlaIncumplidos(empresaId, ctx)} tickets fuera de plazo` },
  ],

  seed: seedSat,
});
