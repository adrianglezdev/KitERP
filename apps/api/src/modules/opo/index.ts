import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { fmtMoney, opoShared, type TimelineEntry } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { documentos } from '../../db/schema/documentos';
import { empresas, personas, terceros } from '../../db/schema/core';
import { audit } from '../../core/audit';
import { activeModules } from '../../core/modules';
import { systemCtx, type Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, forbidden, notFound, parse } from '../../core/errors';
import { defineModule } from '../../core/modules';
import { notify } from '../../core/notify';
import { can, canOnOwner, guard, scopeCondition } from '../../core/permissions';
import { crearDocumento } from '../../services/documentos';
import { opoEtapas, opoOportunidades } from './schema';

const ETAPAS_DEFECTO = [
  { nombre: 'Nuevo', orden: 1, probabilidad: 10, tipo: 'abierta', color: '#9C8AAE' },
  { nombre: 'Contactado', orden: 2, probabilidad: 25, tipo: 'abierta', color: '#B28574' },
  { nombre: 'Propuesta enviada', orden: 3, probabilidad: 50, tipo: 'abierta', color: '#7D2CDD' },
  { nombre: 'Negociación', orden: 4, probabilidad: 75, tipo: 'abierta', color: '#5E2A78' },
  { nombre: 'Ganada', orden: 5, probabilidad: 100, tipo: 'ganada', color: '#35AE29' },
  { nombre: 'Perdida', orden: 6, probabilidad: 0, tipo: 'perdida', color: '#CD2D46' },
];

async function asegurarEtapas(tx: Tx | typeof db, empresaId: string) {
  const rows = await tx.select().from(opoEtapas).where(eq(opoEtapas.empresaId, empresaId)).orderBy(asc(opoEtapas.orden));
  if (rows.length) return rows;
  return tx.insert(opoEtapas).values(ETAPAS_DEFECTO.map((e) => ({ ...e, empresaId }))).returning();
}

async function cargar(tx: Tx | typeof db, ctx: Ctx, id: string) {
  const [o] = await tx.select().from(opoOportunidades).where(and(eq(opoOportunidades.id, id), eq(opoOportunidades.empresaId, ctx.empresaId)));
  if (!o || !(await canOnOwner(ctx, 'opo.ver', o.comercialId))) throw notFound('Oportunidad no encontrada');
  return o;
}

/** Mueve una oportunidad de etapa registrando cuándo se gana o se pierde. */
async function moverEtapa(tx: Tx, ctx: Ctx, id: string, etapaId: string, motivo?: { motivoPerdida?: string | null; comentario?: string | null }) {
  const o = await cargar(tx, ctx, id);
  const [e] = await tx.select().from(opoEtapas).where(and(eq(opoEtapas.id, etapaId), eq(opoEtapas.empresaId, ctx.empresaId)));
  if (!e) throw badRequest('Etapa no válida');
  if (e.tipo === 'perdida' && !motivo?.motivoPerdida) throw badRequest('Indica el motivo de la pérdida');
  await tx
    .update(opoOportunidades)
    .set({
      etapaId,
      ganadaEn: e.tipo === 'ganada' ? (o.ganadaEn ?? new Date()) : null,
      perdidaEn: e.tipo === 'perdida' ? new Date() : null,
      motivoPerdida: e.tipo === 'perdida' ? motivo!.motivoPerdida : null,
      comentarioPerdida: e.tipo === 'perdida' ? (motivo?.comentario ?? null) : null,
    })
    .where(eq(opoOportunidades.id, id));
  await audit(tx, ctx, 'mover_etapa', 'oportunidad', id, { de: o.etapaId, a: etapaId, motivo });
}

export default defineModule({
  code: 'opo',
  refTargets: {
    oportunidades: {
      table: opoOportunidades,
      id: opoOportunidades.id,
      label: sql<string>`${opoOportunidades.titulo}`,
      search: [opoOportunidades.titulo],
      empresaCol: opoOportunidades.empresaId,
      archivedCol: opoOportunidades.archivadoEn,
      perm: 'opo.ver',
      scopeCol: opoOportunidades.comercialId,
      filterCols: { terceroId: opoOportunidades.terceroId },
    },
    opo_etapas: {
      table: opoEtapas,
      id: opoEtapas.id,
      label: sql<string>`${opoEtapas.nombre}`,
      search: [opoEtapas.nombre],
      empresaCol: opoEtapas.empresaId,
      order: opoEtapas.orden,
    },
  },
  entities: {
    oportunidad: {
      label: 'Oportunidad',
      module: 'opo',
      canView: async (ctx, id) => {
        const [o] = await db.select({ c: opoOportunidades.comercialId, e: opoOportunidades.empresaId }).from(opoOportunidades).where(eq(opoOportunidades.id, id));
        return !!o && o.e === ctx.empresaId && (await canOnOwner(ctx, 'opo.ver', o.c));
      },
      canEdit: async (ctx, id) => {
        const [o] = await db.select({ c: opoOportunidades.comercialId }).from(opoOportunidades).where(eq(opoOportunidades.id, id));
        return !!o && (await canOnOwner(ctx, 'opo.editar', o.c));
      },
      title: async (id) => (await db.select({ t: opoOportunidades.titulo }).from(opoOportunidades).where(eq(opoOportunidades.id, id)))[0]?.t ?? null,
      url: (id) => `/oportunidades/${id}`,
      watchers: async (id) => {
        const [o] = await db.select({ c: opoOportunidades.comercialId }).from(opoOportunidades).where(eq(opoOportunidades.id, id));
        return o?.c ? [o.c] : [];
      },
    },
  },

  routes: async (app) => {
    app.get('/etapas', async (req) => asegurarEtapas(db, req.ctx.empresaId));
    registerCrud(app, {
      path: '/etapas-admin',
      resource: opoShared.etapaResource,
      table: opoEtapas,
      entity: 'opo_etapa',
      perms: { ver: 'opo.ver', crear: 'cfg.gestionar' },
      hardDelete: true,
    });

    registerCrud(app, {
      path: '/oportunidades',
      resource: opoShared.oportunidadResource,
      table: opoOportunidades,
      entity: 'oportunidad',
      perms: { ver: 'opo.ver', crear: 'opo.editar' },
      scopeCol: opoOportunidades.comercialId,
      ownerOnCreate: 'comercialId',
      beforeSave: async (tx, ctx, data, existing) => {
        if (!existing && !data.etapaId) data.etapaId = (await asegurarEtapas(tx, ctx.empresaId))[0]!.id;
        if (data.terceroId) {
          const [t] = await tx.select({ c: terceros.comercialId }).from(terceros).where(and(eq(terceros.id, data.terceroId), eq(terceros.empresaId, ctx.empresaId)));
          if (!t || !(await canOnOwner(ctx, 'terceros.ver', t.c))) throw forbidden('Ese cliente no está en tu cartera');
        }
        return data;
      },
    });

    /** Tablero: oportunidades abiertas y cerradas en los últimos 90 días, con totales por etapa. */
    app.get('/tablero', { preHandler: guard('opo.ver') }, async (req) => {
      const ctx = req.ctx;
      const q = req.query as { comercialId?: string };
      const etapas = await asegurarEtapas(db, ctx.empresaId);
      const scope = await scopeCondition(ctx, ctx.perms.get('opo.ver')!, opoOportunidades.comercialId);
      const desde = new Date(Date.now() - 90 * 86400_000);
      const rows = await db
        .select({
          o: opoOportunidades,
          tercero: terceros.nombre,
          comercial: sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`,
          presupuesto: documentos.codigo,
          presupuestoEstado: documentos.estado,
        })
        .from(opoOportunidades)
        .innerJoin(terceros, eq(terceros.id, opoOportunidades.terceroId))
        .leftJoin(personas, eq(personas.id, opoOportunidades.comercialId))
        .leftJoin(documentos, eq(documentos.id, opoOportunidades.presupuestoId))
        .where(
          and(
            eq(opoOportunidades.empresaId, ctx.empresaId),
            isNull(opoOportunidades.archivadoEn),
            scope,
            q.comercialId ? eq(opoOportunidades.comercialId, q.comercialId) : undefined,
            sql`(${opoOportunidades.ganadaEn} IS NULL AND ${opoOportunidades.perdidaEn} IS NULL OR coalesce(${opoOportunidades.ganadaEn}, ${opoOportunidades.perdidaEn}) >= ${desde.toISOString()}::timestamptz)`,
          ),
        )
        .orderBy(asc(opoOportunidades.cierrePrevisto));
      return {
        etapas,
        items: rows.map((r) => ({ ...r.o, tercero: r.tercero, comercial: r.comercial, presupuesto: r.presupuesto, presupuestoEstado: r.presupuestoEstado })),
      };
    });

    app.post('/oportunidades/:id/etapa', { preHandler: guard('opo.editar') }, async (req) => {
      const { id } = req.params as { id: string };
      const body = parse(z.object({ etapaId: z.string().uuid(), motivoPerdida: z.string().nullish(), comentario: z.string().nullish() }), req.body);
      await db.transaction(async (tx) => {
        const o = await cargar(tx, req.ctx, id);
        if (!(await canOnOwner(req.ctx, 'opo.editar', o.comercialId))) throw forbidden();
        await moverEtapa(tx, req.ctx, id, body.etapaId, body);
      });
      return { ok: true };
    });

    /** Crea un presupuesto en borrador a partir de la oportunidad. */
    app.post('/oportunidades/:id/presupuesto', { preHandler: guard('pre.editar') }, async (req) => {
      const { id } = req.params as { id: string };
      if (!req.ctx.modules.has('pre')) throw badRequest('El módulo de presupuestos no está activo');
      return db.transaction(async (tx) => {
        const o = await cargar(tx, req.ctx, id);
        const d = await crearDocumento(tx, req.ctx, {
          tipo: 'presupuesto',
          fecha: new Date().toISOString().slice(0, 10),
          terceroId: o.terceroId,
          contactoId: o.contactoId,
          comercialId: o.comercialId,
          titulo: o.titulo,
          descuentoGlobal: 0,
          origenTipo: 'oportunidad',
          origenId: o.id,
          lineas: [{ tipoLinea: 'articulo', descripcion: o.titulo, cantidad: 1, precio: o.importe ?? 0, descuento: 0, ivaTipo: 21, retencion: 0, coste: 0 }],
        });
        await tx.update(opoOportunidades).set({ presupuestoId: d.id }).where(eq(opoOportunidades.id, id));
        // pasa a "Propuesta enviada" si estaba antes
        const etapas = await asegurarEtapas(tx, req.ctx.empresaId);
        const actual = etapas.find((e) => e.id === o.etapaId);
        const propuesta = etapas.find((e) => e.tipo === 'abierta' && e.orden === 3) ?? etapas.find((e) => e.tipo === 'abierta' && e.probabilidad >= 50);
        if (propuesta && (!actual || actual.orden < propuesta.orden)) await moverEtapa(tx, req.ctx, id, propuesta.id);
        return { id: d.id };
      });
    });

    /** Previsión de ventas: importe ponderado por probabilidad, por mes de cierre y comercial. */
    app.get('/prevision', { preHandler: guard('opo.ver') }, async (req) => {
      const ctx = req.ctx;
      const scope = await scopeCondition(ctx, ctx.perms.get('opo.ver')!, opoOportunidades.comercialId);
      const rows = await db
        .select({
          mes: sql<string>`to_char(${opoOportunidades.cierrePrevisto}, 'YYYY-MM')`,
          comercial: sql<string>`coalesce(trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, '')), 'Sin asignar')`,
          total: sql<number>`sum(coalesce(${opoOportunidades.importe}, 0))::float`,
          ponderado: sql<number>`sum(coalesce(${opoOportunidades.importe}, 0) * coalesce(${opoOportunidades.probabilidad}, ${opoEtapas.probabilidad}) / 100)::float`,
          n: sql<number>`count(*)::int`,
        })
        .from(opoOportunidades)
        .leftJoin(opoEtapas, eq(opoEtapas.id, opoOportunidades.etapaId))
        .leftJoin(personas, eq(personas.id, opoOportunidades.comercialId))
        .where(and(eq(opoOportunidades.empresaId, ctx.empresaId), isNull(opoOportunidades.archivadoEn), eq(opoEtapas.tipo, 'abierta'), sql`${opoOportunidades.cierrePrevisto} IS NOT NULL`, scope))
        .groupBy(sql`1`, sql`2`)
        .orderBy(sql`1`);
      const perdidas = await db
        .select({ motivo: opoOportunidades.motivoPerdida, n: sql<number>`count(*)::int`, importe: sql<number>`sum(coalesce(${opoOportunidades.importe},0))::float` })
        .from(opoOportunidades)
        .where(and(eq(opoOportunidades.empresaId, ctx.empresaId), sql`${opoOportunidades.perdidaEn} IS NOT NULL`, scope))
        .groupBy(opoOportunidades.motivoPerdida);
      return { porMes: rows, perdidas };
    });

    /** Formulario web público: crea el cliente potencial y la oportunidad. */
    app.post('/publico/:empresaId/contacto', { config: { public: true, rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
      const { empresaId } = req.params as { empresaId: string };
      const body = parse(
        z.object({ nombre: z.string().trim().min(2), empresa: z.string().trim().nullish(), email: z.string().email(), telefono: z.string().nullish(), mensaje: z.string().trim().min(5).max(3000), acepto: z.literal(true) }),
        req.body,
      );
      const [e] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresaId));
      if (!e) throw notFound();
      const mods = await activeModules(empresaId);
      if (!mods.has('opo')) throw notFound();
      const ctx = systemCtx(empresaId, mods);
      ctx.ip = req.ip;
      await db.transaction(async (tx) => {
        let [t] = await tx.select().from(terceros).where(and(eq(terceros.empresaId, empresaId), sql`lower(${terceros.email}) = lower(${body.email})`)).limit(1);
        if (!t)
          [t] = await tx
            .insert(terceros)
            .values({ empresaId, nombre: body.empresa || body.nombre, razonSocial: body.empresa || body.nombre, email: body.email, telefono: body.telefono, estado: 'potencial', esCliente: true, rgpdConsentimiento: true, notas: `Alta desde el formulario web (${body.nombre})` })
            .returning();
        const etapas = await asegurarEtapas(tx, empresaId);
        const [o] = await tx
          .insert(opoOportunidades)
          .values({ empresaId, titulo: `Contacto web: ${body.mensaje.slice(0, 60)}`, terceroId: t!.id, etapaId: etapas[0]!.id, origen: 'web', descripcion: `${body.mensaje}\n\n${body.nombre} · ${body.email}${body.telefono ? ` · ${body.telefono}` : ''}`, comercialId: t!.comercialId })
          .returning();
        await audit(tx, ctx, 'crear_desde_web', 'oportunidad', o!.id);
        await notify(tx, ctx, { modulo: 'opo', tipo: 'lead', titulo: `Nuevo contacto web: ${body.nombre}`, cuerpo: body.mensaje.slice(0, 200), enlace: `/oportunidades/${o!.id}`, permiso: 'opo.editar', personaIds: [t!.comercialId] });
      });
      return { ok: true };
    });
  },

  events: {
    /** Si el presupuesto aceptado viene de una oportunidad, la oportunidad pasa a ganada con el importe real. */
    'ventas.presupuesto_aceptado': async (tx, ctx, p) => {
      const [d] = await tx.select({ base: documentos.baseImponible, origenTipo: documentos.origenTipo, origenId: documentos.origenId }).from(documentos).where(eq(documentos.id, p.documentoId));
      const oportunidadId = p.oportunidadId ?? (d?.origenTipo === 'oportunidad' ? d.origenId : null);
      if (!oportunidadId) return;
      const [o] = await tx.select().from(opoOportunidades).where(eq(opoOportunidades.id, oportunidadId));
      if (!o || o.ganadaEn) return;
      const etapas = await asegurarEtapas(tx, o.empresaId);
      const ganada = etapas.find((e) => e.tipo === 'ganada');
      if (!ganada) return;
      await tx.update(opoOportunidades).set({ etapaId: ganada.id, ganadaEn: new Date(), importe: d?.base ?? o.importe, presupuestoId: p.documentoId }).where(eq(opoOportunidades.id, o.id));
      await audit(tx, ctx, 'ganada', 'oportunidad', o.id, { presupuesto: p.documentoId });
    },
  },

  approvals: undefined,

  timeline: async (_db, ctx, entidad, id) => {
    if (entidad !== 'tercero' || !ctx.perms.get('opo.ver')) return [];
    const rows = await db
      .select({ o: opoOportunidades, etapa: opoEtapas.nombre, tipo: opoEtapas.tipo })
      .from(opoOportunidades)
      .leftJoin(opoEtapas, eq(opoEtapas.id, opoOportunidades.etapaId))
      .where(and(eq(opoOportunidades.terceroId, id), isNull(opoOportunidades.archivadoEn)))
      .orderBy(desc(opoOportunidades.creadoEn));
    return rows.map(
      (r): TimelineEntry => ({
        id: r.o.id,
        modulo: 'opo',
        tipo: 'oportunidad',
        icono: 'Target',
        titulo: `Oportunidad: ${r.o.titulo}`,
        detalle: `${r.etapa ?? ''}${r.o.importe ? ` · ${fmtMoney(r.o.importe)}` : ''}`,
        fecha: (r.o.ganadaEn ?? r.o.perdidaEn ?? r.o.creadoEn).toISOString(),
        enlace: `/oportunidades/${r.o.id}`,
        tone: r.tipo === 'ganada' ? 'green' : r.tipo === 'perdida' ? 'red' : 'violet',
      }),
    );
  },

  dashboard: async (_db, ctx) => {
    const s = ctx.perms.get('opo.ver');
    if (!s) return [];
    const scope = await scopeCondition(ctx, s, opoOportunidades.comercialId);
    const [r] = await db
      .select({
        abiertas: sql<number>`count(*) FILTER (WHERE ${opoEtapas.tipo} = 'abierta')::int`,
        ponderado: sql<number>`coalesce(sum(coalesce(${opoOportunidades.importe},0) * coalesce(${opoOportunidades.probabilidad}, ${opoEtapas.probabilidad}) / 100) FILTER (WHERE ${opoEtapas.tipo} = 'abierta'), 0)::float`,
      })
      .from(opoOportunidades)
      .leftJoin(opoEtapas, eq(opoEtapas.id, opoOportunidades.etapaId))
      .where(and(eq(opoOportunidades.empresaId, ctx.empresaId), isNull(opoOportunidades.archivadoEn), scope));
    return [{ id: 'opo.embudo', modulo: 'opo', titulo: 'Embudo de ventas (ponderado)', size: 'sm', data: { kind: 'stat', value: r?.ponderado ?? 0, format: 'money', hint: `${r?.abiertas ?? 0} oportunidades abiertas`, enlace: '/oportunidades' } }];
  },

  search: async (_db, ctx, q) => {
    const s = ctx.perms.get('opo.ver');
    if (!s) return [];
    const scope = await scopeCondition(ctx, s, opoOportunidades.comercialId);
    const rows = await db
      .select({ id: opoOportunidades.id, titulo: opoOportunidades.titulo, tercero: terceros.nombre })
      .from(opoOportunidades)
      .innerJoin(terceros, eq(terceros.id, opoOportunidades.terceroId))
      .where(and(eq(opoOportunidades.empresaId, ctx.empresaId), sql`${opoOportunidades.titulo} ILIKE ${'%' + q + '%'}`, scope))
      .limit(5);
    return rows.map((r) => ({ id: r.id, modulo: 'opo', tipo: 'Oportunidad', titulo: r.titulo, subtitulo: r.tercero, enlace: `/oportunidades/${r.id}`, icono: 'Target' }));
  },

  seed: async (tx, s) => {
    const etapas = await asegurarEtapas(tx, s.empresaId);
    const et = (orden: number) => etapas.find((e) => e.orden === orden)!.id;
    const dia = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    const data = [
      { titulo: 'Renovación climatización recepción', t: 'hotel', e: 3, imp: 8900, cierre: 20, c: 'comercial1', origen: 'cliente' },
      { titulo: 'Aerotermia para agua caliente sanitaria', t: 'clinica', e: 2, imp: 4200, cierre: 35, c: 'comercial2', origen: 'telefono' },
      { titulo: 'Climatización de 12 aulas', t: 'colegio', e: 4, imp: 26500, cierre: 15, c: 'comercial1', origen: 'referido' },
      { titulo: 'Ampliación del contrato de mantenimiento a 3 tiendas', t: 'super', e: 3, imp: 14400, cierre: 40, c: 'comercial2', origen: 'cliente' },
      { titulo: 'Instalación de cassettes en planta segunda', t: 'oficinas', e: 1, imp: 9800, cierre: 60, c: 'comercial1', origen: 'web' },
      { titulo: 'Mantenimiento de edificios municipales (licitación)', t: 'ayto', e: 2, imp: 38000, cierre: 75, c: 'comercial1', origen: 'prospeccion' },
      { titulo: 'Aire acondicionado vivienda (3 equipos)', t: 'particular', e: 1, imp: 3600, cierre: 10, c: 'comercial2', origen: 'telefono' },
      { titulo: 'Cámara frigorífica de cocina', t: 'restaurante', e: 6, imp: 6200, cierre: -20, c: 'comercial2', origen: 'cliente', perdida: 'precio' },
      { titulo: 'Sustitución de enfriadora', t: 'hotel', e: 5, imp: 18750, cierre: -30, c: 'comercial1', origen: 'cliente', ganada: true },
    ];
    await tx.insert(opoOportunidades).values(
      data.map((d) => ({
        empresaId: s.empresaId,
        titulo: d.titulo,
        terceroId: s.terceros[d.t]!,
        etapaId: et(d.e),
        importe: d.imp,
        cierrePrevisto: dia(d.cierre),
        comercialId: s.personas[d.c]!,
        origen: d.origen,
        motivoPerdida: d.perdida ?? null,
        perdidaEn: d.perdida ? new Date(Date.now() - 18 * 86400_000) : null,
        ganadaEn: d.ganada ? new Date(Date.now() - 28 * 86400_000) : null,
      })),
    );
  },
});

void can;
