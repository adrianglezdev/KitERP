import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ficShared, fmtDate, fmtMoney, optionLabel, toZod, type ApprovalItem, type FieldDef, type DashboardWidget, type TimelineEntry } from '@kite/shared';
import { db, type DbOrTx, type Tx } from '../../db/client';
import { adjuntos, archivos, personas } from '../../db/schema/core';
import { audit, diff } from '../../core/audit';
import { sha256 } from '../../core/auth';
import type { Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, forbidden, notFound, parse } from '../../core/errors';
import { fileUrl, saveFile } from '../../core/files';
import { defineModule } from '../../core/modules';
import { notify } from '../../core/notify';
import { appendSignaturePage, renderTextPdf } from '../../core/pdf';
import { can, canOnOwner, guard } from '../../core/permissions';
import { getEmpresa } from '../../core/settings';
import { ficCambios, ficFormacion, ficHistorial, ficPrl, ficTrabajadores } from './schema';
import { condAlcance, exigirPersona, idsEnAlcance, nombrePersona, nombres, personaPorId, personasActivas } from './personas';
import { seedFic } from './seed';
import { altCandidatos, altOfertas, altProcesos } from '../alt/schema';
import { addDays, hoyMadrid } from '../hor/tiempo';

const { trabajadorResource, formacionResource, prlResource, historialResource, CAMPOS_EMPLEADO, CAMPOS_HISTORIAL, ALERTA_TIPOS, DIAS_AVISO } = ficShared;

const SENSIBLES = Object.entries(trabajadorResource.fields as Record<string, FieldDef>)
  .filter(([, f]) => f.sensitive)
  .map(([k]) => k);
const fichaSchema = toZod(trabajadorResource, { partial: true, omit: ['personaId'] });
const propuestaSchema = z.object(Object.fromEntries(CAMPOS_EMPLEADO.map((k) => [k, fichaSchema.shape[k]!])) as Record<string, z.ZodTypeAny>);

const hoy = () => hoyMadrid();
const masDias = (n: number) => addDays(hoyMadrid(), n);

async function puedeVerSensible(ctx: Ctx, personaId: string) {
  return personaId === ctx.personaId || (await canOnOwner(ctx, 'fic.sensible', personaId));
}

function ocultarSensibles<T extends Record<string, any>>(row: T): T {
  const r: Record<string, any> = { ...row };
  for (const k of SENSIBLES) r[k] = null;
  return r as T;
}

function valorLegible(campo: string, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const f = trabajadorResource.fields[campo as keyof typeof trabajadorResource.fields];
  if (f?.type === 'enum') return optionLabel(f.options, v)?.label ?? String(v);
  if (f?.type === 'money') return fmtMoney(Number(v));
  if (f?.type === 'date') return fmtDate(String(v));
  if (campo === 'jornadaHoras') return `${v} h/semana`;
  return String(v);
}

/** Crea o actualiza la ficha laboral y anota en el historial los cambios relevantes. */
export async function guardarFicha(tx: Tx, ctx: Ctx, personaId: string, data: Record<string, unknown>, opts: { validar?: boolean } = {}) {
  const [prev] = await tx.select().from(ficTrabajadores).where(eq(ficTrabajadores.personaId, personaId));
  const values: Record<string, unknown> = { ...data };
  if (opts.validar) Object.assign(values, { validado: true, validadoPor: ctx.usuarioId, validadoEn: new Date() });
  let row: typeof ficTrabajadores.$inferSelect;
  if (prev) {
    if (!Object.keys(values).length) return prev;
    [row] = (await tx.update(ficTrabajadores).set(values).where(eq(ficTrabajadores.id, prev.id)).returning()) as [typeof ficTrabajadores.$inferSelect];
    await audit(tx, ctx, 'editar', 'fic_trabajador', personaId, diff(ocultarSensibles(prev), ocultarSensibles(row)));
    for (const [campo, tipo] of Object.entries(CAMPOS_HISTORIAL)) {
      if (!(campo in data)) continue;
      const a = (prev as Record<string, unknown>)[campo];
      const b = (row as Record<string, unknown>)[campo];
      if (String(a ?? '') === String(b ?? '')) continue;
      const label = trabajadorResource.fields[campo as keyof typeof trabajadorResource.fields]?.label ?? campo;
      await tx.insert(ficHistorial).values({
        empresaId: ctx.empresaId,
        personaId,
        fecha: hoy(),
        tipo,
        descripcion: `${label}: cambio registrado`,
        valorAnterior: valorLegible(campo, a),
        valorNuevo: valorLegible(campo, b),
        origen: 'auto',
        campo,
        creadoPor: ctx.usuarioId,
      });
    }
  } else {
    [row] = (await tx
      .insert(ficTrabajadores)
      .values({ ...(values as object), empresaId: ctx.empresaId, personaId } as typeof ficTrabajadores.$inferInsert)
      .returning()) as [typeof ficTrabajadores.$inferSelect];
    await audit(tx, ctx, 'crear', 'fic_trabajador', personaId, diff(null, ocultarSensibles(row)));
  }
  return row;
}

export interface Alerta {
  id: string;
  tipo: string;
  personaId: string;
  persona: string;
  fecha: string;
  dias: number;
  detalle: string;
  enlace: string;
}

/** Alertas de la ficha laboral: contratos, periodos de prueba, PRL, formación y documentos que caducan. */
export async function calcularAlertas(tx: DbOrTx, empresaId: string, ids: string[] | null, horizonte = 60): Promise<Alerta[]> {
  if (ids && !ids.length) return [];
  const desde = masDias(-30);
  const hasta = masDias(horizonte);
  const filtro = (col: any) => (ids ? inArray(col, ids) : undefined);
  const activos = sql`EXISTS (SELECT 1 FROM personas p WHERE p.id = ${ficTrabajadores.personaId} AND p.activo)`;
  const out: Omit<Alerta, 'persona' | 'dias'>[] = [];

  const fichas = await tx
    .select({ personaId: ficTrabajadores.personaId, finContrato: ficTrabajadores.finContrato, finPeriodoPrueba: ficTrabajadores.finPeriodoPrueba, fechaBaja: ficTrabajadores.fechaBaja })
    .from(ficTrabajadores)
    .where(and(eq(ficTrabajadores.empresaId, empresaId), isNull(ficTrabajadores.fechaBaja), activos, filtro(ficTrabajadores.personaId)));
  for (const f of fichas) {
    if (f.finContrato && f.finContrato >= hoy() && f.finContrato <= hasta) out.push({ id: `c-${f.personaId}`, tipo: 'fin_contrato', personaId: f.personaId, fecha: f.finContrato, detalle: 'Termina su contrato', enlace: `/personas/${f.personaId}?tab=fic-ficha` });
    if (f.finPeriodoPrueba && f.finPeriodoPrueba >= hoy() && f.finPeriodoPrueba <= hasta)
      out.push({ id: `p-${f.personaId}`, tipo: 'fin_prueba', personaId: f.personaId, fecha: f.finPeriodoPrueba, detalle: 'Termina el periodo de prueba', enlace: `/personas/${f.personaId}?tab=fic-ficha` });
  }

  const prl = await tx
    .select({ id: ficPrl.id, personaId: ficPrl.personaId, tipo: ficPrl.tipo, descripcion: ficPrl.descripcion, caduca: ficPrl.caduca })
    .from(ficPrl)
    .where(
      and(
        eq(ficPrl.empresaId, empresaId),
        gte(ficPrl.caduca, desde),
        lte(ficPrl.caduca, hasta),
        filtro(ficPrl.personaId),
        sql`NOT EXISTS (SELECT 1 FROM fic_prl n WHERE n.persona_id = ${ficPrl.personaId} AND n.tipo = ${ficPrl.tipo} AND n.descripcion = ${ficPrl.descripcion} AND n.caduca > ${ficPrl.caduca})`,
        sql`EXISTS (SELECT 1 FROM personas p WHERE p.id = ${ficPrl.personaId} AND p.activo)`,
      ),
    );
  for (const r of prl)
    out.push({ id: `prl-${r.id}`, tipo: r.tipo === 'reconocimiento' ? 'reconocimiento' : 'prl', personaId: r.personaId, fecha: r.caduca!, detalle: r.descripcion, enlace: `/personas/${r.personaId}?tab=fic-formacion` });

  const form = await tx
    .select({ id: ficFormacion.id, personaId: ficFormacion.personaId, curso: ficFormacion.curso, caduca: ficFormacion.caduca })
    .from(ficFormacion)
    .where(
      and(
        eq(ficFormacion.empresaId, empresaId),
        gte(ficFormacion.caduca, desde),
        lte(ficFormacion.caduca, hasta),
        filtro(ficFormacion.personaId),
        sql`NOT EXISTS (SELECT 1 FROM fic_formacion n WHERE n.persona_id = ${ficFormacion.personaId} AND n.curso = ${ficFormacion.curso} AND n.caduca > ${ficFormacion.caduca})`,
        sql`EXISTS (SELECT 1 FROM personas p WHERE p.id = ${ficFormacion.personaId} AND p.activo)`,
      ),
    );
  for (const r of form) out.push({ id: `f-${r.id}`, tipo: 'formacion', personaId: r.personaId, fecha: r.caduca!, detalle: r.curso, enlace: `/personas/${r.personaId}?tab=fic-formacion` });

  const docs = await tx
    .select({ id: adjuntos.id, personaId: adjuntos.entidadId, caduca: adjuntos.caduca, nombre: archivos.nombre, descripcion: adjuntos.descripcion })
    .from(adjuntos)
    .innerJoin(archivos, eq(archivos.id, adjuntos.archivoId))
    .where(and(eq(adjuntos.empresaId, empresaId), eq(adjuntos.entidad, 'persona'), isNull(adjuntos.archivadoEn), gte(adjuntos.caduca, desde), lte(adjuntos.caduca, hasta), filtro(adjuntos.entidadId)));
  for (const r of docs) out.push({ id: `d-${r.id}`, tipo: 'documento', personaId: r.personaId, fecha: r.caduca!, detalle: r.descripcion || r.nombre, enlace: `/personas/${r.personaId}?tab=adjuntos` });

  const n = await nombres(tx, out.map((o) => o.personaId));
  const today = hoy();
  return out
    .map((o) => ({ ...o, persona: n[o.personaId] ?? '', dias: Math.round((new Date(o.fecha + 'T12:00:00Z').getTime() - new Date(today + 'T12:00:00Z').getTime()) / 86400000) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function fichaDe(personaId: string) {
  const [f] = await db.select().from(ficTrabajadores).where(eq(ficTrabajadores.personaId, personaId));
  return f ?? null;
}

async function routes(app: FastifyInstance) {
  /* ── Plantilla (listado para RRHH y responsables) ── */
  app.get('/plantilla', { preHandler: guard('fic.ver') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { q?: string; inactivos?: string };
    const ids = await idsEnAlcance(ctx, 'fic.ver');
    const lista = await personasActivas(db, ctx.empresaId, ids, q.inactivos === '1');
    const pids = lista.map((p) => p.id);
    const fichas = pids.length ? await db.select().from(ficTrabajadores).where(inArray(ficTrabajadores.personaId, pids)) : [];
    const cambios = pids.length
      ? await db.select({ personaId: ficCambios.personaId }).from(ficCambios).where(and(inArray(ficCambios.personaId, pids), eq(ficCambios.estado, 'pendiente')))
      : [];
    const alertas = await calcularAlertas(db, ctx.empresaId, ids, 30);
    const byP = new Map(fichas.map((f) => [f.personaId, f]));
    const term = q.q?.trim().toLowerCase();
    return lista
      .filter((p) => !term || p.nombre.toLowerCase().includes(term) || (byP.get(p.id)?.dni ?? '').toLowerCase().includes(term))
      .map((p) => {
        const f = byP.get(p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          puesto: p.puesto,
          departamento: p.departamento,
          activo: p.activo,
          tieneFicha: !!f,
          dni: f?.dni ?? null,
          categoria: f?.categoria ?? null,
          tipoContrato: f?.tipoContrato ?? null,
          jornadaHoras: f?.jornadaHoras ?? null,
          fechaAlta: f?.fechaAlta ?? null,
          finContrato: f?.finContrato ?? null,
          validado: f?.validado ?? false,
          cambioPendiente: cambios.some((c) => c.personaId === p.id),
          alertas: alertas.filter((a) => a.personaId === p.id).length,
        };
      });
  });

  app.get('/alertas', { preHandler: guard('fic.ver') }, async (req) => {
    const ctx = req.ctx;
    const ids = await idsEnAlcance(ctx, 'fic.ver');
    // un empleado sin equipo solo ve las suyas
    return calcularAlertas(db, ctx.empresaId, ids, Number((req.query as { dias?: string }).dias) || 60);
  });

  /* ── Ficha de una persona ── */
  app.get('/fichas/:personaId', async (req) => {
    const ctx = req.ctx;
    const { personaId } = req.params as { personaId: string };
    const propia = personaId === ctx.personaId;
    if (!propia) await exigirPersona(ctx, 'fic.ver', personaId);
    const p = await personaPorId(db, ctx.empresaId, personaId);
    if (!p) throw notFound('Persona no encontrada');
    const f = await fichaDe(personaId);
    const sensible = await puedeVerSensible(ctx, personaId);
    const [pend] = await db
      .select()
      .from(ficCambios)
      .where(and(eq(ficCambios.personaId, personaId), eq(ficCambios.estado, 'pendiente')))
      .orderBy(desc(ficCambios.creadoEn))
      .limit(1);
    const [ultimoRechazo] = propia
      ? await db.select().from(ficCambios).where(and(eq(ficCambios.personaId, personaId), eq(ficCambios.estado, 'rechazado'))).orderBy(desc(ficCambios.revisadoEn)).limit(1)
      : [];
    return {
      persona: p,
      ficha: f ? (sensible ? f : ocultarSensibles(f)) : null,
      puedeEditar: await canOnOwner(ctx, 'fic.editar', personaId),
      puedeVerSensible: sensible,
      propia,
      cambioPendiente: pend ? { id: pend.id, datos: sensible ? pend.datos : { ...pend.datos, iban: pend.datos.iban ? '••••' : undefined }, creadoEn: pend.creadoEn, comentario: pend.comentario } : null,
      ultimoRechazo: ultimoRechazo && (!pend || ultimoRechazo.revisadoEn! > pend.creadoEn) ? { motivo: ultimoRechazo.motivoRechazo, revisadoEn: ultimoRechazo.revisadoEn } : null,
    };
  });

  app.put('/fichas/:personaId', async (req) => {
    const ctx = req.ctx;
    const { personaId } = req.params as { personaId: string };
    if (!(await canOnOwner(ctx, 'fic.editar', personaId))) throw forbidden('No puedes editar la ficha laboral de esta persona');
    const p = await personaPorId(db, ctx.empresaId, personaId);
    if (!p) throw notFound('Persona no encontrada');
    const data = parse(fichaSchema, req.body) as Record<string, unknown>;
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    if (!(await puedeVerSensible(ctx, personaId))) for (const k of SENSIBLES) delete data[k];
    if (data.fechaBaja && !data.motivoBaja) throw badRequest('Indica el motivo de la baja');
    const row = await db.transaction((tx) => guardarFicha(tx, ctx, personaId, data, { validar: true }));
    return (await puedeVerSensible(ctx, personaId)) ? row : ocultarSensibles(row);
  });

  /** El trabajador propone cambios en sus datos personales; RRHH los valida. */
  app.post('/fichas/:personaId/proponer', async (req) => {
    const ctx = req.ctx;
    const { personaId } = req.params as { personaId: string };
    if (personaId !== ctx.personaId) throw forbidden('Solo puedes proponer cambios en tus propios datos');
    const body = parse(propuestaSchema.extend({ comentario: z.string().max(1000).nullish() }), req.body) as Record<string, unknown>;
    const comentario = (body.comentario as string | null | undefined) ?? null;
    delete body.comentario;
    const actual = await fichaDe(personaId);
    const datos: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (String((actual as Record<string, unknown> | null)?.[k] ?? '') !== String(v ?? '')) datos[k] = v;
    }
    if (!Object.keys(datos).length) throw badRequest('No has cambiado ningún dato');
    return db.transaction(async (tx) => {
      const [pend] = await tx.select().from(ficCambios).where(and(eq(ficCambios.personaId, personaId), eq(ficCambios.estado, 'pendiente')));
      let id: string;
      if (pend) {
        await tx.update(ficCambios).set({ datos: { ...pend.datos, ...datos }, comentario, creadoEn: new Date() }).where(eq(ficCambios.id, pend.id));
        id = pend.id;
      } else {
        const [c] = await tx.insert(ficCambios).values({ empresaId: ctx.empresaId, personaId, datos, comentario }).returning();
        id = c!.id;
      }
      await audit(tx, ctx, 'proponer_cambio', 'fic_trabajador', personaId, { campos: Object.keys(datos) });
      await notify(tx, ctx, {
        modulo: 'fic',
        tipo: 'cambio_datos',
        titulo: `${ctx.nombre} ha actualizado sus datos personales`,
        cuerpo: `Revisa y valida los cambios: ${Object.keys(datos)
          .map((k) => trabajadorResource.fields[k as keyof typeof trabajadorResource.fields]?.label ?? k)
          .join(', ')}.`,
        enlace: '/trabajadores?tab=cambios',
        permiso: 'fic.editar',
      });
      return { id, ok: true };
    });
  });

  /* ── Cambios propuestos ── */
  app.get('/cambios', { preHandler: guard('fic.editar') }, async (req) => {
    const ctx = req.ctx;
    const estado = (req.query as { estado?: string }).estado ?? 'pendiente';
    const rows = await db
      .select({ c: ficCambios, nombre: nombrePersona })
      .from(ficCambios)
      .innerJoin(personas, eq(personas.id, ficCambios.personaId))
      .where(and(eq(ficCambios.empresaId, ctx.empresaId), eq(ficCambios.estado, estado), await condAlcance(ctx, 'fic.editar', ficCambios.personaId)))
      .orderBy(desc(ficCambios.creadoEn))
      .limit(200);
    const out = [];
    for (const r of rows) {
      const actual = await fichaDe(r.c.personaId);
      const sensible = await puedeVerSensible(ctx, r.c.personaId);
      out.push({
        ...r.c,
        persona: r.nombre,
        cambios: Object.entries(r.c.datos).map(([campo, nuevo]) => ({
          campo,
          label: trabajadorResource.fields[campo as keyof typeof trabajadorResource.fields]?.label ?? campo,
          antes: SENSIBLES.includes(campo) && !sensible ? '••••' : valorLegible(campo, (actual as Record<string, unknown> | null)?.[campo]),
          despues: SENSIBLES.includes(campo) && !sensible ? '••••' : valorLegible(campo, nuevo),
        })),
      });
    }
    return out;
  });

  async function cambioRevisable(ctx: Ctx, id: string) {
    const [c] = await db.select().from(ficCambios).where(and(eq(ficCambios.id, id), eq(ficCambios.empresaId, ctx.empresaId)));
    if (!c) throw notFound('Solicitud no encontrada');
    if (c.estado !== 'pendiente') throw badRequest('Esta solicitud ya está revisada');
    if (c.personaId === ctx.personaId && !ctx.isAdmin) throw forbidden('No puedes validar tus propios cambios');
    if (!(await canOnOwner(ctx, 'fic.editar', c.personaId))) throw forbidden();
    return c;
  }

  app.post('/cambios/:id/aprobar', async (req) => {
    const ctx = req.ctx;
    const c = await cambioRevisable(ctx, (req.params as { id: string }).id);
    await db.transaction(async (tx) => {
      const datos = parse(propuestaSchema.partial(), c.datos) as Record<string, unknown>;
      await guardarFicha(tx, ctx, c.personaId, datos, { validar: true });
      await tx.update(ficCambios).set({ estado: 'aprobado', revisadoPor: ctx.usuarioId, revisadoEn: new Date() }).where(eq(ficCambios.id, c.id));
      await audit(tx, ctx, 'aprobar_cambio', 'fic_trabajador', c.personaId, { solicitud: c.id });
      await notify(tx, ctx, { modulo: 'fic', tipo: 'cambio_aprobado', titulo: 'RRHH ha validado tus datos personales', enlace: `/personas/${c.personaId}?tab=fic-ficha`, personaIds: [c.personaId] });
    });
    return { ok: true };
  });

  app.post('/cambios/:id/rechazar', async (req) => {
    const ctx = req.ctx;
    const c = await cambioRevisable(ctx, (req.params as { id: string }).id);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(1, 'Indica el motivo').max(1000) }), req.body);
    await db.transaction(async (tx) => {
      await tx.update(ficCambios).set({ estado: 'rechazado', revisadoPor: ctx.usuarioId, revisadoEn: new Date(), motivoRechazo: motivo }).where(eq(ficCambios.id, c.id));
      await audit(tx, ctx, 'rechazar_cambio', 'fic_trabajador', c.personaId, { solicitud: c.id, motivo });
      await notify(tx, ctx, { modulo: 'fic', tipo: 'cambio_rechazado', titulo: 'RRHH no ha podido validar tus datos', cuerpo: motivo, enlace: `/personas/${c.personaId}?tab=fic-ficha`, personaIds: [c.personaId], email: true });
    });
    return { ok: true };
  });

  /* ── Historial laboral ── */
  app.get('/historial', async (req) => {
    const ctx = req.ctx;
    const { personaId } = req.query as { personaId?: string };
    if (!personaId) throw badRequest('Indica la persona');
    if (personaId !== ctx.personaId) await exigirPersona(ctx, 'fic.ver', personaId);
    const sensible = await puedeVerSensible(ctx, personaId);
    const rows = await db.select().from(ficHistorial).where(eq(ficHistorial.personaId, personaId)).orderBy(desc(ficHistorial.fecha), desc(ficHistorial.creadoEn));
    return rows.map((r) => (r.campo === 'salarioBruto' && !sensible ? { ...r, valorAnterior: '••••', valorNuevo: '••••' } : r));
  });
  const historialSchema = toZod(historialResource);
  app.post('/historial', async (req) => {
    const ctx = req.ctx;
    const body = parse(historialSchema, req.body) as typeof ficHistorial.$inferInsert;
    if (!(await canOnOwner(ctx, 'fic.editar', body.personaId))) throw forbidden();
    return db.transaction(async (tx) => {
      const [r] = await tx.insert(ficHistorial).values({ ...body, empresaId: ctx.empresaId, origen: 'manual', creadoPor: ctx.usuarioId }).returning();
      await audit(tx, ctx, 'crear', 'fic_historial', r!.id, r);
      return r;
    });
  });
  app.delete('/historial/:id', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(ficHistorial).where(and(eq(ficHistorial.id, id), eq(ficHistorial.empresaId, ctx.empresaId)));
    if (!r) throw notFound();
    if (!(await canOnOwner(ctx, 'fic.editar', r.personaId))) throw forbidden();
    if (r.origen === 'auto') throw badRequest('Las entradas automáticas no se pueden borrar');
    await db.transaction(async (tx) => {
      await tx.delete(ficHistorial).where(eq(ficHistorial.id, id));
      await audit(tx, ctx, 'borrar', 'fic_historial', id, r);
    });
    return { ok: true };
  });

  /* ── Formación y PRL ── */
  registerCrud(app, {
    path: '/formacion',
    resource: formacionResource,
    table: ficFormacion,
    entity: 'fic_formacion',
    perms: { ver: 'fic.ver', crear: 'fic.editar' },
    scopeCol: ficFormacion.personaId,
    hardDelete: true,
    defaults: (ctx) => ({ creadoPor: ctx.usuarioId }),
    transformOut: (r) => ({ ...r, archivoUrl: fileUrl(r.archivoId) }),
  });
  registerCrud(app, {
    path: '/prl',
    resource: prlResource,
    table: ficPrl,
    entity: 'fic_prl',
    perms: { ver: 'fic.ver', crear: 'fic.editar' },
    scopeCol: ficPrl.personaId,
    hardDelete: true,
    defaults: (ctx) => ({ creadoPor: ctx.usuarioId }),
    beforeSave: async (_tx, _ctx, data, existing) => {
      if (existing?.firmadoEn) throw badRequest('Este registro ya está firmado por la persona trabajadora y no se puede cambiar');
      if (data.epis !== undefined && data.epis !== null) data.epis = parse(z.array(z.object({ nombre: z.string().trim().min(1), talla: z.string().nullish(), cantidad: z.coerce.number().int().min(1) })), data.epis);
      return data;
    },
    beforeDelete: async (_tx, _ctx, row) => {
      if (row.firmadoEn) throw badRequest('Un registro firmado no se puede borrar');
    },
    transformOut: (r) => {
      const { firmaImagen: _f, ...rest } = r;
      return { ...rest, firmado: !!r.firmadoEn, archivoUrl: fileUrl(r.archivoId), evidenciaUrl: fileUrl(r.evidenciaArchivoId) };
    },
  });

  /** Firma de la entrega de EPI o de la información de riesgos. Firma la propia persona (en su móvil o en el dispositivo de RRHH). */
  app.post('/prl/:id/firmar', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const { firma } = parse(z.object({ firma: z.string().startsWith('data:image/png;base64,') }), req.body);
    const [r] = await db.select().from(ficPrl).where(and(eq(ficPrl.id, id), eq(ficPrl.empresaId, ctx.empresaId)));
    if (!r) throw notFound();
    if (r.personaId !== ctx.personaId && !(await canOnOwner(ctx, 'fic.editar', r.personaId))) throw forbidden();
    if (r.firmadoEn) throw badRequest('Ya está firmado');
    const png = Buffer.from(firma.split(',')[1]!, 'base64');
    if (png.length > 600_000) throw badRequest('La imagen de la firma es demasiado grande');
    const emp = await getEmpresa(ctx.empresaId);
    const p = await personaPorId(db, ctx.empresaId, r.personaId);
    const f = await fichaDe(r.personaId);
    const titulo = r.tipo === 'epi' ? 'Entrega de equipos de protección individual' : (optionLabel(ficShared.PRL_TIPOS, r.tipo)?.label ?? 'Registro de PRL');
    const lineas = [
      `${emp.razonSocial ?? emp.nombre} (NIF ${emp.nif ?? '—'}) hace entrega a ${p?.nombre ?? ''}${f?.dni ? `, con DNI/NIE ${f.dni},` : ''} de lo siguiente:`,
      '',
      r.descripcion,
      ...(r.epis ?? []).map((e) => `  · ${e.cantidad} × ${e.nombre}${e.talla ? ` (talla ${e.talla})` : ''}`),
      '',
      `Fecha: ${fmtDate(r.fecha)}`,
      '',
      r.tipo === 'epi'
        ? 'La persona trabajadora declara recibir los equipos en buen estado, haber sido informada de su uso correcto, mantenimiento y de la obligación de utilizarlos (art. 29 de la Ley 31/1995 de Prevención de Riesgos Laborales y RD 773/1997), y se compromete a comunicar cualquier defecto o pérdida.'
        : 'La persona trabajadora declara haber recibido la información indicada conforme al art. 18 de la Ley 31/1995 de Prevención de Riesgos Laborales.',
    ];
    const original = await renderTextPdf(titulo, lineas.join('\n'), { nombre: emp.nombre, nif: emp.nif, direccion: emp.direccion, localidad: emp.localidad });
    const huella = sha256(original);
    const fecha = new Date();
    const firmado = await appendSignaturePage(original, { firmante: p?.nombre ?? '', email: p?.email, fecha, ip: req.ip, userAgent: String(req.headers['user-agent'] ?? ''), firmaPng: png, huella, titulo });
    return db.transaction(async (tx) => {
      const arch = await saveFile(tx, { empresaId: ctx.empresaId, nombre: `${titulo} - ${p?.nombre ?? ''}.pdf`, mime: 'application/pdf', data: firmado, subidoPor: ctx.usuarioId });
      await tx.update(ficPrl).set({ firmaImagen: firma, firmadoEn: fecha, firmaIp: req.ip, firmaHash: huella, evidenciaArchivoId: arch.id }).where(eq(ficPrl.id, id));
      await audit(tx, ctx, 'firmar', 'fic_prl', id, { huella, presencial: r.personaId !== ctx.personaId });
      return { ok: true, evidenciaUrl: fileUrl(arch.id) };
    });
  });

  /** Documentos de PRL pendientes de firmar por mí. */
  app.get('/mis-firmas', async (req) => {
    const ctx = req.ctx;
    if (!ctx.personaId) return [];
    return db
      .select({ id: ficPrl.id, tipo: ficPrl.tipo, descripcion: ficPrl.descripcion, fecha: ficPrl.fecha, epis: ficPrl.epis })
      .from(ficPrl)
      .where(and(eq(ficPrl.personaId, ctx.personaId), isNull(ficPrl.firmadoEn), inArray(ficPrl.tipo, ['epi', 'informacion'])))
      .orderBy(desc(ficPrl.fecha));
  });
}

async function crearFichaSiFalta(tx: Tx, ctx: Ctx, personaId: string) {
  const [existe] = await tx.select({ id: ficTrabajadores.id }).from(ficTrabajadores).where(eq(ficTrabajadores.personaId, personaId));
  if (existe) return;
  const [p] = await tx.select({ empresaId: personas.empresaId }).from(personas).where(eq(personas.id, personaId));
  if (!p) return;
  // si la persona viene de una contratación (ALT), se toman la fecha de alta y las condiciones de la oferta
  const [proc] = await tx.select({ fecha: altProcesos.fecha, candidatoId: altProcesos.candidatoId }).from(altProcesos).where(and(eq(altProcesos.personaId, personaId), eq(altProcesos.tipo, 'alta'))).limit(1);
  const fecha = proc?.fecha ?? hoy();
  let condiciones: { tipoContrato?: string | null; jornadaHoras?: number | null } = {};
  if (proc?.candidatoId) {
    const [o] = await tx
      .select({ tipoContrato: altOfertas.tipoContrato, jornadaHoras: altOfertas.jornadaHoras })
      .from(altCandidatos)
      .innerJoin(altOfertas, eq(altOfertas.id, altCandidatos.ofertaId))
      .where(eq(altCandidatos.id, proc.candidatoId));
    if (o) condiciones = { tipoContrato: o.tipoContrato ?? undefined, jornadaHoras: o.jornadaHoras ?? undefined };
  }
  await tx.insert(ficTrabajadores).values({ empresaId: p.empresaId, personaId, fechaAlta: fecha, ...condiciones, tipoContrato: condiciones.tipoContrato ?? 'indefinido' });
  await tx.insert(ficHistorial).values({ empresaId: p.empresaId, personaId, fecha, tipo: 'alta', descripcion: 'Alta en la empresa', origen: 'auto', creadoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId });
}

export default defineModule({
  code: 'fic',
  routes,
  events: {
    'persona.creada': async (tx, ctx, { personaId }) => crearFichaSiFalta(tx, ctx, personaId),
    'persona.baja': async (tx, ctx, { personaId, fecha }) => {
      const [f] = await tx.select().from(ficTrabajadores).where(eq(ficTrabajadores.personaId, personaId));
      if (!f) return;
      if (!f.fechaBaja) await tx.update(ficTrabajadores).set({ fechaBaja: fecha }).where(eq(ficTrabajadores.id, f.id));
      await tx.insert(ficHistorial).values({ empresaId: f.empresaId, personaId, fecha, tipo: 'baja', descripcion: 'Baja en la empresa', valorNuevo: optionLabel(ficShared.MOTIVOS_BAJA, f.motivoBaja)?.label ?? null, origen: 'auto' });
    },
  },
  timeline: async (dbx, ctx, entidad, id): Promise<TimelineEntry[]> => {
    if (entidad !== 'persona') return [];
    if (id !== ctx.personaId && !(await canOnOwner(ctx, 'fic.ver', id))) return [];
    const sensible = await puedeVerSensible(ctx, id);
    const hist = await dbx.select().from(ficHistorial).where(eq(ficHistorial.personaId, id)).orderBy(desc(ficHistorial.fecha)).limit(40);
    const form = await dbx.select().from(ficFormacion).where(eq(ficFormacion.personaId, id)).orderBy(desc(ficFormacion.fecha)).limit(20);
    return [
      ...hist.map((h) => {
        const oculto = h.campo === 'salarioBruto' && !sensible;
        const t = optionLabel(ficShared.HISTORIAL_TIPOS, h.tipo);
        return {
          id: `fh-${h.id}`,
          modulo: 'fic',
          tipo: h.tipo,
          icono: 'IdCard',
          titulo: `${t?.label ?? h.tipo}: ${h.descripcion}`,
          detalle: oculto ? null : [h.valorAnterior, h.valorNuevo].filter(Boolean).join(' → ') || null,
          fecha: `${h.fecha}T09:00:00.000Z`,
          enlace: `/personas/${id}?tab=fic-ficha`,
          tone: t?.tone,
        };
      }),
      ...form.map((f) => ({ id: `ff-${f.id}`, modulo: 'fic', tipo: 'formacion', icono: 'BookOpen', titulo: `Formación: ${f.curso}`, detalle: f.horas ? `${f.horas} h` : null, fecha: `${f.fecha}T09:00:00.000Z`, enlace: `/personas/${id}?tab=fic-formacion`, tone: 'violet' })),
    ];
  },
  approvals: async (dbx, ctx): Promise<ApprovalItem[]> => {
    if (!can(ctx, 'fic.editar')) return [];
    const rows = await dbx
      .select({ c: ficCambios, nombre: nombrePersona })
      .from(ficCambios)
      .innerJoin(personas, eq(personas.id, ficCambios.personaId))
      .where(and(eq(ficCambios.empresaId, ctx.empresaId), eq(ficCambios.estado, 'pendiente'), await condAlcance(ctx, 'fic.editar', ficCambios.personaId)))
      .orderBy(asc(ficCambios.creadoEn))
      .limit(50);
    return rows
      .filter((r) => r.c.personaId !== ctx.personaId)
      .map((r) => ({
        id: `fic-${r.c.id}`,
        modulo: 'fic',
        tipo: 'Datos personales',
        titulo: `Validar datos de ${r.nombre}`,
        detalle: Object.keys(r.c.datos)
          .map((k) => trabajadorResource.fields[k as keyof typeof trabajadorResource.fields]?.label ?? k)
          .join(', '),
        solicitante: r.nombre,
        fecha: r.c.creadoEn.toISOString(),
        enlace: '/trabajadores?tab=cambios',
        aprobarUrl: `/api/fic/cambios/${r.c.id}/aprobar`,
        rechazarUrl: `/api/fic/cambios/${r.c.id}/rechazar`,
      }));
  },
  dashboard: async (dbx, ctx): Promise<DashboardWidget[]> => {
    const scope = ctx.perms.get('fic.ver');
    if (!scope || scope === 'propio') return [];
    const ids = await idsEnAlcance(ctx, 'fic.ver');
    const alertas = (await calcularAlertas(dbx, ctx.empresaId, ids, 30)).filter((a) => a.dias >= 0);
    return [
      {
        id: 'fic.alertas',
        modulo: 'fic',
        titulo: 'Vencimientos de la plantilla',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'Nada vence en los próximos 30 días',
          enlace: '/trabajadores?tab=alertas',
          items: alertas.slice(0, 6).map((a) => ({
            titulo: `${a.persona} · ${optionLabel(ALERTA_TIPOS, a.tipo)?.label ?? a.tipo}`,
            subtitulo: a.detalle,
            valor: a.dias === 0 ? 'hoy' : `en ${a.dias} d`,
            enlace: a.enlace,
            tone: a.dias <= 7 ? 'red' : 'yellow',
          })),
        },
      },
    ];
  },
  jobs: [
    {
      id: 'fic.alertas',
      dailyAt: '07:15',
      run: async (empresaId, ctx) => {
        const alertas = (await calcularAlertas(db, empresaId, null, 31)).filter((a) => (DIAS_AVISO as readonly number[]).includes(a.dias));
        let n = 0;
        await db.transaction(async (tx) => {
          for (const a of alertas) {
            const [p] = await tx.select({ resp: personas.responsableId }).from(personas).where(eq(personas.id, a.personaId));
            const label = optionLabel(ALERTA_TIPOS, a.tipo)?.label ?? a.tipo;
            await notify(tx, ctx, {
              modulo: 'fic',
              tipo: `alerta_${a.tipo}`,
              titulo: `${label}: ${a.persona} (${a.dias === 1 ? 'mañana' : `en ${a.dias} días`})`,
              cuerpo: `${a.detalle}. Fecha: ${fmtDate(a.fecha)}.`,
              enlace: a.enlace,
              permiso: 'fic.editar',
              personaIds: [p?.resp],
              email: a.dias <= 15,
            });
            n++;
          }
        });
        return `${n} avisos`;
      },
    },
  ],
  seed: seedFic,
});
