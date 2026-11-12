import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { fmtHours, horShared, nomShared, optionLabel, type ApprovalItem, type DashboardWidget } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { centros, empresas, personas } from '../../db/schema/core';
import { audit } from '../../core/audit';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../core/auth';
import { config } from '../../config';
import { systemCtx, type Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { HttpError, badRequest, conflict, forbidden, notFound, parse, unauthorized } from '../../core/errors';
import { activeModules, defineModule } from '../../core/modules';
import { notify } from '../../core/notify';
import { can, canOnOwner, guard } from '../../core/permissions';
import { getEmpresa } from '../../core/settings';
import { marcaPublica } from '../../core/marca-publica';
import { ficTrabajadores } from '../fic/schema';
import { condAlcance, exigirPersona, idsEnAlcance, nombrePersona, nombres, personaPorId, personasActivas } from '../fic/personas';
import { horAnulaciones, horAsignaciones, horBolsa, horCorrecciones, horCuadrante, horFichajes, horFirmasMes, horKioscos, horPines, horTurnos } from './schema';
import { calcularDias, cargarDatos, estadoActual, estadosAhora, hashResumen, jornadas, totales, turnoDelDia } from './calculo';
import { registroExcel, registroPdf, type HojaRegistro } from './registro';
import { addDays, distanciaM, fechaMadrid, horaMadrid, hoyMadrid, limitesMes, lunesDe, madridAInstante, mesActual, rangoDias, redondear } from './tiempo';
import { seedHor } from './seed';

const { TRANSICIONES, FICHAJE_TIPOS, turnoResource, asignacionResource, INCIDENCIA_TIPOS } = horShared;
type FichajeTipo = horShared.FichajeTipo;
const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
const mesRe = /^\d{4}-\d{2}$/;

/* ──────────────── Fichaje ──────────────── */

export interface NuevoFichaje {
  empresaId: string;
  personaId: string;
  tipo?: FichajeTipo | null;
  origen: 'web' | 'movil' | 'kiosco';
  lat?: number | null;
  lng?: number | null;
  precision?: number | null;
  kioscoId?: string | null;
  centroId?: string | null;
  nota?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  registradoPor?: string | null;
}

/** Registra un fichaje con la hora del servidor. Comprueba la secuencia y la geovalla. */
export async function registrarFichaje(tx: Tx, ctx: Ctx, f: NuevoFichaje) {
  // un fichaje cada vez por persona (evita dobles pulsaciones simultáneas)
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'hor:' + f.personaId}))`);
  const { estado } = await estadoActual(tx, f.personaId);
  const permitidos = TRANSICIONES[estado];
  const tipo = (f.tipo ?? (estado === 'fuera' ? 'entrada' : estado === 'pausa' ? 'pausa_fin' : 'salida')) as FichajeTipo;
  if (!permitidos.includes(tipo)) {
    const msg: Record<string, string> = {
      fuera: 'Ahora mismo no estás trabajando: primero tienes que fichar la entrada.',
      trabajando: 'Ya has fichado la entrada. Puedes iniciar una pausa o fichar la salida.',
      pausa: 'Estás en pausa: primero termina la pausa o ficha la salida.',
    };
    throw conflict(msg[estado]!, { estado });
  }
  let dentro: boolean | null = null;
  let centroId = f.centroId ?? null;
  if (f.kioscoId) dentro = true;
  else if (f.lat !== null && f.lat !== undefined && f.lng !== null && f.lng !== undefined) {
    const cs = await tx
      .select({ id: centros.id, lat: centros.lat, lng: centros.lng, radio: centros.radioGeovalla })
      .from(centros)
      .where(and(eq(centros.empresaId, f.empresaId), eq(centros.activo, true), isNull(centros.archivadoEn)));
    let best: { id: string; d: number; radio: number } | null = null;
    for (const c of cs) {
      if (c.lat === null || c.lng === null) continue;
      const d = distanciaM(f.lat, f.lng, Number(c.lat), Number(c.lng));
      if (!best || d < best.d) best = { id: c.id, d, radio: c.radio };
    }
    if (best) {
      dentro = best.d <= best.radio + Math.min(f.precision ?? 0, 50);
      centroId = best.id;
    }
  }
  const [row] = await tx
    .insert(horFichajes)
    .values({
      empresaId: f.empresaId,
      personaId: f.personaId,
      tipo,
      origen: f.origen,
      lat: f.lat ?? null,
      lng: f.lng ?? null,
      precision: f.precision ? Math.round(f.precision) : null,
      dentroGeovalla: dentro,
      centroId,
      kioscoId: f.kioscoId ?? null,
      nota: f.nota ?? null,
      ip: f.ip ?? null,
      userAgent: f.userAgent?.slice(0, 300) ?? null,
      registradoPor: f.registradoPor ?? null,
    })
    .returning();
  await audit(tx, ctx, 'fichar', 'hor_fichaje', row!.id, { tipo, origen: f.origen, dentroGeovalla: dentro });
  return row!;
}

const ficharSchema = z.object({
  tipo: z.enum(['entrada', 'salida', 'pausa_inicio', 'pausa_fin']).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  precision: z.number().min(0).max(100000).nullish(),
  origen: z.enum(['web', 'movil']).default('web'),
  nota: z.string().trim().max(300).nullish(),
});

/** Resumen de hoy y de la semana para la pantalla de fichar. */
async function resumenPersona(ctx: Ctx, personaId: string) {
  const hoy = hoyMadrid();
  const lunes = lunesDe(hoy);
  const domingo = addDays(lunes, 6);
  const datos = await cargarDatos(db, ctx.empresaId, [personaId], lunes, addDays(domingo, 1), ctx.modules);
  const semana = calcularDias(datos, personaId, lunes, domingo);
  const dia = semana.find((d) => d.fecha === hoy)!;
  const est = await estadoActual(db, personaId);
  const [pin] = await db.select({ p: horPines.personaId }).from(horPines).where(eq(horPines.personaId, personaId));
  const manana = turnoDelDia(datos, personaId, addDays(hoy, 1));
  return {
    estado: est.estado,
    desde: est.desde,
    ultimo: est.ultimo ? { tipo: est.ultimo.tipo, momento: est.ultimo.momento } : null,
    permitidos: TRANSICIONES[est.estado],
    hoy: dia,
    semana: { dias: semana, ...totales(semana) },
    tienePin: !!pin,
    proximoTurno: manana.turno ? { fecha: addDays(hoy, 1), nombre: manana.turno.nombre, horaInicio: manana.turno.horaInicio, horaFin: manana.turno.horaFin } : null,
    servidor: new Date().toISOString(),
  };
}

async function resumenMes(ctx: Ctx, personaId: string, mes: string) {
  const { desde, hasta, anio, m } = limitesMes(mes);
  const p = await personaPorId(db, ctx.empresaId, personaId);
  if (!p) throw notFound('Persona no encontrada');
  const dias = (await jornadas(db, ctx.empresaId, [personaId], desde, hasta, ctx.modules)).get(personaId)!;
  const hash = await hashResumen(personaId, mes, dias);
  const [firma] = await db.select().from(horFirmasMes).where(and(eq(horFirmasMes.personaId, personaId), eq(horFirmasMes.anio, anio), eq(horFirmasMes.mes, m)));
  const [bolsa] = await db.select({ saldo: sql<number>`coalesce(sum(${horBolsa.horas}), 0)::float` }).from(horBolsa).where(eq(horBolsa.personaId, personaId));
  return {
    persona: p,
    mes,
    nombreMes: nomShared.nombrePeriodo(anio, m),
    dias,
    totales: totales(dias),
    hash,
    firma: firma ? { firmadoEn: firma.firmadoEn, vigente: firma.hash === hash, resumen: firma.resumen } : null,
    puedeFirmar: personaId === ctx.personaId && mes < mesActual() && !firma,
    saldoBolsa: redondear(bolsa?.saldo ?? 0),
  };
}

async function personasConsulta(ctx: Ctx, req: FastifyRequest): Promise<string[]> {
  const q = req.query as { personaId?: string; departamentoId?: string };
  if (q.personaId) {
    if (q.personaId !== ctx.personaId) await exigirPersona(ctx, 'hor.ver', q.personaId);
    return [q.personaId];
  }
  const ids = await idsEnAlcance(ctx, 'hor.ver');
  const lista = await personasActivas(db, ctx.empresaId, ids);
  return lista.filter((p) => !q.departamentoId || p.departamentoId === q.departamentoId).map((p) => p.id);
}

/* ──────────────── Rutas ──────────────── */

async function routes(app: FastifyInstance) {
  /* Mi estado (pantalla de fichar) */
  app.get('/estado', { preHandler: guard('hor.fichar') }, async (req) => {
    if (!req.ctx.personaId) throw badRequest('Tu usuario no está asociado a ninguna persona');
    return resumenPersona(req.ctx, req.ctx.personaId);
  });

  app.post('/fichar', { preHandler: guard('hor.fichar'), config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const ctx = req.ctx;
    if (!ctx.personaId) throw badRequest('Tu usuario no está asociado a ninguna persona');
    const body = parse(ficharSchema, req.body);
    const row = await db.transaction((tx) =>
      registrarFichaje(tx, ctx, {
        empresaId: ctx.empresaId,
        personaId: ctx.personaId!,
        tipo: body.tipo ?? null,
        origen: body.origen,
        lat: body.lat,
        lng: body.lng,
        precision: body.precision,
        nota: body.nota,
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] ?? ''),
        registradoPor: ctx.usuarioId,
      }),
    );
    return { fichaje: row, ...(await resumenPersona(ctx, ctx.personaId)) };
  });

  /* Fichajes en bruto (incluye anulados) */
  app.get('/fichajes', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { personaId?: string; desde?: string; hasta?: string };
    const desde = q.desde && fechaRe.test(q.desde) ? q.desde : addDays(hoyMadrid(), -7);
    const hasta = q.hasta && fechaRe.test(q.hasta) ? q.hasta : hoyMadrid();
    const ids = await personasConsulta(ctx, req);
    if (!ids.length) return [];
    const rows = await db
      .select({ f: horFichajes, anulado: sql<boolean>`${horAnulaciones.id} IS NOT NULL`, motivoAnulacion: horAnulaciones.motivo, nombre: nombrePersona })
      .from(horFichajes)
      .innerJoin(personas, eq(personas.id, horFichajes.personaId))
      .leftJoin(horAnulaciones, eq(horAnulaciones.fichajeId, horFichajes.id))
      .where(and(inArray(horFichajes.personaId, ids), gte(horFichajes.momento, madridAInstante(desde, '00:00')), lte(horFichajes.momento, madridAInstante(addDays(hasta, 1), '00:00'))))
      .orderBy(desc(horFichajes.momento))
      .limit(2000);
    return rows.map((r) => ({ ...r.f, ip: undefined, userAgent: undefined, persona: r.nombre, anulado: r.anulado, motivoAnulacion: r.motivoAnulacion, fecha: fechaMadrid(r.f.momento), hora: horaMadrid(r.f.momento) }));
  });

  /* Jornada calculada día a día */
  app.get('/dias', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { desde?: string; hasta?: string };
    const desde = q.desde && fechaRe.test(q.desde) ? q.desde : lunesDe(hoyMadrid());
    const hasta = q.hasta && fechaRe.test(q.hasta) ? q.hasta : addDays(desde, 6);
    if (rangoDias(desde, hasta).length > 92) throw badRequest('Consulta como máximo tres meses');
    const ids = await personasConsulta(ctx, req);
    const m = await jornadas(db, ctx.empresaId, ids, desde, hasta, ctx.modules);
    const n = await nombres(db, ids);
    return ids.map((id) => ({ personaId: id, nombre: n[id], dias: m.get(id)!, totales: totales(m.get(id)!) }));
  });

  /* Resumen mensual (y firma) */
  app.get('/mes', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { personaId?: string; mes?: string };
    const personaId = q.personaId ?? ctx.personaId;
    if (!personaId) throw badRequest('Indica la persona');
    if (personaId !== ctx.personaId) await exigirPersona(ctx, 'hor.ver', personaId);
    return resumenMes(ctx, personaId, q.mes && mesRe.test(q.mes) ? q.mes : mesActual());
  });

  app.post('/mes/firmar', { preHandler: guard('hor.fichar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(z.object({ mes: z.string().regex(mesRe), firma: z.string().startsWith('data:image/png;base64,').max(800_000), hash: z.string().length(64) }), req.body);
    if (!ctx.personaId) throw forbidden();
    if (body.mes >= mesActual()) throw badRequest('Solo puedes firmar meses ya terminados');
    const r = await resumenMes(ctx, ctx.personaId, body.mes);
    if (r.firma) throw badRequest('Ya has firmado este mes');
    if (r.hash !== body.hash) throw conflict('El registro ha cambiado mientras lo revisabas. Vuelve a cargarlo antes de firmar.');
    const { anio, m } = limitesMes(body.mes);
    await db.transaction(async (tx) => {
      await tx.insert(horFirmasMes).values({
        empresaId: ctx.empresaId,
        personaId: ctx.personaId!,
        anio,
        mes: m,
        hash: r.hash,
        resumen: { trabajadas: r.totales.trabajadas, extra: r.totales.extra, nocturnas: r.totales.nocturnas, dias: r.totales.diasTrabajados },
        firmaImagen: body.firma,
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
      });
      await audit(tx, ctx, 'firmar_registro_mes', 'hor_registro', ctx.personaId, { mes: body.mes, hash: r.hash });
    });
    return { ok: true };
  });

  /* Registro para la Inspección de Trabajo (Excel o PDF) */
  app.get('/registro', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { mes?: string; format?: string };
    const mes = q.mes && mesRe.test(q.mes) ? q.mes : mesActual();
    const { desde, hasta, anio, m } = limitesMes(mes);
    const ids = await personasConsulta(ctx, req);
    const emp = await getEmpresa(ctx.empresaId);
    const lista = await personasActivas(db, ctx.empresaId, ids, true);
    const fichas = ids.length ? await db.select({ personaId: ficTrabajadores.personaId, dni: ficTrabajadores.dni, nss: ficTrabajadores.nss }).from(ficTrabajadores).where(inArray(ficTrabajadores.personaId, ids)) : [];
    const cs = await db.select({ id: centros.id, nombre: centros.nombre }).from(centros).where(eq(centros.empresaId, ctx.empresaId));
    const firmas = ids.length ? await db.select().from(horFirmasMes).where(and(inArray(horFirmasMes.personaId, ids), eq(horFirmasMes.anio, anio), eq(horFirmasMes.mes, m))) : [];
    const jm = await jornadas(db, ctx.empresaId, ids, desde, hasta, ctx.modules);
    const hojas: HojaRegistro[] = [];
    for (const p of lista) {
      const dias = jm.get(p.id) ?? [];
      const f = fichas.find((x) => x.personaId === p.id);
      const fm = firmas.find((x) => x.personaId === p.id);
      hojas.push({
        persona: { nombre: p.nombre, dni: f?.dni ?? null, nss: f?.nss ?? null, centro: cs.find((c) => c.id === p.centroId)?.nombre ?? null, puesto: p.puesto },
        dias,
        firma: fm ? { firmadoEn: fm.firmadoEn, imagen: fm.firmaImagen, vigente: fm.hash === (await hashResumen(p.id, mes, dias)) } : null,
      });
    }
    await audit(db, ctx, 'exportar_registro', 'hor_registro', null, { mes, personas: ids.length, formato: q.format ?? 'xlsx' });
    const base = `registro-jornada-${mes}${ids.length === 1 ? '-' + (lista[0]?.nombre ?? '').replace(/\s+/g, '-').toLowerCase() : ''}`;
    if (q.format === 'pdf') return { __file: true, buffer: await registroPdf(emp, anio, m, hojas), mime: 'application/pdf', name: `${base}.pdf`, inline: true };
    return { __file: true, buffer: await registroExcel(emp, anio, m, hojas), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `${base}.xlsx` };
  });

  /* Quién está trabajando ahora */
  app.get('/ahora', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const ids = await personasConsulta(ctx, req);
    const lista = await personasActivas(db, ctx.empresaId, ids);
    const est = await estadosAhora(
      db,
      lista.map((p) => p.id),
    );
    const hoy = hoyMadrid();
    const jm = await jornadas(
      db,
      ctx.empresaId,
      lista.map((p) => p.id),
      hoy,
      hoy,
      ctx.modules,
    );
    return lista.map((p) => {
      const e = est.get(p.id);
      const dia = jm.get(p.id)?.[0];
      return {
        personaId: p.id,
        nombre: p.nombre,
        puesto: p.puesto,
        departamento: p.departamento,
        estado: e?.estado ?? 'fuera',
        desde: e?.desde ?? null,
        ultimo: e?.ultimo ? { tipo: e.ultimo.tipo, momento: e.ultimo.momento, dentroGeovalla: e.ultimo.dentroGeovalla, origen: e.ultimo.origen } : null,
        horasHoy: dia?.trabajadas ?? 0,
        turno: dia?.turno ?? null,
        ausencia: dia?.ausencia ?? null,
        festivo: dia?.festivo ?? null,
        incidencias: dia?.incidencias ?? [],
      };
    });
  });

  /* Incidencias (calculadas) */
  app.get('/incidencias', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { desde?: string; hasta?: string; tipo?: string };
    const hasta = q.hasta && fechaRe.test(q.hasta) ? q.hasta : hoyMadrid();
    const desde = q.desde && fechaRe.test(q.desde) ? q.desde : addDays(hasta, -6);
    if (rangoDias(desde, hasta).length > 62) throw badRequest('Consulta como máximo dos meses');
    const ids = await personasConsulta(ctx, req);
    const jm = await jornadas(db, ctx.empresaId, ids, desde, hasta, ctx.modules);
    const n = await nombres(db, ids);
    const pend = ids.length
      ? await db.select({ personaId: horCorrecciones.personaId, fecha: horCorrecciones.fecha }).from(horCorrecciones).where(and(inArray(horCorrecciones.personaId, ids), eq(horCorrecciones.estado, 'pendiente'), gte(horCorrecciones.fecha, desde)))
      : [];
    const out = [];
    for (const [pid, dias] of jm)
      for (const d of dias)
        for (const i of d.incidencias)
          if (!q.tipo || i.tipo === q.tipo)
            out.push({ id: `${pid}-${d.fecha}-${i.tipo}`, personaId: pid, nombre: n[pid], fecha: d.fecha, tipo: i.tipo, detalle: i.detalle, trabajadas: d.trabajadas, correccionPendiente: pend.some((c) => c.personaId === pid && c.fecha === d.fecha) });
    return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  });

  /* ── Correcciones ── */
  app.get('/correcciones', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { estado?: string; personaId?: string; mias?: string };
    if (q.mias) q.personaId = ctx.personaId ?? '00000000-0000-0000-0000-000000000000';
    const conds = [eq(horCorrecciones.empresaId, ctx.empresaId), await condAlcance(ctx, 'hor.ver', horCorrecciones.personaId)];
    if (q.estado) conds.push(eq(horCorrecciones.estado, q.estado));
    if (q.personaId) conds.push(eq(horCorrecciones.personaId, q.personaId));
    const rows = await db
      .select({ c: horCorrecciones, nombre: nombrePersona, original: { tipo: horFichajes.tipo, momento: horFichajes.momento } })
      .from(horCorrecciones)
      .innerJoin(personas, eq(personas.id, horCorrecciones.personaId))
      .leftJoin(horFichajes, eq(horFichajes.id, horCorrecciones.fichajeId))
      .where(and(...conds))
      .orderBy(desc(horCorrecciones.creadoEn))
      .limit(300);
    const out = [];
    for (const r of rows)
      out.push({
        ...r.c,
        persona: r.nombre,
        original: r.original?.tipo ? { tipo: r.original.tipo, hora: horaMadrid(r.original.momento!) } : null,
        nuevaHora: r.c.nuevoMomento ? horaMadrid(r.c.nuevoMomento) : null,
        puedeAprobar: r.c.estado === 'pendiente' && r.c.personaId !== ctx.personaId && (await canOnOwner(ctx, 'hor.aprobar', r.c.personaId)),
      });
    return out;
  });

  const correccionSchema = z.object({
    personaId: z.string().uuid().nullish(),
    fecha: z.string().regex(fechaRe, 'Fecha no válida'),
    tipo: z.enum(['anadir', 'modificar', 'anular']),
    fichajeId: z.string().uuid().nullish(),
    nuevoTipo: z.enum(['entrada', 'salida', 'pausa_inicio', 'pausa_fin']).nullish(),
    hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora no válida').nullish(),
    motivo: z.string().trim().min(3, 'Explica el motivo').max(1000),
  });
  app.post('/correcciones', { preHandler: guard('hor.fichar') }, async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(correccionSchema, req.body);
    const personaId = b.personaId ?? ctx.personaId;
    if (!personaId) throw badRequest('Indica la persona');
    if (personaId !== ctx.personaId && !(await canOnOwner(ctx, 'hor.aprobar', personaId))) throw forbidden('Solo puedes pedir correcciones de tus propios fichajes');
    if (b.fecha > hoyMadrid()) throw badRequest('No se pueden corregir días futuros');
    let nuevoMomento: Date | null = null;
    let nuevoTipo = b.nuevoTipo ?? null;
    if (b.tipo !== 'anular') {
      if (!b.hora) throw badRequest('Indica la hora correcta');
      nuevoMomento = madridAInstante(b.fecha, b.hora);
      if (nuevoMomento.getTime() > Date.now()) throw badRequest('La hora indicada todavía no ha llegado');
    }
    if (b.tipo !== 'anadir') {
      if (!b.fichajeId) throw badRequest('Indica el fichaje que quieres corregir');
      const [f] = await db.select().from(horFichajes).where(and(eq(horFichajes.id, b.fichajeId), eq(horFichajes.personaId, personaId)));
      if (!f) throw notFound('Fichaje no encontrado');
      const [an] = await db.select().from(horAnulaciones).where(eq(horAnulaciones.fichajeId, f.id));
      if (an) throw badRequest('Ese fichaje ya está anulado');
      if (b.tipo === 'modificar') nuevoTipo = (nuevoTipo ?? f.tipo) as FichajeTipo;
    } else if (!nuevoTipo) throw badRequest('Indica qué fichaje falta (entrada, salida o pausa)');
    const [dup] = await db
      .select({ id: horCorrecciones.id })
      .from(horCorrecciones)
      .where(and(eq(horCorrecciones.personaId, personaId), eq(horCorrecciones.estado, 'pendiente'), b.fichajeId ? eq(horCorrecciones.fichajeId, b.fichajeId) : sql`false`));
    if (dup) throw conflict('Ya hay una corrección pendiente para ese fichaje');
    const row = await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(horCorrecciones)
        .values({ empresaId: ctx.empresaId, personaId, fecha: b.fecha, tipo: b.tipo, fichajeId: b.fichajeId ?? null, nuevoTipo, nuevoMomento, motivo: b.motivo, solicitadoPor: ctx.usuarioId })
        .returning();
      await audit(tx, ctx, 'solicitar_correccion', 'hor_correccion', c!.id, c);
      const [p] = await tx.select({ resp: personas.responsableId }).from(personas).where(eq(personas.id, personaId));
      const quien = personaId === ctx.personaId ? ctx.nombre : await nombres(tx, [personaId]).then((n) => n[personaId]);
      await notify(tx, ctx, {
        modulo: 'hor',
        tipo: 'correccion',
        titulo: `${quien} pide corregir un fichaje del ${b.fecha.split('-').reverse().join('/')}`,
        cuerpo: b.motivo,
        enlace: '/bandeja',
        personaIds: p?.resp ? [p.resp] : [],
        permiso: p?.resp ? undefined : 'hor.gestionar',
      });
      return c!;
    });
    reply.code(201);
    return row;
  });

  async function correccionRevisable(ctx: Ctx, id: string) {
    const [c] = await db.select().from(horCorrecciones).where(and(eq(horCorrecciones.id, id), eq(horCorrecciones.empresaId, ctx.empresaId)));
    if (!c) throw notFound('Corrección no encontrada');
    if (c.estado !== 'pendiente') throw badRequest('Esta corrección ya está resuelta');
    if (c.personaId === ctx.personaId) throw forbidden('No puedes aprobar tus propias correcciones');
    if (!(await canOnOwner(ctx, 'hor.aprobar', c.personaId))) throw forbidden('Esta persona no está en tu equipo');
    return c;
  }

  app.post('/correcciones/:id/aprobar', async (req) => {
    const ctx = req.ctx;
    const c = await correccionRevisable(ctx, (req.params as { id: string }).id);
    await db.transaction(async (tx) => {
      if (c.fichajeId) {
        const [an] = await tx.select().from(horAnulaciones).where(eq(horAnulaciones.fichajeId, c.fichajeId));
        if (an) throw badRequest('El fichaje original ya estaba anulado');
        await tx.insert(horAnulaciones).values({ empresaId: ctx.empresaId, fichajeId: c.fichajeId, correccionId: c.id, motivo: c.motivo, anuladoPor: ctx.usuarioId });
      }
      if (c.nuevoMomento && c.nuevoTipo)
        await tx.insert(horFichajes).values({
          empresaId: ctx.empresaId,
          personaId: c.personaId,
          tipo: c.nuevoTipo,
          momento: c.nuevoMomento,
          origen: 'correccion',
          correccionId: c.id,
          nota: c.motivo.slice(0, 300),
          registradoPor: ctx.usuarioId,
          ip: req.ip,
        });
      await tx.update(horCorrecciones).set({ estado: 'aprobada', revisadoPor: ctx.usuarioId, revisadoEn: new Date() }).where(eq(horCorrecciones.id, c.id));
      await audit(tx, ctx, 'aprobar_correccion', 'hor_correccion', c.id, { tipo: c.tipo, fichajeId: c.fichajeId, nuevoMomento: c.nuevoMomento });
      await notify(tx, ctx, { modulo: 'hor', tipo: 'correccion_aprobada', titulo: `Corrección aprobada: ${c.fecha.split('-').reverse().join('/')}`, enlace: '/fichar?tab=mes', personaIds: [c.personaId] });
    });
    return { ok: true };
  });

  app.post('/correcciones/:id/rechazar', async (req) => {
    const ctx = req.ctx;
    const c = await correccionRevisable(ctx, (req.params as { id: string }).id);
    const { motivo } = parse(z.object({ motivo: z.string().trim().max(1000).nullish() }), req.body ?? {});
    await db.transaction(async (tx) => {
      await tx.update(horCorrecciones).set({ estado: 'rechazada', revisadoPor: ctx.usuarioId, revisadoEn: new Date(), motivoRechazo: motivo ?? null }).where(eq(horCorrecciones.id, c.id));
      await audit(tx, ctx, 'rechazar_correccion', 'hor_correccion', c.id, { motivo });
      await notify(tx, ctx, { modulo: 'hor', tipo: 'correccion_rechazada', titulo: `Corrección rechazada: ${c.fecha.split('-').reverse().join('/')}`, cuerpo: motivo ?? null, enlace: '/fichar?tab=mes', personaIds: [c.personaId] });
    });
    return { ok: true };
  });

  /* ── Turnos, asignaciones y cuadrante ── */
  const diasSchema = z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Elige al menos un día').max(7);
  registerCrud(app, {
    path: '/turnos',
    resource: turnoResource,
    table: horTurnos,
    entity: 'hor_turno',
    perms: { ver: ['hor.ver', 'hor.fichar'], crear: 'hor.gestionar' },
    beforeSave: async (_tx, _ctx, data) => {
      if (data.dias !== undefined) data.dias = [...new Set(parse(diasSchema, data.dias))].sort();
      return data;
    },
  });
  registerCrud(app, {
    path: '/asignaciones',
    resource: asignacionResource,
    table: horAsignaciones,
    entity: 'hor_asignacion',
    perms: { ver: 'hor.ver', crear: 'hor.gestionar' },
    scopeCol: horAsignaciones.personaId,
    hardDelete: true,
    beforeSave: async (_tx, _ctx, data, existing) => {
      const desde = data.desde ?? existing?.desde;
      const hasta = data.hasta === undefined ? existing?.hasta : data.hasta;
      if (hasta && desde && hasta < desde) throw badRequest('La fecha de fin es anterior a la de inicio');
      return data;
    },
  });

  app.get('/cuadrante', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { desde?: string; departamentoId?: string; dias?: string };
    const desde = lunesDe(q.desde && fechaRe.test(q.desde) ? q.desde : hoyMadrid());
    const n = Math.min(31, Math.max(7, Number(q.dias) || 7));
    const hasta = addDays(desde, n - 1);
    const ids = await personasConsulta(ctx, req);
    const lista = await personasActivas(db, ctx.empresaId, ids);
    const datos = await cargarDatos(
      db,
      ctx.empresaId,
      lista.map((p) => p.id),
      desde,
      hasta,
      ctx.modules,
    );
    const turnos = [...datos.turnos.values()];
    const dias = rangoDias(desde, hasta);
    return {
      desde,
      hasta,
      dias,
      turnos,
      editable: can(ctx, 'hor.gestionar'),
      filas: lista.map((p) => {
        const calc = calcularDias(datos, p.id, desde, hasta);
        return {
          persona: { id: p.id, nombre: p.nombre, departamento: p.departamento, puesto: p.puesto },
          celdas: calc.map((d) => ({
            fecha: d.fecha,
            turnoId: d.turno?.id ?? null,
            libre: !d.turno,
            excepcion: datos.cuadrante.has(`${p.id}|${d.fecha}`),
            festivo: d.festivo,
            ausencia: d.ausencia,
            previstas: d.previstas,
          })),
          horas: redondear(calc.reduce((a, d) => a + d.previstas, 0)),
        };
      }),
    };
  });

  app.put('/cuadrante', { preHandler: guard('hor.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const body = parse(
      z.object({
        celdas: z
          .array(z.object({ personaId: z.string().uuid(), fecha: z.string().regex(fechaRe), turnoId: z.string().uuid().nullish(), libre: z.boolean().optional(), quitar: z.boolean().optional() }))
          .min(1)
          .max(500),
      }),
      req.body,
    );
    const ids = [...new Set(body.celdas.map((c) => c.personaId))];
    const validos = await personasActivas(db, ctx.empresaId, ids, true);
    if (validos.length !== ids.length) throw badRequest('Alguna persona no existe');
    await db.transaction(async (tx) => {
      for (const c of body.celdas) {
        if (c.quitar) {
          await tx.delete(horCuadrante).where(and(eq(horCuadrante.personaId, c.personaId), eq(horCuadrante.fecha, c.fecha)));
          continue;
        }
        const values = { empresaId: ctx.empresaId, personaId: c.personaId, fecha: c.fecha, turnoId: c.libre ? null : (c.turnoId ?? null), libre: !!c.libre || !c.turnoId, actualizadoPor: ctx.usuarioId };
        await tx
          .insert(horCuadrante)
          .values(values)
          .onConflictDoUpdate({ target: [horCuadrante.personaId, horCuadrante.fecha], set: { turnoId: values.turnoId, libre: values.libre, actualizadoPor: ctx.usuarioId, actualizadoEn: new Date() } });
      }
      await audit(tx, ctx, 'editar_cuadrante', 'hor_cuadrante', null, { celdas: body.celdas.length });
    });
    return { ok: true };
  });

  /* ── Quioscos y PIN ── */
  app.get('/kioscos', { preHandler: guard('hor.gestionar') }, async (req) => {
    const rows = await db
      .select({ id: horKioscos.id, nombre: horKioscos.nombre, centroId: horKioscos.centroId, centro: centros.nombre, activo: horKioscos.activo, ultimoUso: horKioscos.ultimoUso, creadoEn: horKioscos.creadoEn })
      .from(horKioscos)
      .innerJoin(centros, eq(centros.id, horKioscos.centroId))
      .where(eq(horKioscos.empresaId, req.ctx.empresaId))
      .orderBy(asc(horKioscos.nombre));
    return rows;
  });
  app.post('/kioscos', { preHandler: guard('hor.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const b = parse(z.object({ nombre: z.string().trim().min(1).max(100), centroId: z.string().uuid() }), req.body);
    const [c] = await db.select().from(centros).where(and(eq(centros.id, b.centroId), eq(centros.empresaId, ctx.empresaId)));
    if (!c) throw badRequest('Centro no válido');
    const token = randomToken(24);
    const k = await db.transaction(async (tx) => {
      const [k] = await tx.insert(horKioscos).values({ empresaId: ctx.empresaId, nombre: b.nombre, centroId: b.centroId, tokenHash: sha256(token) }).returning();
      await audit(tx, ctx, 'crear', 'hor_kiosco', k!.id, { nombre: b.nombre });
      return k!;
    });
    return { id: k.id, token, url: `${config.appUrl}/publico/kiosco/${token}` };
  });
  app.post('/kioscos/:id/token', { preHandler: guard('hor.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const token = randomToken(24);
    const r = await db.transaction(async (tx) => {
      const r = await tx.update(horKioscos).set({ tokenHash: sha256(token) }).where(and(eq(horKioscos.id, id), eq(horKioscos.empresaId, ctx.empresaId))).returning();
      await audit(tx, ctx, 'regenerar_token', 'hor_kiosco', id);
      return r;
    });
    if (!r.length) throw notFound();
    return { token, url: `${config.appUrl}/publico/kiosco/${token}` };
  });
  app.patch('/kioscos/:id', { preHandler: guard('hor.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(z.object({ nombre: z.string().trim().min(1).optional(), activo: z.boolean().optional() }), req.body);
    const r = await db.transaction(async (tx) => {
      const r = await tx.update(horKioscos).set(b).where(and(eq(horKioscos.id, id), eq(horKioscos.empresaId, ctx.empresaId))).returning();
      await audit(tx, ctx, 'editar', 'hor_kiosco', id, b);
      return r;
    });
    if (!r.length) throw notFound();
    return { ok: true };
  });

  app.post('/pin', { preHandler: guard('hor.fichar'), config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req) => {
    const ctx = req.ctx;
    const b = parse(z.object({ pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener de 4 a 6 números'), personaId: z.string().uuid().nullish() }), req.body);
    const personaId = b.personaId ?? ctx.personaId;
    if (!personaId) throw badRequest('Indica la persona');
    if (personaId !== ctx.personaId && !can(ctx, 'hor.gestionar')) throw forbidden();
    if (/^(\d)\1+$/.test(b.pin) || '0123456789'.includes(b.pin) || '9876543210'.includes(b.pin)) throw badRequest('Elige un PIN menos evidente (no repitas ni sigas una secuencia)');
    const pinHash = await hashPassword(b.pin);
    await db.transaction(async (tx) => {
      await tx
        .insert(horPines)
        .values({ personaId, empresaId: ctx.empresaId, pinHash })
        .onConflictDoUpdate({ target: horPines.personaId, set: { pinHash, intentos: 0, bloqueadoHasta: null, actualizadoEn: new Date() } });
      await audit(tx, ctx, 'cambiar_pin', 'hor_pin', personaId);
    });
    return { ok: true };
  });

  /* ── Quiosco público (tableta en la entrada, sin sesión) ── */
  async function kioscoPorToken(token: string) {
    const [k] = await db.select().from(horKioscos).where(eq(horKioscos.tokenHash, sha256(token)));
    if (!k || !k.activo) throw notFound('Este quiosco no existe o está desactivado');
    const mods = await activeModules(k.empresaId);
    if (!mods.has('hor')) throw notFound('El control horario no está activo');
    return { k, mods };
  }
  app.get('/public/kiosco/:token', { config: { public: true, rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { k } = await kioscoPorToken((req.params as { token: string }).token);
    const [emp] = await db.select({ nombre: empresas.nombre }).from(empresas).where(eq(empresas.id, k.empresaId));
    const [c] = await db.select({ nombre: centros.nombre }).from(centros).where(eq(centros.id, k.centroId));
    const lista = await db
      .select({ id: personas.id, nombre: personas.nombre, apellidos: personas.apellidos })
      .from(personas)
      .innerJoin(horPines, eq(horPines.personaId, personas.id))
      .where(and(eq(personas.empresaId, k.empresaId), eq(personas.centroId, k.centroId), eq(personas.activo, true), isNull(personas.archivadoEn)))
      .orderBy(asc(personas.nombre));
    const est = await estadosAhora(
      db,
      lista.map((p) => p.id),
    );
    db.update(horKioscos).set({ ultimoUso: new Date() }).where(eq(horKioscos.id, k.id)).catch(() => {});
    return {
      empresa: emp?.nombre,
      marca: await marcaPublica(k.empresaId),
      kiosco: k.nombre,
      centro: c?.nombre,
      servidor: new Date().toISOString(),
      personas: lista.map((p) => ({ id: p.id, nombre: `${p.nombre} ${(p.apellidos ?? '').split(' ')[0]?.[0] ?? ''}.`.replace(/ \.$/, ''), estado: est.get(p.id)?.estado ?? 'fuera' })),
    };
  });
  app.post('/public/kiosco/:token/fichar', { config: { public: true, rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { k, mods } = await kioscoPorToken((req.params as { token: string }).token);
    const b = parse(z.object({ personaId: z.string().uuid(), pin: z.string().regex(/^\d{4,6}$/), tipo: z.enum(['entrada', 'salida', 'pausa_inicio', 'pausa_fin']).nullish() }), req.body);
    const [p] = await db
      .select({ id: personas.id, nombre: personas.nombre, centroId: personas.centroId, activo: personas.activo })
      .from(personas)
      .where(and(eq(personas.id, b.personaId), eq(personas.empresaId, k.empresaId)));
    const [pin] = await db.select().from(horPines).where(eq(horPines.personaId, b.personaId));
    if (!p || !p.activo || p.centroId !== k.centroId || !pin) throw unauthorized('PIN incorrecto');
    if (pin.bloqueadoHasta && pin.bloqueadoHasta > new Date()) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos o pide ayuda a tu responsable.', 'locked');
    if (!(await verifyPassword(b.pin, pin.pinHash))) {
      const intentos = pin.intentos + 1;
      await db.update(horPines).set({ intentos, bloqueadoHasta: intentos >= 5 ? new Date(Date.now() + 15 * 60_000) : null }).where(eq(horPines.personaId, b.personaId));
      throw unauthorized(intentos >= 5 ? 'PIN incorrecto. Se ha bloqueado durante 15 minutos.' : 'PIN incorrecto');
    }
    if (pin.intentos) await db.update(horPines).set({ intentos: 0, bloqueadoHasta: null }).where(eq(horPines.personaId, b.personaId));
    const ctx = { ...systemCtx(k.empresaId, mods), personaId: p.id, nombre: p.nombre, ip: req.ip };
    const row = await db.transaction((tx) =>
      registrarFichaje(tx, ctx, { empresaId: k.empresaId, personaId: p.id, tipo: b.tipo ?? null, origen: 'kiosco', kioscoId: k.id, centroId: k.centroId, ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') }),
    );
    const est = await estadoActual(db, p.id);
    const hoy = hoyMadrid();
    const dia = (await jornadas(db, k.empresaId, [p.id], hoy, hoy, mods)).get(p.id)?.[0];
    return { ok: true, nombre: p.nombre, tipo: row.tipo, momento: row.momento, estado: est.estado, horasHoy: dia?.trabajadas ?? 0 };
  });

  /* ── Bolsa de horas ── */
  app.get('/bolsa', { preHandler: guard('hor.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { personaId?: string };
    if (q.personaId) {
      if (q.personaId !== ctx.personaId) await exigirPersona(ctx, 'hor.ver', q.personaId);
      const movs = await db.select().from(horBolsa).where(eq(horBolsa.personaId, q.personaId)).orderBy(desc(horBolsa.fecha), desc(horBolsa.creadoEn));
      return { saldo: redondear(movs.reduce((a, m) => a + Number(m.horas), 0)), movimientos: movs };
    }
    const ids = await idsEnAlcance(ctx, 'hor.ver');
    const lista = await personasActivas(db, ctx.empresaId, ids);
    const sal = lista.length
      ? await db
          .select({ personaId: horBolsa.personaId, saldo: sql<number>`sum(${horBolsa.horas})::float`, ultimo: sql<string>`max(${horBolsa.fecha})` })
          .from(horBolsa)
          .where(
            inArray(
              horBolsa.personaId,
              lista.map((p) => p.id),
            ),
          )
          .groupBy(horBolsa.personaId)
      : [];
    return { personas: lista.map((p) => ({ personaId: p.id, nombre: p.nombre, departamento: p.departamento, saldo: redondear(sal.find((s) => s.personaId === p.id)?.saldo ?? 0), ultimo: sal.find((s) => s.personaId === p.id)?.ultimo ?? null })) };
  });
  app.post('/bolsa', { preHandler: guard('hor.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const b = parse(z.object({ personaId: z.string().uuid(), horas: z.number().refine((n) => n !== 0, 'Indica las horas').refine((n) => Math.abs(n) <= 200), concepto: z.string().trim().min(2).max(200), fecha: z.string().regex(fechaRe).nullish() }), req.body);
    if (!(await personaPorId(db, ctx.empresaId, b.personaId))) throw notFound();
    return db.transaction(async (tx) => {
      const [m] = await tx.insert(horBolsa).values({ empresaId: ctx.empresaId, personaId: b.personaId, horas: b.horas, concepto: b.concepto, fecha: b.fecha ?? hoyMadrid(), origen: 'manual', creadoPor: ctx.usuarioId }).returning();
      await audit(tx, ctx, 'crear', 'hor_bolsa', m!.id, m);
      return m;
    });
  });
  /** Lleva a la bolsa la diferencia entre horas trabajadas y previstas de un mes cerrado. */
  app.post('/bolsa/cerrar-mes', { preHandler: guard('hor.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { mes } = parse(z.object({ mes: z.string().regex(mesRe) }), req.body);
    if (mes >= mesActual()) throw badRequest('Solo se pueden cerrar meses terminados');
    const { desde, hasta } = limitesMes(mes);
    const lista = await personasActivas(db, ctx.empresaId, null);
    const jm = await jornadas(
      db,
      ctx.empresaId,
      lista.map((p) => p.id),
      desde,
      hasta,
      ctx.modules,
    );
    let n = 0;
    await db.transaction(async (tx) => {
      for (const p of lista) {
        const t = totales(jm.get(p.id) ?? []);
        if (!t.diasTrabajados || Math.abs(t.diferencia) < 0.01) continue;
        const r = await tx
          .insert(horBolsa)
          .values({ empresaId: ctx.empresaId, personaId: p.id, fecha: hasta, horas: t.diferencia, concepto: `Diferencia de jornada de ${nomShared.nombrePeriodo(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)))}`, origen: 'mes', periodo: mes, creadoPor: ctx.usuarioId })
          .onConflictDoNothing()
          .returning();
        n += r.length;
      }
      await audit(tx, ctx, 'cerrar_mes_bolsa', 'hor_bolsa', null, { mes, personas: n });
    });
    return { ok: true, personas: n };
  });
}

export default defineModule({
  code: 'hor',
  routes,
  refTargets: {
    'hor.turnos': {
      table: horTurnos,
      id: horTurnos.id,
      label: sql<string>`${horTurnos.nombre} || ' (' || ${horTurnos.horaInicio} || '–' || ${horTurnos.horaFin} || ')'`,
      search: [horTurnos.nombre],
      empresaCol: horTurnos.empresaId,
      archivedCol: horTurnos.archivadoEn,
      perm: ['hor.ver', 'hor.fichar'],
    },
  },
  approvals: async (dbx, ctx): Promise<ApprovalItem[]> => {
    const s = ctx.perms.get('hor.aprobar');
    if (!s) return [];
    const rows = await dbx
      .select({ c: horCorrecciones, nombre: nombrePersona, original: { tipo: horFichajes.tipo, momento: horFichajes.momento } })
      .from(horCorrecciones)
      .innerJoin(personas, eq(personas.id, horCorrecciones.personaId))
      .leftJoin(horFichajes, eq(horFichajes.id, horCorrecciones.fichajeId))
      .where(and(eq(horCorrecciones.empresaId, ctx.empresaId), eq(horCorrecciones.estado, 'pendiente'), await condAlcance(ctx, 'hor.aprobar', horCorrecciones.personaId)))
      .orderBy(asc(horCorrecciones.creadoEn))
      .limit(100);
    return rows
      .filter((r) => r.c.personaId !== ctx.personaId)
      .map((r) => {
        const tipoNuevo = optionLabel(FICHAJE_TIPOS, r.c.nuevoTipo)?.label?.toLowerCase();
        const que =
          r.c.tipo === 'anadir'
            ? `Añadir ${tipoNuevo} a las ${horaMadrid(r.c.nuevoMomento!)}`
            : r.c.tipo === 'anular'
              ? `Anular ${optionLabel(FICHAJE_TIPOS, r.original?.tipo)?.label?.toLowerCase() ?? 'fichaje'} de las ${r.original?.momento ? horaMadrid(r.original.momento) : '?'}`
              : `Cambiar ${optionLabel(FICHAJE_TIPOS, r.original?.tipo)?.label?.toLowerCase() ?? 'fichaje'} de ${r.original?.momento ? horaMadrid(r.original.momento) : '?'} a ${horaMadrid(r.c.nuevoMomento!)}`;
        return {
          id: `hor-${r.c.id}`,
          modulo: 'hor',
          tipo: 'Corrección de fichaje',
          titulo: `${r.nombre} · ${r.c.fecha.split('-').reverse().join('/')}`,
          detalle: `${que}. Motivo: ${r.c.motivo}`,
          solicitante: r.nombre,
          fecha: r.c.creadoEn.toISOString(),
          enlace: '/control-horario?tab=correcciones',
          aprobarUrl: `/api/hor/correcciones/${r.c.id}/aprobar`,
          rechazarUrl: `/api/hor/correcciones/${r.c.id}/rechazar`,
        };
      });
  },
  dashboard: async (dbx, ctx): Promise<DashboardWidget[]> => {
    const out: DashboardWidget[] = [];
    if (ctx.personaId && can(ctx, 'hor.fichar')) {
      const hoy = hoyMadrid();
      const lunes = lunesDe(hoy);
      const d = await cargarDatos(dbx, ctx.empresaId, [ctx.personaId], lunes, addDays(lunes, 6), ctx.modules);
      const t = totales(calcularDias(d, ctx.personaId, lunes, addDays(lunes, 6)));
      out.push({ id: 'hor.mis_horas', modulo: 'hor', titulo: 'Mis horas esta semana', size: 'sm', data: { kind: 'stat', value: t.trabajadas, format: 'hours', hint: `de ${fmtHours(t.previstas)} previstas`, enlace: '/fichar' } });
    }
    const s = ctx.perms.get('hor.ver');
    if (s && s !== 'propio') {
      const ids = (await idsEnAlcance(ctx, 'hor.ver'))?.filter((i) => i !== ctx.personaId) ?? null;
      const lista = (await personasActivas(dbx, ctx.empresaId, ids)).filter((p) => p.id !== ctx.personaId);
      if (lista.length) {
        const est = await estadosAhora(
          dbx,
          lista.map((p) => p.id),
        );
        const trabajando = lista.filter((p) => est.get(p.id)?.estado && est.get(p.id)!.estado !== 'fuera');
        out.push({
          id: 'hor.trabajando',
          modulo: 'hor',
          titulo: 'Trabajando ahora',
          size: 'sm',
          data: { kind: 'stat', value: `${trabajando.length} de ${lista.length}`, hint: `${trabajando.filter((p) => est.get(p.id)!.estado === 'pausa').length} en pausa`, enlace: '/control-horario' },
        });
        const hoy = hoyMadrid();
        const jm = await jornadas(
          dbx,
          ctx.empresaId,
          lista.map((p) => p.id),
          addDays(hoy, -1),
          hoy,
          ctx.modules,
        );
        const items: { titulo: string; subtitulo?: string; valor?: string; enlace?: string; tone?: string }[] = [];
        for (const p of lista)
          for (const d of jm.get(p.id) ?? [])
            for (const i of d.incidencias)
              items.push({ titulo: `${p.nombre} · ${optionLabel(INCIDENCIA_TIPOS, i.tipo)?.label}`, subtitulo: i.detalle, valor: d.fecha === hoy ? 'hoy' : 'ayer', enlace: '/control-horario?tab=incidencias', tone: optionLabel(INCIDENCIA_TIPOS, i.tipo)?.tone });
        out.push({ id: 'hor.incidencias', modulo: 'hor', titulo: 'Incidencias de fichaje', size: 'md', data: { kind: 'list', vacio: 'Sin incidencias hoy ni ayer', enlace: '/control-horario?tab=incidencias', items: items.slice(0, 6) } });
      }
    }
    return out;
  },
  timeline: async (dbx, ctx, entidad, id) => {
    if (entidad !== 'persona' || (id !== ctx.personaId && !(await canOnOwner(ctx, 'hor.ver', id)))) return [];
    const rows = await dbx.select().from(horCorrecciones).where(eq(horCorrecciones.personaId, id)).orderBy(desc(horCorrecciones.creadoEn)).limit(15);
    return rows.map((c) => ({
      id: `hc-${c.id}`,
      modulo: 'hor',
      tipo: 'correccion',
      icono: 'Clock',
      titulo: `Corrección de fichaje del ${c.fecha.split('-').reverse().join('/')}: ${optionLabel(horShared.CORRECCION_ESTADOS, c.estado)?.label?.toLowerCase()}`,
      detalle: c.motivo,
      fecha: c.creadoEn.toISOString(),
      enlace: `/personas/${id}?tab=hor-jornada`,
      tone: optionLabel(horShared.CORRECCION_ESTADOS, c.estado)?.tone,
    }));
  },
  jobs: [
    {
      id: 'hor.salida_olvidada',
      dailyAt: '09:30',
      run: async (empresaId, ctx) => {
        const ayer = addDays(hoyMadrid(), -1);
        const lista = await personasActivas(db, empresaId, null);
        const jm = await jornadas(
          db,
          empresaId,
          lista.map((p) => p.id),
          ayer,
          ayer,
          ctx.modules,
        );
        const olvidos = lista.filter((p) => jm.get(p.id)?.[0]?.incidencias.some((i) => i.tipo === 'sin_salida'));
        if (olvidos.length)
          await db.transaction(async (tx) => {
            for (const p of olvidos)
              await notify(tx, ctx, {
                modulo: 'hor',
                tipo: 'salida_olvidada',
                titulo: 'Ayer no fichaste la salida',
                cuerpo: 'Pide una corrección indicando la hora a la que terminaste para que tu registro de jornada sea correcto.',
                enlace: '/fichar?tab=mes',
                personaIds: [p.id],
              });
          });
        return `${olvidos.length} avisos`;
      },
    },
  ],
  seed: seedHor,
});
