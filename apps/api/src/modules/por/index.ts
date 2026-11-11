import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { porShared } from '@kite/shared';
import { db } from '../../db/client';
import { anuncios, departamentos, firmas, personas } from '../../db/schema/core';
import type { Ctx } from '../../core/context';
import { defineModule } from '../../core/modules';
import { can } from '../../core/permissions';
import { ficCambios, ficPrl } from '../fic/schema';
import { nombrePersona } from '../fic/personas';
import { calcularDias, cargarDatos, estadoActual, totales } from '../hor/calculo';
import { addDays, hoyMadrid, lunesDe } from '../hor/tiempo';
import { saldos } from '../aus/calculo';
import { ausSolicitudes, ausTipos } from '../aus/schema';
import { nomRecibos } from '../nom/schema';

/** Resumen del portal del empleado: solo lo de la propia persona y de los módulos activos. */
async function resumen(ctx: Ctx): Promise<porShared.PortalResumen> {
  const pid = ctx.personaId;
  const out: porShared.PortalResumen = { persona: null, jornada: null, turnos: null, vacaciones: null, nominas: null, firmasPendientes: 0, avisosSinLeer: 0, datosPendientes: false };
  if (!pid) return out;
  const resp = sql<string>`(SELECT trim(r.nombre || ' ' || coalesce(r.apellidos, '')) FROM personas r WHERE r.id = ${personas.responsableId})`;
  const [p] = await db
    .select({ id: personas.id, nombre: nombrePersona, puesto: personas.puesto, departamento: departamentos.nombre, responsable: resp })
    .from(personas)
    .leftJoin(departamentos, eq(departamentos.id, personas.departamentoId))
    .where(eq(personas.id, pid));
  out.persona = p ?? null;
  const hoy = hoyMadrid();

  if (ctx.modules.has('hor') && can(ctx, 'hor.fichar')) {
    const lunes = lunesDe(hoy);
    const fin = addDays(lunes, 13);
    const d = await cargarDatos(db, ctx.empresaId, [pid], lunes, fin, ctx.modules);
    const dias = calcularDias(d, pid, lunes, fin);
    const semana = dias.slice(0, 7);
    const t = totales(semana);
    const est = await estadoActual(db, pid);
    out.jornada = { estado: est.estado, desde: est.desde?.toISOString() ?? null, horasHoy: dias.find((x) => x.fecha === hoy)?.trabajadas ?? 0, horasSemana: t.trabajadas, previstasSemana: t.previstas };
    out.turnos = dias
      .filter((x) => x.fecha >= hoy)
      .slice(0, 7)
      .map((x) => ({ fecha: x.fecha, turno: x.turno?.nombre ?? null, horario: x.turno ? `${x.turno.horaInicio}–${x.turno.horaFin}` : null, color: x.turno?.color ?? null, festivo: x.festivo, ausencia: x.ausencia?.tipo ?? null }));
  }

  if (ctx.modules.has('aus')) {
    const s = await saldos(db, ctx.empresaId, pid, Number(hoy.slice(0, 4)));
    const vac = s.find((x) => /vacacion/i.test(x.tipo)) ?? s[0];
    const [prox] = await db
      .select({ desde: ausSolicitudes.desde, hasta: ausSolicitudes.hasta, tipo: ausTipos.nombre, estado: ausSolicitudes.estado })
      .from(ausSolicitudes)
      .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
      .where(and(eq(ausSolicitudes.personaId, pid), inArray(ausSolicitudes.estado, ['pendiente', 'aprobada_responsable', 'aprobada']), gte(ausSolicitudes.hasta, hoy)))
      .orderBy(asc(ausSolicitudes.desde))
      .limit(1);
    if (vac || prox) out.vacaciones = { disponibles: vac?.disponibles ?? 0, asignados: (vac?.asignados ?? 0) + (vac?.arrastre ?? 0) + (vac?.ajuste ?? 0), pendientes: vac?.pendientes ?? 0, unidad: vac?.unidad ?? 'laborables', proxima: prox ?? null };
  }

  if (ctx.modules.has('nom') && can(ctx, 'nom.ver')) {
    const rs = await db.select().from(nomRecibos).where(eq(nomRecibos.personaId, pid)).orderBy(desc(nomRecibos.publicadoEn)).limit(20);
    const u = rs[0];
    out.nominas = { ultimo: u ? { id: u.id, titulo: u.titulo, publicadoEn: u.publicadoEn.toISOString(), leido: !!u.leidoEn } : null, sinLeer: rs.filter((r) => !r.leidoEn).length };
  }

  const [f] = await db.select({ n: sql<number>`count(*)::int` }).from(firmas).where(and(eq(firmas.personaId, pid), eq(firmas.estado, 'pendiente')));
  let firmasPendientes = f?.n ?? 0;
  if (ctx.modules.has('fic')) {
    const [e] = await db.select({ n: sql<number>`count(*)::int` }).from(ficPrl).where(and(eq(ficPrl.personaId, pid), isNull(ficPrl.firmadoEn), inArray(ficPrl.tipo, ['epi', 'informacion'])));
    firmasPendientes += e?.n ?? 0;
    const [c] = await db.select({ id: ficCambios.id }).from(ficCambios).where(and(eq(ficCambios.personaId, pid), eq(ficCambios.estado, 'pendiente'))).limit(1);
    out.datosPendientes = !!c;
  }
  out.firmasPendientes = firmasPendientes;

  const [a] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(anuncios)
    .where(
      and(
        eq(anuncios.empresaId, ctx.empresaId),
        isNull(anuncios.archivadoEn),
        or(isNull(anuncios.caduca), gte(anuncios.caduca, hoy)),
        sql`NOT EXISTS (SELECT 1 FROM anuncio_lecturas l WHERE l.anuncio_id = ${anuncios.id} AND l.persona_id = ${pid})`,
        or(sql`cardinality(${anuncios.departamentos}) = 0`, ctx.departamentoId ? sql`${ctx.departamentoId} = ANY(${anuncios.departamentos})` : sql`false`),
      ),
    );
  out.avisosSinLeer = a?.n ?? 0;
  return out;
}

async function routes(app: FastifyInstance) {
  app.get('/resumen', async (req) => resumen(req.ctx));
}

export default defineModule({ code: 'por', routes });
