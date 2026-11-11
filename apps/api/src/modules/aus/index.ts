import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ausShared, fmtDate, optionLabel, type ApprovalItem, type DashboardWidget } from '@kite/shared';
import { db, type DbOrTx, type Tx } from '../../db/client';
import { festivos, personas } from '../../db/schema/core';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { fileUrl } from '../../core/files';
import { defineModule } from '../../core/modules';
import { notify } from '../../core/notify';
import { can, canOnOwner, guard } from '../../core/permissions';
import { ficTrabajadores } from '../fic/schema';
import { condAlcance, exigirPersona, idsEnAlcance, nombrePersona, nombres, personaPorId, personasActivas } from '../fic/personas';
import { addDays, diaSemana, hoyMadrid, limitesMes, mesActual, rangoDias } from '../hor/tiempo';
import { ausMinimos, ausSaldos, ausSolicitudes, ausTipos } from './schema';
import { seedAus } from './seed';
import { ACTIVAS, PENDIENTES, contarDias, saldos } from './calculo';

const { tipoAusenciaResource, saldoResource, minimoResource, SOLICITUD_ESTADOS } = ausShared;
type SaldoResumen = ausShared.SaldoResumen;
const fechaRe = /^\d{4}-\d{2}-\d{2}$/;

/* ──────────────── Cálculos ──────────────── */

/** Avisos al pedir o aprobar: compañeros ausentes a la vez y mínimo de personal del departamento. */
async function avisos(tx: DbOrTx, empresaId: string, personaId: string, desde: string, hasta: string, excluirId?: string) {
  const [p] = await tx.select({ dep: personas.departamentoId }).from(personas).where(eq(personas.id, personaId));
  if (!p?.dep) return { solapes: [], minimo: null as null | { minimo: number; dias: string[] } };
  const companeros = await tx
    .select({ id: personas.id })
    .from(personas)
    .where(and(eq(personas.departamentoId, p.dep), eq(personas.activo, true), isNull(personas.archivadoEn)));
  const ids = companeros.map((c) => c.id).filter((id) => id !== personaId);
  const solapes = ids.length
    ? await tx
        .select({ id: ausSolicitudes.id, personaId: ausSolicitudes.personaId, nombre: nombrePersona, desde: ausSolicitudes.desde, hasta: ausSolicitudes.hasta, estado: ausSolicitudes.estado })
        .from(ausSolicitudes)
        .innerJoin(personas, eq(personas.id, ausSolicitudes.personaId))
        .where(and(inArray(ausSolicitudes.personaId, ids), inArray(ausSolicitudes.estado, ACTIVAS), lte(ausSolicitudes.desde, hasta), gte(ausSolicitudes.hasta, desde), excluirId ? ne(ausSolicitudes.id, excluirId) : undefined))
    : [];
  const [min] = await tx.select().from(ausMinimos).where(eq(ausMinimos.departamentoId, p.dep));
  let minimo: { minimo: number; dias: string[] } | null = null;
  if (min) {
    const total = companeros.length;
    const dias = rangoDias(desde, hasta)
      .filter((f) => diaSemana(f) <= 5)
      .filter((f) => total - 1 - solapes.filter((s) => s.estado === 'aprobada' && s.desde <= f && s.hasta >= f).length < min.minimo);
    if (dias.length) minimo = { minimo: min.minimo, dias };
  }
  return { solapes: solapes.map((s) => ({ ...s, estado: optionLabel(SOLICITUD_ESTADOS, s.estado)?.label ?? s.estado })), minimo };
}

/** Saldo inicial de un año, prorrateado si la persona entra ese año y con el arrastre del anterior. */
async function generarSaldos(tx: Tx, empresaId: string, anio: number, personaIds: string[]) {
  const tipos = await tx.select().from(ausTipos).where(and(eq(ausTipos.empresaId, empresaId), eq(ausTipos.descuentaSaldo, true), eq(ausTipos.activo, true)));
  let n = 0;
  for (const pid of personaIds) {
    const [f] = await tx.select({ alta: ficTrabajadores.fechaAlta }).from(ficTrabajadores).where(eq(ficTrabajadores.personaId, pid));
    const previo = await saldos(tx, empresaId, pid, anio - 1);
    for (const t of tipos) {
      if (!t.diasAnuales) continue;
      let dias = Number(t.diasAnuales);
      if (f?.alta && Number(f.alta.slice(0, 4)) === anio) {
        const restantes = rangoDias(f.alta, `${anio}-12-31`).length;
        dias = Math.round(((dias * restantes) / 365) * 2) / 2;
      }
      const prev = previo.find((s) => s.tipoId === t.id);
      const arrastre = prev ? Math.max(0, Math.min(Number(t.maxArrastre ?? 0), prev.disponibles)) : 0;
      const r = await tx.insert(ausSaldos).values({ empresaId, personaId: pid, tipoId: t.id, anio, dias, arrastre }).onConflictDoNothing().returning();
      n += r.length;
    }
  }
  return n;
}

async function quienAprueba(tx: DbOrTx, personaId: string) {
  const [p] = await tx.select({ resp: personas.responsableId }).from(personas).where(eq(personas.id, personaId));
  return p?.resp ?? null;
}

/** Ausencias que el usuario puede ver; las de compañeros fuera de su alcance se muestran sin el tipo. */
async function visibles(ctx: Ctx, desde: string, hasta: string, departamentoId?: string) {
  const ids = await idsEnAlcance(ctx, 'aus.ver');
  let lista = await personasActivas(db, ctx.empresaId, ids);
  // quien solo ve lo suyo ve también a su departamento en el calendario (sin el motivo de la ausencia)
  if (ctx.perms.get('aus.ver') === 'propio' && ctx.departamentoId) lista = (await personasActivas(db, ctx.empresaId, null)).filter((p) => p.departamentoId === ctx.departamentoId);
  if (departamentoId) lista = lista.filter((p) => p.departamentoId === departamentoId);
  const detalle = new Set(ids === null ? lista.map((p) => p.id) : ids);
  const pids = lista.map((p) => p.id);
  const rows = pids.length
    ? await db
        .select({ s: ausSolicitudes, tipo: ausTipos.nombre, codigo: ausTipos.codigo, color: ausTipos.color })
        .from(ausSolicitudes)
        .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
        .where(and(inArray(ausSolicitudes.personaId, pids), inArray(ausSolicitudes.estado, ACTIVAS), lte(ausSolicitudes.desde, hasta), gte(ausSolicitudes.hasta, desde)))
        .orderBy(asc(ausSolicitudes.desde))
    : [];
  return {
    lista,
    ausencias: rows
      .filter((r) => detalle.has(r.s.personaId) || r.s.estado === 'aprobada')
      .map((r) => {
        const ver = detalle.has(r.s.personaId);
        return { id: r.s.id, personaId: r.s.personaId, desde: r.s.desde, hasta: r.s.hasta, medioDia: r.s.medioDia, estado: r.s.estado, dias: r.s.dias, tipo: ver ? r.tipo : 'Ausente', codigo: ver ? r.codigo : null, color: ver ? r.color : '#9C8FA8', detalle: ver };
      }),
  };
}

/* ──────────────── Rutas ──────────────── */

const solicitudSchema = z.object({
  personaId: z.string().uuid().nullish(),
  tipoId: z.string().uuid(),
  desde: z.string().regex(fechaRe, 'Fecha no válida'),
  hasta: z.string().regex(fechaRe, 'Fecha no válida'),
  medioDia: z.enum(['manana', 'tarde']).nullish(),
  motivo: z.string().trim().max(1000).nullish(),
  justificanteArchivoId: z.string().uuid().nullish(),
});

async function routes(app: FastifyInstance) {
  registerCrud(app, {
    path: '/tipos',
    resource: tipoAusenciaResource,
    table: ausTipos,
    entity: 'aus_tipo',
    perms: { ver: ['aus.solicitar', 'aus.ver'], crear: 'aus.gestionar' },
    hardDelete: false,
    only: ['list', 'get', 'create', 'update'],
  });
  registerCrud(app, {
    path: '/saldos',
    resource: saldoResource,
    table: ausSaldos,
    entity: 'aus_saldo',
    perms: { ver: 'aus.ver', crear: 'aus.gestionar' },
    scopeCol: ausSaldos.personaId,
    hardDelete: true,
  });
  registerCrud(app, {
    path: '/minimos',
    resource: minimoResource,
    table: ausMinimos,
    entity: 'aus_minimo',
    perms: { ver: 'aus.ver', crear: 'aus.gestionar' },
    hardDelete: true,
  });

  app.post('/saldos/generar', { preHandler: guard('aus.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { anio } = parse(z.object({ anio: z.number().int().min(2000).max(2100) }), req.body);
    const lista = await personasActivas(db, ctx.empresaId, null);
    const n = await db.transaction(async (tx) => {
      const n = await generarSaldos(
        tx,
        ctx.empresaId,
        anio,
        lista.map((p) => p.id),
      );
      await audit(tx, ctx, 'generar_saldos', 'aus_saldo', null, { anio, creados: n });
      return n;
    });
    return { ok: true, creados: n };
  });

  /** Saldos de una persona (o los míos). */
  app.get('/resumen', async (req) => {
    const ctx = req.ctx;
    const q = req.query as { personaId?: string; anio?: string };
    const personaId = q.personaId ?? ctx.personaId;
    if (!personaId) throw badRequest('Tu usuario no está asociado a ninguna persona');
    if (personaId !== ctx.personaId) await exigirPersona(ctx, 'aus.ver', personaId);
    const anio = Number(q.anio) || Number(hoyMadrid().slice(0, 4));
    return { anio, saldos: await saldos(db, ctx.empresaId, personaId, anio) };
  });

  /** Vista previa de una solicitud: días, saldo resultante y avisos. */
  app.get('/preview', async (req) => {
    const ctx = req.ctx;
    const q = req.query as { tipoId?: string; desde?: string; hasta?: string; medioDia?: string; personaId?: string };
    const personaId = q.personaId || ctx.personaId;
    if (!personaId || !q.tipoId || !q.desde || !fechaRe.test(q.desde)) throw badRequest('Faltan datos');
    if (personaId !== ctx.personaId) await exigirPersona(ctx, 'aus.ver', personaId);
    const hasta = q.hasta && fechaRe.test(q.hasta) ? q.hasta : q.desde;
    const [t] = await db.select().from(ausTipos).where(and(eq(ausTipos.id, q.tipoId), eq(ausTipos.empresaId, ctx.empresaId)));
    if (!t) throw notFound('Tipo no encontrado');
    const dias = await contarDias(db, ctx.empresaId, personaId, t.unidad, q.desde, hasta, q.medioDia || null);
    const sal = t.descuentaSaldo ? (await saldos(db, ctx.empresaId, personaId, Number(q.desde.slice(0, 4)))).find((s) => s.tipoId === t.id) : null;
    const propias = await db
      .select({ id: ausSolicitudes.id, desde: ausSolicitudes.desde, hasta: ausSolicitudes.hasta })
      .from(ausSolicitudes)
      .where(and(eq(ausSolicitudes.personaId, personaId), inArray(ausSolicitudes.estado, ACTIVAS), lte(ausSolicitudes.desde, hasta), gte(ausSolicitudes.hasta, q.desde)));
    const av = await avisos(db, ctx.empresaId, personaId, q.desde, hasta);
    const verCompaneros = can(ctx, 'aus.aprobar') || can(ctx, 'aus.gestionar');
    return {
      dias,
      unidad: t.unidad,
      saldo: sal ? { disponibles: sal.disponibles, despues: Math.round((sal.disponibles - dias) * 10) / 10 } : null,
      solapePropio: propias.length > 0,
      companeros: verCompaneros ? av.solapes : av.solapes.length,
      minimo: av.minimo,
      requiereJustificante: t.requiereJustificante,
    };
  });

  /* ── Solicitudes ── */
  app.get('/solicitudes', async (req) => {
    const ctx = req.ctx;
    const q = req.query as { estado?: string; personaId?: string; anio?: string; mias?: string };
    const conds = [eq(ausSolicitudes.empresaId, ctx.empresaId)];
    if (q.mias) {
      if (!ctx.personaId) return [];
      conds.push(eq(ausSolicitudes.personaId, ctx.personaId));
    } else {
      if (!can(ctx, 'aus.ver')) throw forbidden();
      const c = await condAlcance(ctx, 'aus.ver', ausSolicitudes.personaId);
      if (c) conds.push(c);
    }
    if (q.personaId) conds.push(eq(ausSolicitudes.personaId, q.personaId));
    if (q.estado) conds.push(inArray(ausSolicitudes.estado, q.estado.split(',')));
    if (q.anio) conds.push(sql`extract(year from ${ausSolicitudes.desde}) = ${Number(q.anio)}`);
    const rows = await db
      .select({ s: ausSolicitudes, nombre: nombrePersona, tipo: ausTipos.nombre, color: ausTipos.color, dosNiveles: ausTipos.dosNiveles })
      .from(ausSolicitudes)
      .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
      .innerJoin(personas, eq(personas.id, ausSolicitudes.personaId))
      .where(and(...conds))
      .orderBy(desc(ausSolicitudes.desde))
      .limit(500);
    const hoy = hoyMadrid();
    const out = [];
    for (const r of rows) {
      const esPropia = r.s.personaId === ctx.personaId;
      const nivel1 = r.s.estado === 'pendiente' && !esPropia && (await canOnOwner(ctx, 'aus.aprobar', r.s.personaId));
      const nivel2 = r.s.estado === 'aprobada_responsable' && !esPropia && can(ctx, 'aus.gestionar');
      out.push({
        ...r.s,
        persona: r.nombre,
        tipo: r.tipo,
        color: r.color,
        justificanteUrl: fileUrl(r.s.justificanteArchivoId),
        puedeAprobar: nivel1 || nivel2,
        puedeCancelar: (esPropia && (PENDIENTES.includes(r.s.estado) || (r.s.estado === 'aprobada' && r.s.desde > hoy))) || (can(ctx, 'aus.gestionar') && ACTIVAS.includes(r.s.estado)),
      });
    }
    return out;
  });

  app.post('/solicitudes', async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(solicitudSchema, req.body);
    const personaId = b.personaId ?? ctx.personaId;
    if (!personaId) throw badRequest('Tu usuario no está asociado a ninguna persona');
    const paraOtro = personaId !== ctx.personaId;
    if (paraOtro && !(can(ctx, 'aus.gestionar') && (await canOnOwner(ctx, 'aus.ver', personaId)))) throw forbidden('Solo RRHH puede registrar ausencias de otras personas');
    if (!paraOtro && !can(ctx, 'aus.solicitar')) throw forbidden();
    if (b.hasta < b.desde) throw badRequest('La fecha de fin es anterior a la de inicio');
    if (b.medioDia && b.desde !== b.hasta) throw badRequest('El medio día solo se puede pedir para un día concreto');
    const [t] = await db.select().from(ausTipos).where(and(eq(ausTipos.id, b.tipoId), eq(ausTipos.empresaId, ctx.empresaId), eq(ausTipos.activo, true)));
    if (!t) throw badRequest('Tipo de ausencia no válido');
    if (t.soloRrhh && !can(ctx, 'aus.gestionar')) throw forbidden(`${t.nombre}: lo registra RRHH. Envíales el parte o el justificante.`);
    if (b.medioDia && !t.permiteMedioDia) throw badRequest(`${t.nombre} no se puede pedir por medio día`);
    if (t.requiereJustificante && !b.justificanteArchivoId && !can(ctx, 'aus.gestionar')) throw badRequest('Adjunta el justificante (puedes hacer una foto con el móvil)');
    if (!paraOtro && b.desde < addDays(hoyMadrid(), -30)) throw badRequest('No se pueden pedir ausencias de hace más de 30 días. Habla con RRHH.');
    const dias = await contarDias(db, ctx.empresaId, personaId, t.unidad, b.desde, b.hasta, b.medioDia);
    if (dias <= 0) throw badRequest('En esas fechas no hay ningún día laborable');
    const [solape] = await db
      .select({ id: ausSolicitudes.id })
      .from(ausSolicitudes)
      .where(and(eq(ausSolicitudes.personaId, personaId), inArray(ausSolicitudes.estado, ACTIVAS), lte(ausSolicitudes.desde, b.hasta), gte(ausSolicitudes.hasta, b.desde)));
    if (solape) throw conflict('Ya tienes una ausencia pedida o aprobada en esas fechas');
    if (t.descuentaSaldo) {
      const s = (await saldos(db, ctx.empresaId, personaId, Number(b.desde.slice(0, 4)))).find((x) => x.tipoId === t.id);
      if (s && dias > s.disponibles) throw badRequest(`No tienes días suficientes de ${t.nombre.toLowerCase()}: te quedan ${s.disponibles} y pides ${dias}`);
    }
    const directa = paraOtro || t.soloRrhh;
    const row = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(ausSolicitudes)
        .values({
          empresaId: ctx.empresaId,
          personaId,
          tipoId: t.id,
          desde: b.desde,
          hasta: b.hasta,
          medioDia: b.medioDia ?? null,
          dias,
          motivo: b.motivo ?? null,
          justificanteArchivoId: b.justificanteArchivoId ?? null,
          estado: directa ? 'aprobada' : 'pendiente',
          registradaPor: paraOtro ? ctx.usuarioId : null,
          revisadoPor: directa ? ctx.usuarioId : null,
          revisadoEn: directa ? new Date() : null,
        })
        .returning();
      await audit(tx, ctx, directa ? 'registrar_ausencia' : 'solicitar_ausencia', 'aus_solicitud', s!.id, s);
      const rango = b.desde === b.hasta ? fmtDate(b.desde) : `del ${fmtDate(b.desde)} al ${fmtDate(b.hasta)}`;
      if (directa) {
        if (paraOtro) await notify(tx, ctx, { modulo: 'aus', tipo: 'ausencia_registrada', titulo: `RRHH ha registrado: ${t.nombre} ${rango}`, enlace: '/vacaciones', personaIds: [personaId] });
      } else {
        const resp = await quienAprueba(tx, personaId);
        await notify(tx, ctx, {
          modulo: 'aus',
          tipo: 'solicitud',
          titulo: `${ctx.nombre} pide ${t.nombre.toLowerCase()} ${rango}`,
          cuerpo: `${dias} ${dias === 1 ? 'día' : 'días'}${b.motivo ? `. ${b.motivo}` : ''}`,
          enlace: '/bandeja',
          personaIds: resp ? [resp] : [],
          permiso: resp ? undefined : 'aus.gestionar',
          email: true,
        });
      }
      return s!;
    });
    reply.code(201);
    return { ...row, avisos: await avisos(db, ctx.empresaId, personaId, b.desde, b.hasta, row.id) };
  });

  async function revisable(ctx: Ctx, id: string) {
    const [s] = await db.select({ s: ausSolicitudes, t: ausTipos }).from(ausSolicitudes).innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId)).where(and(eq(ausSolicitudes.id, id), eq(ausSolicitudes.empresaId, ctx.empresaId)));
    if (!s) throw notFound('Solicitud no encontrada');
    if (!PENDIENTES.includes(s.s.estado)) throw badRequest('Esta solicitud ya está resuelta');
    if (s.s.personaId === ctx.personaId) throw forbidden('No puedes aprobar tus propias ausencias');
    if (s.s.estado === 'pendiente' && !(await canOnOwner(ctx, 'aus.aprobar', s.s.personaId))) throw forbidden('Esta persona no está en tu equipo');
    if (s.s.estado === 'aprobada_responsable' && !can(ctx, 'aus.gestionar')) throw forbidden('Falta la aprobación de RRHH');
    return s;
  }

  app.post('/solicitudes/:id/aprobar', async (req) => {
    const ctx = req.ctx;
    const { s, t } = await revisable(ctx, (req.params as { id: string }).id);
    const esRrhh = can(ctx, 'aus.gestionar');
    const nuevo = s.estado === 'pendiente' && t.dosNiveles && !esRrhh ? 'aprobada_responsable' : 'aprobada';
    const av = await avisos(db, ctx.empresaId, s.personaId, s.desde, s.hasta, s.id);
    await db.transaction(async (tx) => {
      const set: Partial<typeof ausSolicitudes.$inferInsert> = { estado: nuevo };
      if (s.estado === 'pendiente') Object.assign(set, { aprobadoResponsablePor: ctx.usuarioId, aprobadoResponsableEn: new Date() });
      if (nuevo === 'aprobada') Object.assign(set, { revisadoPor: ctx.usuarioId, revisadoEn: new Date() });
      await tx.update(ausSolicitudes).set(set).where(eq(ausSolicitudes.id, s.id));
      await audit(tx, ctx, nuevo === 'aprobada' ? 'aprobar_ausencia' : 'aprobar_ausencia_responsable', 'aus_solicitud', s.id, { estado: nuevo });
      const rango = s.desde === s.hasta ? fmtDate(s.desde) : `del ${fmtDate(s.desde)} al ${fmtDate(s.hasta)}`;
      if (nuevo === 'aprobada')
        await notify(tx, ctx, { modulo: 'aus', tipo: 'aprobada', titulo: `Aprobada: ${t.nombre} ${rango}`, enlace: '/vacaciones', personaIds: [s.personaId], email: true });
      else {
        const n = await nombres(tx, [s.personaId]);
        await notify(tx, ctx, { modulo: 'aus', tipo: 'segundo_nivel', titulo: `${t.nombre} de ${n[s.personaId]} ${rango}: falta RRHH`, cuerpo: `Aprobado por ${ctx.nombre}.`, enlace: '/bandeja', permiso: 'aus.gestionar' });
        await notify(tx, ctx, { modulo: 'aus', tipo: 'aprobada_responsable', titulo: `Tu responsable ha aprobado ${t.nombre.toLowerCase()} ${rango}. Falta RRHH.`, enlace: '/vacaciones', personaIds: [s.personaId] });
      }
    });
    return { ok: true, estado: nuevo, avisos: av };
  });

  app.post('/solicitudes/:id/rechazar', async (req) => {
    const ctx = req.ctx;
    const { s, t } = await revisable(ctx, (req.params as { id: string }).id);
    const { motivo } = parse(z.object({ motivo: z.string().trim().max(1000).nullish() }), req.body ?? {});
    await db.transaction(async (tx) => {
      await tx.update(ausSolicitudes).set({ estado: 'rechazada', revisadoPor: ctx.usuarioId, revisadoEn: new Date(), motivoRechazo: motivo ?? null }).where(eq(ausSolicitudes.id, s.id));
      await audit(tx, ctx, 'rechazar_ausencia', 'aus_solicitud', s.id, { motivo });
      await notify(tx, ctx, { modulo: 'aus', tipo: 'rechazada', titulo: `No aprobada: ${t.nombre} del ${fmtDate(s.desde)}`, cuerpo: motivo ?? null, enlace: '/vacaciones', personaIds: [s.personaId], email: true });
    });
    return { ok: true };
  });

  app.post('/solicitudes/:id/cancelar', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [s] = await db.select().from(ausSolicitudes).where(and(eq(ausSolicitudes.id, id), eq(ausSolicitudes.empresaId, ctx.empresaId)));
    if (!s) throw notFound();
    const propia = s.personaId === ctx.personaId;
    const rrhh = can(ctx, 'aus.gestionar') && (await canOnOwner(ctx, 'aus.ver', s.personaId));
    if (!propia && !rrhh) throw forbidden();
    if (!ACTIVAS.includes(s.estado)) throw badRequest('Esta solicitud ya no está activa');
    if (propia && !rrhh && s.estado === 'aprobada' && s.desde <= hoyMadrid()) throw badRequest('Ya ha empezado: pide a RRHH que la modifique');
    await db.transaction(async (tx) => {
      await tx.update(ausSolicitudes).set({ estado: 'cancelada', revisadoPor: ctx.usuarioId, revisadoEn: new Date() }).where(eq(ausSolicitudes.id, id));
      await audit(tx, ctx, 'cancelar_ausencia', 'aus_solicitud', id);
      if (s.estado === 'aprobada') {
        const resp = await quienAprueba(tx, s.personaId);
        await notify(tx, ctx, { modulo: 'aus', tipo: 'cancelada', titulo: `${propia ? ctx.nombre : 'RRHH'} ha cancelado una ausencia aprobada (${fmtDate(s.desde)})`, enlace: '/ausencias', personaIds: propia ? [resp] : [s.personaId] });
      }
    });
    return { ok: true };
  });

  /* ── Calendario del equipo y quién falta hoy ── */
  app.get('/calendario', async (req) => {
    const ctx = req.ctx;
    const q = req.query as { mes?: string; departamentoId?: string };
    const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : mesActual();
    const { desde, hasta } = limitesMes(mes);
    const { lista, ausencias } = await visibles(ctx, desde, hasta, q.departamentoId);
    const fest = await db
      .select({ fecha: festivos.fecha, nombre: festivos.nombre, centroId: festivos.centroId, ambito: festivos.ambito })
      .from(festivos)
      .where(and(eq(festivos.empresaId, ctx.empresaId), gte(festivos.fecha, desde), lte(festivos.fecha, hasta)));
    return {
      mes,
      dias: rangoDias(desde, hasta),
      festivos: fest,
      personas: lista.map((p) => ({ id: p.id, nombre: p.nombre, departamento: p.departamento, departamentoId: p.departamentoId, centroId: p.centroId, ausencias: ausencias.filter((a) => a.personaId === p.id) })),
    };
  });

  app.get('/hoy', async (req) => {
    const ctx = req.ctx;
    const hoy = hoyMadrid();
    const { lista, ausencias } = await visibles(ctx, hoy, hoy);
    return ausencias.filter((a) => a.estado === 'aprobada').map((a) => ({ ...a, nombre: lista.find((p) => p.id === a.personaId)?.nombre }));
  });
}

export default defineModule({
  code: 'aus',
  routes,
  refTargets: {
    'aus.tipos': {
      table: ausTipos,
      id: ausTipos.id,
      label: sql<string>`${ausTipos.nombre}`,
      sub: sql<string>`${ausTipos.codigo}`,
      search: [ausTipos.nombre, ausTipos.codigo],
      empresaCol: ausTipos.empresaId,
      where: () => eq(ausTipos.activo, true),
    },
  },
  events: {
    'persona.creada': async (tx, ctx, { personaId }) => {
      const [p] = await tx.select({ empresaId: personas.empresaId }).from(personas).where(eq(personas.id, personaId));
      if (p) await generarSaldos(tx, p.empresaId, Number(hoyMadrid().slice(0, 4)), [personaId]);
      void ctx;
    },
  },
  approvals: async (dbx, ctx): Promise<ApprovalItem[]> => {
    if (!can(ctx, 'aus.aprobar') && !can(ctx, 'aus.gestionar')) return [];
    const cond1 = can(ctx, 'aus.aprobar') ? and(eq(ausSolicitudes.estado, 'pendiente'), await condAlcance(ctx, 'aus.aprobar', ausSolicitudes.personaId)) : sql`false`;
    const cond2 = can(ctx, 'aus.gestionar') ? eq(ausSolicitudes.estado, 'aprobada_responsable') : sql`false`;
    const rows = await dbx
      .select({ s: ausSolicitudes, nombre: nombrePersona, tipo: ausTipos.nombre })
      .from(ausSolicitudes)
      .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
      .innerJoin(personas, eq(personas.id, ausSolicitudes.personaId))
      .where(and(eq(ausSolicitudes.empresaId, ctx.empresaId), or(cond1, cond2)))
      .orderBy(asc(ausSolicitudes.creadoEn))
      .limit(100);
    const out: ApprovalItem[] = [];
    for (const r of rows.filter((r) => r.s.personaId !== ctx.personaId)) {
      const av = await avisos(dbx, ctx.empresaId, r.s.personaId, r.s.desde, r.s.hasta, r.s.id);
      const extra = [av.solapes.length ? `Coincide con ${av.solapes.map((x) => x.nombre).join(', ')}` : null, av.minimo ? `Por debajo del mínimo de ${av.minimo.minimo} personas ${av.minimo.dias.length} días` : null].filter(Boolean);
      out.push({
        id: `aus-${r.s.id}`,
        modulo: 'aus',
        tipo: r.s.estado === 'aprobada_responsable' ? `${r.tipo} (2.º nivel)` : r.tipo,
        titulo: `${r.nombre}: ${r.s.desde === r.s.hasta ? fmtDate(r.s.desde) : `${fmtDate(r.s.desde)} – ${fmtDate(r.s.hasta)}`}${r.s.medioDia ? ` (${r.s.medioDia === 'manana' ? 'mañana' : 'tarde'})` : ''}`,
        detalle: [`${r.s.dias} ${Number(r.s.dias) === 1 ? 'día' : 'días'}`, r.s.motivo, ...extra].filter(Boolean).join(' · '),
        solicitante: r.nombre,
        fecha: r.s.creadoEn.toISOString(),
        enlace: '/ausencias?tab=solicitudes',
        aprobarUrl: `/api/aus/solicitudes/${r.s.id}/aprobar`,
        rechazarUrl: `/api/aus/solicitudes/${r.s.id}/rechazar`,
      });
    }
    return out;
  },
  dashboard: async (dbx, ctx): Promise<DashboardWidget[]> => {
    const out: DashboardWidget[] = [];
    const anio = Number(hoyMadrid().slice(0, 4));
    if (ctx.personaId) {
      const s = (await saldos(dbx, ctx.empresaId, ctx.personaId, anio)).find((x) => /vacacion/i.test(x.tipo)) ?? (await saldos(dbx, ctx.empresaId, ctx.personaId, anio))[0];
      if (s) out.push({ id: 'aus.mis_dias', modulo: 'aus', titulo: `Mis días de ${s.tipo.toLowerCase()}`, size: 'sm', data: { kind: 'stat', value: s.disponibles, format: 'number', hint: `disponibles de ${s.asignados + s.arrastre + s.ajuste}${s.pendientes ? ` · ${s.pendientes} pendientes` : ''}`, enlace: '/vacaciones' } });
    }
    const scope = ctx.perms.get('aus.ver');
    if (scope && scope !== 'propio') {
      const hoy = hoyMadrid();
      const ids = await idsEnAlcance(ctx, 'aus.ver');
      const rows = await dbx
        .select({ nombre: nombrePersona, tipo: ausTipos.nombre, hasta: ausSolicitudes.hasta, medioDia: ausSolicitudes.medioDia })
        .from(ausSolicitudes)
        .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
        .innerJoin(personas, eq(personas.id, ausSolicitudes.personaId))
        .where(and(eq(ausSolicitudes.empresaId, ctx.empresaId), eq(ausSolicitudes.estado, 'aprobada'), lte(ausSolicitudes.desde, hoy), gte(ausSolicitudes.hasta, hoy), ids ? (ids.length ? inArray(ausSolicitudes.personaId, ids) : sql`false`) : undefined));
      out.push({
        id: 'aus.faltan_hoy',
        modulo: 'aus',
        titulo: 'Quién falta hoy',
        size: 'md',
        data: { kind: 'list', vacio: 'Hoy está todo el equipo', enlace: '/ausencias', items: rows.map((r) => ({ titulo: r.nombre, subtitulo: r.tipo + (r.medioDia ? ` (${r.medioDia === 'manana' ? 'mañana' : 'tarde'})` : ''), valor: r.hasta === hoy ? 'vuelve mañana' : `hasta el ${fmtDate(r.hasta).slice(0, 5)}` })) },
      });
    }
    return out;
  },
  timeline: async (dbx, ctx, entidad, id) => {
    if (entidad !== 'persona' || (id !== ctx.personaId && !(await canOnOwner(ctx, 'aus.ver', id)))) return [];
    const rows = await dbx
      .select({ s: ausSolicitudes, tipo: ausTipos.nombre })
      .from(ausSolicitudes)
      .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
      .where(eq(ausSolicitudes.personaId, id))
      .orderBy(desc(ausSolicitudes.creadoEn))
      .limit(20);
    return rows.map((r) => ({
      id: `as-${r.s.id}`,
      modulo: 'aus',
      tipo: 'ausencia',
      icono: 'CalendarDays',
      titulo: `${r.tipo}: ${fmtDate(r.s.desde)}${r.s.hasta !== r.s.desde ? ` – ${fmtDate(r.s.hasta)}` : ''}`,
      detalle: optionLabel(SOLICITUD_ESTADOS, r.s.estado)?.label ?? r.s.estado,
      fecha: r.s.creadoEn.toISOString(),
      enlace: `/personas/${id}?tab=aus-ausencias`,
      tone: optionLabel(SOLICITUD_ESTADOS, r.s.estado)?.tone,
    }));
  },
  jobs: [
    {
      id: 'aus.recordatorio_pendientes',
      dailyAt: '08:30',
      run: async (empresaId, ctx) => {
        const limite = addDays(hoyMadrid(), 10);
        const rows = await db
          .select({ s: ausSolicitudes, nombre: nombrePersona })
          .from(ausSolicitudes)
          .innerJoin(personas, eq(personas.id, ausSolicitudes.personaId))
          .where(and(eq(ausSolicitudes.empresaId, empresaId), eq(ausSolicitudes.estado, 'pendiente'), lte(ausSolicitudes.desde, limite), sql`${ausSolicitudes.creadoEn} < now() - interval '2 days'`));
        await db.transaction(async (tx) => {
          for (const r of rows) {
            const resp = await quienAprueba(tx, r.s.personaId);
            await notify(tx, ctx, { modulo: 'aus', tipo: 'recordatorio', titulo: `Pendiente de aprobar: ausencia de ${r.nombre} (${fmtDate(r.s.desde)})`, enlace: '/bandeja', personaIds: resp ? [resp] : [], permiso: resp ? undefined : 'aus.gestionar' });
          }
        });
        return `${rows.length} recordatorios`;
      },
    },
  ],
  seed: seedAus,
});

