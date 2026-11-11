import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { crmShared, fmtDate, type TimelineEntry } from '@kite/shared';
import { db } from '../../db/client';
import { personas, terceros } from '../../db/schema/core';
import { registerCrud } from '../../core/crud';
import { forbidden } from '../../core/errors';
import { defineModule } from '../../core/modules';
import { canOnOwner, scopeCondition } from '../../core/permissions';
import { crmActividades } from './schema';

const nombre = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

export default defineModule({
  code: 'crm',
  routes: async (app) => {
    registerCrud(app, {
      path: '/actividades',
      resource: crmShared.actividadResource,
      table: crmActividades,
      entity: 'crm_actividad',
      perms: { ver: 'crm.ver', crear: 'crm.editar' },
      scopeCol: crmActividades.personaId,
      ownerOnCreate: 'personaId',
      beforeSave: async (tx, ctx, data) => {
        if (data.terceroId) {
          const [t] = await tx.select({ c: terceros.comercialId, e: terceros.empresaId }).from(terceros).where(eq(terceros.id, data.terceroId));
          if (!t || t.e !== ctx.empresaId || !(await canOnOwner(ctx, 'terceros.ver', t.c))) throw forbidden('Ese cliente no está en tu cartera');
        }
        if (data.fecha) data.fecha = new Date(data.fecha);
        return data;
      },
    });

    /** Agenda: próximas acciones del usuario (o de su equipo). */
    app.get('/agenda', async (req) => {
      const ctx = req.ctx;
      const s = ctx.perms.get('crm.ver');
      if (!s) throw forbidden();
      const scope = await scopeCondition(ctx, s, crmActividades.personaId);
      const hasta = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
      return db
        .select({ id: crmActividades.id, asunto: crmActividades.asunto, proximaAccion: crmActividades.proximaAccion, proximaFecha: crmActividades.proximaFecha, tipo: crmActividades.tipo, terceroId: crmActividades.terceroId, tercero: terceros.nombre, responsable: nombre })
        .from(crmActividades)
        .innerJoin(terceros, eq(terceros.id, crmActividades.terceroId))
        .leftJoin(personas, eq(personas.id, crmActividades.personaId))
        .where(and(eq(crmActividades.empresaId, ctx.empresaId), isNull(crmActividades.archivadoEn), sql`${crmActividades.proximaFecha} IS NOT NULL`, lte(crmActividades.proximaFecha, hasta), scope))
        .orderBy(asc(crmActividades.proximaFecha))
        .limit(100);
    });

    /** Clientes de la cartera sin ninguna actividad en los últimos N días. */
    app.get('/sin-contacto', async (req) => {
      const ctx = req.ctx;
      const s = ctx.perms.get('terceros.ver');
      if (!s || !ctx.perms.get('crm.ver')) throw forbidden();
      const dias = Math.min(365, Number((req.query as { dias?: string }).dias) || 90);
      const desde = new Date(Date.now() - dias * 86400_000);
      const scope = await scopeCondition(ctx, s, terceros.comercialId);
      return db
        .select({ id: terceros.id, nombre: terceros.nombre, localidad: terceros.localidad, ultima: sql<string | null>`(SELECT max(a.fecha) FROM crm_actividades a WHERE a.tercero_id = ${terceros.id})` })
        .from(terceros)
        .where(
          and(
            eq(terceros.empresaId, ctx.empresaId),
            eq(terceros.esCliente, true),
            isNull(terceros.archivadoEn),
            scope,
            sql`NOT EXISTS (SELECT 1 FROM crm_actividades a WHERE a.tercero_id = ${terceros.id} AND a.fecha >= ${desde.toISOString()}::timestamptz)`,
          ),
        )
        .orderBy(asc(terceros.nombre))
        .limit(100);
    });
  },

  timeline: async (_db, ctx, entidad, id) => {
    if (entidad !== 'tercero' || !ctx.perms.get('crm.ver')) return [];
    const rows = await db
      .select({ a: crmActividades, autor: nombre })
      .from(crmActividades)
      .leftJoin(personas, eq(personas.id, crmActividades.personaId))
      .where(and(eq(crmActividades.terceroId, id), isNull(crmActividades.archivadoEn)))
      .orderBy(desc(crmActividades.fecha))
      .limit(80);
    const icon: Record<string, string> = { llamada: 'Phone', email: 'Mail', visita: 'MapPin', reunion: 'Users', nota: 'MessageSquare' };
    return rows.map(
      (r): TimelineEntry => ({
        id: r.a.id,
        modulo: 'crm',
        tipo: r.a.tipo,
        icono: icon[r.a.tipo] ?? 'MessageSquare',
        titulo: `${crmShared.ACTIVIDAD_TIPOS.find((t) => t.value === r.a.tipo)?.label ?? r.a.tipo}: ${r.a.asunto}`,
        detalle: [r.a.descripcion?.slice(0, 160), r.a.proximaAccion ? `Próxima acción: ${r.a.proximaAccion}${r.a.proximaFecha ? ` (${fmtDate(r.a.proximaFecha)})` : ''}` : null].filter(Boolean).join(' · ') || null,
        fecha: r.a.fecha.toISOString(),
        autor: r.autor,
        tone: 'violet',
      }),
    );
  },

  dashboard: async (_db, ctx) => {
    const s = ctx.perms.get('crm.ver');
    if (!s) return [];
    const scope = await scopeCondition(ctx, s, crmActividades.personaId);
    const hoy = new Date().toISOString().slice(0, 10);
    const proximas = await db
      .select({ id: crmActividades.id, accion: crmActividades.proximaAccion, asunto: crmActividades.asunto, fecha: crmActividades.proximaFecha, tercero: terceros.nombre, terceroId: terceros.id })
      .from(crmActividades)
      .innerJoin(terceros, eq(terceros.id, crmActividades.terceroId))
      .where(and(eq(crmActividades.empresaId, ctx.empresaId), isNull(crmActividades.archivadoEn), sql`${crmActividades.proximaFecha} IS NOT NULL`, lte(crmActividades.proximaFecha, new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)), gte(crmActividades.proximaFecha, new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)), scope))
      .orderBy(asc(crmActividades.proximaFecha))
      .limit(6);
    return [
      {
        id: 'crm.agenda',
        modulo: 'crm',
        titulo: 'Próximas acciones comerciales',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'No tienes acciones pendientes esta semana',
          enlace: '/crm/actividades',
          items: proximas.map((p) => ({ titulo: p.accion ?? p.asunto, subtitulo: p.tercero, valor: p.fecha! < hoy ? 'Atrasada' : fmtDate(p.fecha), tone: p.fecha! < hoy ? 'red' : 'gray', enlace: `/terceros/${p.terceroId}?tab=crm-actividad` })),
        },
      },
    ];
  },

  search: async (_db, ctx, q) => {
    const s = ctx.perms.get('crm.ver');
    if (!s) return [];
    const scope = await scopeCondition(ctx, s, crmActividades.personaId);
    const rows = await db
      .select({ id: crmActividades.id, asunto: crmActividades.asunto, tercero: terceros.nombre, terceroId: terceros.id })
      .from(crmActividades)
      .innerJoin(terceros, eq(terceros.id, crmActividades.terceroId))
      .where(and(eq(crmActividades.empresaId, ctx.empresaId), sql`${crmActividades.asunto} ILIKE ${'%' + q + '%'}`, scope))
      .limit(5);
    return rows.map((r) => ({ id: r.id, modulo: 'crm', tipo: 'Actividad', titulo: r.asunto, subtitulo: r.tercero, enlace: `/terceros/${r.terceroId}?tab=crm-actividad`, icono: 'MessageSquare' }));
  },

  seed: async (tx, s) => {
    const d = (dias: number, h = 10) => {
      const x = new Date();
      x.setDate(x.getDate() + dias);
      x.setHours(h, 0, 0, 0);
      return x;
    };
    const iso = (dias: number) => d(dias).toISOString().slice(0, 10);
    const rows = [
      { tipo: 'visita', asunto: 'Revisión de la instalación de climatización', t: 'hotel', p: 'comercial1', f: -20, prox: 'Enviar presupuesto de renovación de la recepción', pf: -2 },
      { tipo: 'llamada', asunto: 'Interés en aerotermia para el agua caliente', t: 'clinica', p: 'comercial2', f: -9, prox: 'Llamar para concretar visita técnica', pf: 2 },
      { tipo: 'email', asunto: 'Envío de catálogo de equipos', t: 'colegio', p: 'comercial1', f: -6, prox: 'Seguimiento del catálogo', pf: 5 },
      { tipo: 'reunion', asunto: 'Reunión anual del contrato de mantenimiento', t: 'super', p: 'comercial2', f: -3, prox: 'Preparar propuesta de ampliación a 3 tiendas', pf: 7 },
      { tipo: 'llamada', asunto: 'Consulta por avería en cámara frigorífica', t: 'restaurante', p: 'comercial2', f: -1, prox: null, pf: null },
      { tipo: 'visita', asunto: 'Visita a obra del nuevo espacio', t: 'oficinas', p: 'comercial1', f: -12, prox: 'Medir la planta segunda', pf: 1 },
      { tipo: 'nota', asunto: 'Licitación pública de mantenimiento de edificios municipales', t: 'ayto', p: 'comercial1', f: -15, prox: 'Revisar pliegos antes del plazo', pf: 10 },
      { tipo: 'llamada', asunto: 'Primer contacto: aire acondicionado para vivienda', t: 'particular', p: 'comercial2', f: -2, prox: 'Enviar presupuesto', pf: 0 },
    ];
    await tx.insert(crmActividades).values(
      rows.map((r) => ({
        empresaId: s.empresaId,
        tipo: r.tipo,
        asunto: r.asunto,
        terceroId: s.terceros[r.t]!,
        fecha: d(r.f),
        duracionMin: r.tipo === 'llamada' ? 15 : r.tipo === 'nota' ? null : 60,
        estado: 'realizada',
        proximaAccion: r.prox,
        proximaFecha: r.pf === null ? null : iso(r.pf),
        personaId: s.personas[r.p]!,
      })),
    );
  },
});
