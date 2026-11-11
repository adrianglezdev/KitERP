import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { satShared } from '@kite/shared';
import { db, type DbOrTx, type Tx } from '../../db/client';
import { articulos, contactos, direcciones, personas, terceros } from '../../db/schema/core';
import { documentosRecurrentes } from '../../db/schema/documentos';
import { audit } from '../../core/audit';
import { randomToken } from '../../core/auth';
import { systemCtx, type Ctx } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { emit } from '../../core/events';
import { saveFile } from '../../core/files';
import { notify } from '../../core/notify';
import { nextCode } from '../../core/numbering';
import { can, canOnOwner } from '../../core/permissions';
import { crearDocumento, documentoSchema, ejecutarAccion } from '../../services/documentos';
import { precioPara } from '../../routes/terceros';
import { satChecklists, satContratos, satEquipos, satOrdenMateriales, satOrdenTiempos, satOrdenes, satTickets } from './schema';

type ChecklistItem = satShared.ChecklistItem;

/* ───────────── Fechas (hora de Madrid) ───────────── */

/** Fecha AAAA-MM-DD en Madrid. */
export function madridDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function madridOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Convierte "AAAA-MM-DDTHH:mm" (sin zona, hora de Madrid) o un ISO con zona en Date. */
export function parseFechaHora(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v;
  const s = String(v);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) throw badRequest('Fecha y hora no válidas');
  const guess = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  return new Date(guess.getTime() - madridOffsetMinutes(guess) * 60000);
}

/** Inicio y fin (instantes) de un día de Madrid. */
export function diaMadrid(fecha: string) {
  const inicio = parseFechaHora(`${fecha}T00:00`)!;
  const next = new Date(Date.parse(fecha + 'T12:00:00Z') + 86400_000).toISOString().slice(0, 10);
  return { inicio, fin: parseFechaHora(`${next}T00:00`)! };
}

export function addMonths(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00Z');
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}

export function addDays(fecha: string, n: number): string {
  return new Date(Date.parse(fecha + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
}

/** Quita los null de columnas NOT NULL con valor por defecto (el formulario envía null en los campos vacíos). */
export function sinNulos<T extends Record<string, any>>(data: T, keys: string[]): T {
  for (const k of keys) if (data[k] === null) delete data[k];
  return data;
}

/* ───────────── Contexto para operaciones internas del motor de documentos ───────────── */

/**
 * El motor de documentos exige permisos de pedidos (ped.editar/ped.preparar) que un técnico no tiene.
 * Las operaciones internas usan un contexto de sistema que conserva quién las provoca.
 */
export function docCtx(ctx: Ctx): Ctx {
  return { ...systemCtx(ctx.empresaId, ctx.modules), usuarioId: ctx.usuarioId, usuarioEmpresaId: ctx.usuarioEmpresaId, nombre: ctx.nombre, ip: ctx.ip };
}

/* ───────────── Acceso ───────────── */

export async function puedeVerTicket(ctx: Ctx, t: { empresaId: string; id: string; responsableId: string | null }) {
  if (t.empresaId !== ctx.empresaId || !can(ctx, 'sat.ver')) return false;
  if (await canOnOwner(ctx, 'sat.ver', t.responsableId)) return true;
  // también quien tiene una orden de ese ticket
  const ords = await db.select({ tecnicoId: satOrdenes.tecnicoId }).from(satOrdenes).where(eq(satOrdenes.ticketId, t.id));
  for (const o of ords) if (await canOnOwner(ctx, 'sat.ver', o.tecnicoId)) return true;
  return false;
}

export async function cargarTicket(ctx: Ctx, id: string, tx: DbOrTx = db) {
  const [t] = await tx.select().from(satTickets).where(eq(satTickets.id, id));
  if (!t || !(await puedeVerTicket(ctx, t))) throw notFound('Ticket no encontrado');
  return t;
}

export async function cargarOrden(ctx: Ctx, id: string, tx: DbOrTx = db) {
  const [o] = await tx.select().from(satOrdenes).where(eq(satOrdenes.id, id));
  if (!o || o.empresaId !== ctx.empresaId || !(await canOnOwner(ctx, 'sat.ver', o.tecnicoId))) throw notFound('Orden no encontrada');
  return o;
}

export async function needEditarOrden(ctx: Ctx, o: { tecnicoId: string | null }) {
  if (!(await canOnOwner(ctx, 'sat.editar', o.tecnicoId))) throw forbidden('Esta orden no está asignada a ti');
}

/** Solo quien planifica puede asignar trabajo a otra persona. */
export function needAsignar(ctx: Ctx, personaId: string | null | undefined, actual?: string | null) {
  if (!personaId || personaId === actual || personaId === ctx.personaId) return;
  if (!can(ctx, 'sat.planificar')) throw forbidden('Solo quien planifica puede asignar trabajo a otra persona');
}

/* ───────────── SLA ───────────── */

/** Plazos de un ticket: los del contrato (del ticket, del equipo o el activo del cliente) o los de su prioridad. */
export async function slaPara(tx: DbOrTx, empresaId: string, input: { terceroId: string; contratoId?: string | null; equipoId?: string | null; prioridad: string }) {
  let contratoId = input.contratoId ?? null;
  if (!contratoId && input.equipoId) {
    const [e] = await tx.select({ c: satEquipos.contratoId }).from(satEquipos).where(eq(satEquipos.id, input.equipoId));
    contratoId = e?.c ?? null;
  }
  let contrato: typeof satContratos.$inferSelect | undefined;
  if (contratoId) [contrato] = await tx.select().from(satContratos).where(and(eq(satContratos.id, contratoId), eq(satContratos.empresaId, empresaId)));
  if (!contrato) {
    [contrato] = await tx
      .select()
      .from(satContratos)
      .where(and(eq(satContratos.empresaId, empresaId), eq(satContratos.terceroId, input.terceroId), eq(satContratos.estado, 'activo'), isNull(satContratos.archivadoEn)))
      .orderBy(asc(satContratos.creadoEn))
      .limit(1);
  }
  const def = satShared.SLA_DEFECTO[input.prioridad as satShared.Prioridad] ?? satShared.SLA_DEFECTO.normal;
  // el contrato mejora (nunca empeora) el plazo por prioridad en los urgentes
  const respuesta = contrato?.slaRespuestaHoras ? (input.prioridad === 'urgente' ? Math.min(contrato.slaRespuestaHoras, def.respuesta) : contrato.slaRespuestaHoras) : def.respuesta;
  const resolucion = contrato?.slaResolucionHoras ? (input.prioridad === 'urgente' ? Math.min(contrato.slaResolucionHoras, def.resolucion) : contrato.slaResolucionHoras) : def.resolucion;
  return { respuesta, resolucion, contratoId: contrato?.id ?? null };
}

export function slaInfo(t: { estado: string; venceRespuesta: Date; venceResolucion: Date; primeraRespuestaEn: Date | null; resueltoEn: Date | null; slaIncumplido: boolean; creadoEn: Date }, now = Date.now()) {
  const abierto = !['resuelto', 'cerrado'].includes(t.estado);
  const pendienteRespuesta = !t.primeraRespuestaEn;
  const objetivo = pendienteRespuesta ? t.venceRespuesta : t.venceResolucion;
  const total = objetivo.getTime() - t.creadoEn.getTime();
  const restanteMin = Math.round((objetivo.getTime() - now) / 60000);
  const incumplido =
    t.slaIncumplido ||
    (t.primeraRespuestaEn ? t.primeraRespuestaEn > t.venceRespuesta : abierto && now > t.venceRespuesta.getTime()) ||
    (t.resueltoEn ? t.resueltoEn > t.venceResolucion : abierto && now > t.venceResolucion.getTime());
  const enRiesgo = abierto && !incumplido && restanteMin * 60000 < Math.max(2 * 3600_000, total * 0.2);
  return { abierto, objetivo: pendienteRespuesta ? 'respuesta' : 'resolucion', vence: objetivo.toISOString(), restanteMin: abierto ? restanteMin : null, incumplido, enRiesgo };
}

/* ───────────── Tickets ───────────── */

export async function prepararTicketNuevo(tx: Tx, ctx: Ctx, data: Record<string, any>) {
  const [t] = await tx.select({ e: terceros.empresaId }).from(terceros).where(eq(terceros.id, data.terceroId));
  if (!t || t.e !== ctx.empresaId) throw badRequest('Cliente no válido');
  if (data.equipoId) {
    const [e] = await tx.select({ t: satEquipos.terceroId }).from(satEquipos).where(eq(satEquipos.id, data.equipoId));
    if (!e || e.t !== data.terceroId) throw badRequest('El equipo no pertenece a ese cliente');
  }
  const sla = await slaPara(tx, ctx.empresaId, { terceroId: data.terceroId, equipoId: data.equipoId, contratoId: data.contratoId, prioridad: data.prioridad ?? 'normal' });
  const ahora = new Date();
  return {
    ...data,
    codigo: await nextCode(tx, ctx.empresaId, 'sat_ticket', 'TK'),
    contratoId: sla.contratoId,
    slaRespuestaHoras: sla.respuesta,
    slaResolucionHoras: sla.resolucion,
    venceRespuesta: new Date(ahora.getTime() + sla.respuesta * 3600_000),
    venceResolucion: new Date(ahora.getTime() + sla.resolucion * 3600_000),
    estado: data.responsableId ? 'asignado' : 'nuevo',
    primeraRespuestaEn: data.responsableId ? ahora : null,
    portalToken: randomToken(18),
  };
}

/** Recalcula el estado del ticket a partir de sus órdenes (resuelto cuando todas están cerradas). */
export async function recalcularTicket(tx: Tx, ctx: Ctx, ticketId: string | null) {
  if (!ticketId) return;
  const [t] = await tx.select().from(satTickets).where(eq(satTickets.id, ticketId)).for('update');
  if (!t || t.estado === 'cerrado') return;
  const ords = await tx.select({ estado: satOrdenes.estado, tecnicoId: satOrdenes.tecnicoId }).from(satOrdenes).where(and(eq(satOrdenes.ticketId, ticketId), isNull(satOrdenes.archivadoEn)));
  if (!ords.length) return;
  const ahora = new Date();
  const cerradas = ords.every((o) => ['finalizada', 'cancelada'].includes(o.estado));
  let set: Partial<typeof satTickets.$inferInsert> | null = null;
  if (cerradas && ords.some((o) => o.estado === 'finalizada')) {
    if (t.estado !== 'resuelto')
      set = { estado: 'resuelto', resueltoEn: ahora, primeraRespuestaEn: t.primeraRespuestaEn ?? ahora, slaIncumplido: t.slaIncumplido || ahora > t.venceResolucion };
  } else if (ords.some((o) => ['en_ruta', 'en_curso'].includes(o.estado))) {
    if (['nuevo', 'asignado'].includes(t.estado)) set = { estado: 'en_curso', primeraRespuestaEn: t.primeraRespuestaEn ?? ahora };
  } else if (t.estado === 'nuevo' && ords.some((o) => o.tecnicoId)) {
    set = { estado: 'asignado', primeraRespuestaEn: t.primeraRespuestaEn ?? ahora };
  } else if (t.estado === 'resuelto' && !cerradas) {
    set = { estado: 'en_curso', resueltoEn: null };
  }
  if (!t.responsableId) {
    const tec = ords.find((o) => o.tecnicoId)?.tecnicoId;
    if (tec) set = { ...(set ?? {}), responsableId: tec };
  }
  if (!set) return;
  await tx.update(satTickets).set(set).where(eq(satTickets.id, ticketId));
  await audit(tx, ctx, `estado_${set.estado ?? t.estado}`, 'sat_ticket', ticketId, { automatico: true });
}

/* ───────────── Órdenes ───────────── */

/** Dirección de la visita: la elegida, la principal de entrega del cliente o su dirección fiscal. */
export async function direccionVisita(tx: DbOrTx, terceroId: string, direccionId?: string | null) {
  const dirs = await tx.select().from(direcciones).where(eq(direcciones.terceroId, terceroId));
  const d = (direccionId && dirs.find((x) => x.id === direccionId)) || dirs.find((x) => x.principal) || null;
  if (d) return { direccionId: d.id, direccion: { nombre: d.nombre, direccion: d.direccion, codigoPostal: d.codigoPostal, localidad: d.localidad, provincia: d.provincia, telefono: d.telefono, lat: d.lat, lng: d.lng } };
  const [t] = await tx.select().from(terceros).where(eq(terceros.id, terceroId));
  return { direccionId: null, direccion: t ? { nombre: t.nombre, direccion: t.direccion, codigoPostal: t.codigoPostal, localidad: t.localidad, provincia: t.provincia, telefono: t.telefono } : null };
}

export async function checklistDe(tx: DbOrTx, checklistId: string | null | undefined): Promise<ChecklistItem[]> {
  if (!checklistId) return [];
  const [c] = await tx.select().from(satChecklists).where(eq(satChecklists.id, checklistId));
  return (c?.items ?? []).map((i) => ({ id: i.id, texto: i.texto, obligatorio: !!i.obligatorio, hecho: false, nota: null }));
}

/** Datos calculados al crear una orden. */
export async function prepararOrdenNueva(tx: Tx, ctx: Ctx, data: Record<string, any>) {
  const [t] = await tx.select({ e: terceros.empresaId }).from(terceros).where(eq(terceros.id, data.terceroId));
  if (!t || t.e !== ctx.empresaId) throw badRequest('Cliente no válido');
  let equipo: typeof satEquipos.$inferSelect | undefined;
  if (data.equipoId) {
    [equipo] = await tx.select().from(satEquipos).where(eq(satEquipos.id, data.equipoId));
    if (!equipo || equipo.terceroId !== data.terceroId) throw badRequest('El equipo no pertenece a ese cliente');
    data.contratoId ??= equipo.contratoId;
    data.direccionId ??= equipo.direccionId;
  }
  if (data.ticketId) {
    const [tk] = await tx.select().from(satTickets).where(eq(satTickets.id, data.ticketId));
    if (!tk || tk.empresaId !== ctx.empresaId || tk.terceroId !== data.terceroId) throw badRequest('El ticket no es de ese cliente');
    data.equipoId ??= tk.equipoId;
    data.contratoId ??= tk.contratoId;
  }
  if (data.contratoId && !data.checklistId && data.tipo === 'preventivo') {
    const [c] = await tx.select({ ck: satContratos.checklistId }).from(satContratos).where(eq(satContratos.id, data.contratoId));
    data.checklistId = c?.ck ?? null;
  }
  // garantía o preventivo de contrato: sin cargo salvo que se indique otra cosa
  if (data.facturable !== false) {
    const hoy = madridDay();
    if ((data.tipo === 'correctivo' && equipo?.garantiaHasta && equipo.garantiaHasta >= hoy) || (data.tipo === 'preventivo' && data.contratoId)) data.facturable = false;
  }
  const dir = await direccionVisita(tx, data.terceroId, data.direccionId);
  return {
    ...data,
    ...dir,
    codigo: await nextCode(tx, ctx.empresaId, 'sat_orden', 'OT'),
    checklist: await checklistDe(tx, data.checklistId),
    estado: data.tecnicoId && data.planificadaInicio ? 'planificada' : 'pendiente',
  };
}

/** Furgoneta del técnico (almacén de tipo furgoneta en STK), si el módulo de stock está activo. */
export async function almacenDeTecnico(tx: Tx, ctx: Ctx, personaId: string | null | undefined): Promise<string | null> {
  if (!personaId || !ctx.modules.has('stk')) return null;
  try {
    return await tx.transaction(async (sp) => {
      const r = await sp.execute<{ id: string }>(sql`SELECT id FROM stk_almacenes WHERE empresa_id = ${ctx.empresaId} AND tipo = 'furgoneta' AND persona_id = ${personaId} LIMIT 1`);
      return r[0]?.id ?? null;
    });
  } catch {
    return null; // el módulo de stock aún no tiene esa tabla o columnas
  }
}

export const cierreSchema = z.object({
  uid: z.string().max(80).nullish(),
  trabajoRealizado: z.string().trim().min(3, 'Describe el trabajo realizado').max(10000),
  checklist: z.array(z.object({ id: z.string(), hecho: z.boolean(), nota: z.string().max(500).nullish() })).max(200).default([]),
  materiales: z
    .array(z.object({ articuloId: z.string().uuid(), cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero').max(100000), almacenId: z.string().uuid().nullish() }))
    .max(100)
    .default([]),
  tiempos: z.array(z.object({ inicio: z.string(), fin: z.string() })).max(50).default([]),
  /** Horas a facturar si no se usó el cronómetro. */
  horas: z.coerce.number().min(0).max(24).nullish(),
  desplazamiento: z.boolean().default(true),
  facturable: z.boolean().nullish(),
  firma: z.string().startsWith('data:image/png;base64,').max(900_000).nullish(),
  firmaNombre: z.string().trim().max(120).nullish(),
});
export type CierreInput = z.infer<typeof cierreSchema>;

const minutosEntre = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

/** Cierra una orden en una única transacción: parte, tiempos, materiales, firma, albarán entregado y evento. */
export async function cerrarOrden(tx: Tx, ctx: Ctx, ordenId: string, input: CierreInput) {
  const [o] = await tx.select().from(satOrdenes).where(eq(satOrdenes.id, ordenId)).for('update');
  if (!o || o.empresaId !== ctx.empresaId || !(await canOnOwner(ctx, 'sat.ver', o.tecnicoId))) throw notFound('Orden no encontrada');
  await needEditarOrden(ctx, o);
  if (o.estado === 'finalizada') {
    // reenvío del mismo parte (el móvil no recibió la respuesta): no se duplica nada
    if (input.uid && o.cierreUid === input.uid) return { orden: o, albaranId: o.albaranId, repetido: true };
    throw conflict('La orden ya está finalizada');
  }
  if (o.estado === 'cancelada') throw conflict('La orden está cancelada');
  if (input.firma && !input.firmaNombre) throw badRequest('Indica el nombre de quien firma');

  const marcados = new Map(input.checklist.map((c) => [c.id, c]));
  const checklist = o.checklist.map((i) => ({ ...i, hecho: marcados.get(i.id)?.hecho ?? !!i.hecho, nota: marcados.get(i.id)?.nota ?? i.nota ?? null }));
  const faltan = checklist.filter((i) => i.obligatorio && !i.hecho);
  if (faltan.length) throw badRequest(`Faltan puntos obligatorios del checklist: ${faltan.map((f) => f.texto).join(', ')}`);

  const ahora = new Date();
  const personaId = ctx.personaId ?? o.tecnicoId;

  /* Tiempos: se cierran los cronómetros abiertos y se añaden los registrados sin conexión */
  const abiertos = await tx.select().from(satOrdenTiempos).where(and(eq(satOrdenTiempos.ordenId, o.id), isNull(satOrdenTiempos.fin)));
  for (const a of abiertos) await tx.update(satOrdenTiempos).set({ fin: ahora, minutos: minutosEntre(a.inicio, ahora) }).where(eq(satOrdenTiempos.id, a.id));
  if (personaId && input.tiempos.length) {
    const existentes = await tx.select({ inicio: satOrdenTiempos.inicio }).from(satOrdenTiempos).where(eq(satOrdenTiempos.ordenId, o.id));
    for (const t of input.tiempos) {
      const inicio = parseFechaHora(t.inicio)!;
      const fin = parseFechaHora(t.fin)!;
      if (!(fin > inicio) || fin.getTime() - inicio.getTime() > 16 * 3600_000 || fin.getTime() > ahora.getTime() + 5 * 60000) throw badRequest('Hay un tramo de tiempo no válido');
      if (existentes.some((e) => Math.abs(e.inicio.getTime() - inicio.getTime()) < 60_000)) continue;
      await tx.insert(satOrdenTiempos).values({ ordenId: o.id, personaId, inicio, fin, minutos: minutosEntre(inicio, fin), origen: 'movil' });
    }
  }
  const [{ min } = { min: 0 }] = await tx.select({ min: sql<number>`coalesce(sum(${satOrdenTiempos.minutos}), 0)::int` }).from(satOrdenTiempos).where(eq(satOrdenTiempos.ordenId, o.id));
  const horas = input.horas && input.horas > 0 ? Math.round(input.horas * 4) / 4 : Math.ceil(min / 15) / 4;
  const [primero] = await tx.select({ inicio: sql<string | null>`min(${satOrdenTiempos.inicio})` }).from(satOrdenTiempos).where(eq(satOrdenTiempos.ordenId, o.id));

  /* Materiales (el parte es la fuente: sustituye a los anotados antes) */
  const almacenDefecto = await almacenDeTecnico(tx, ctx, o.tecnicoId);
  await tx.delete(satOrdenMateriales).where(eq(satOrdenMateriales.ordenId, o.id));
  const facturable = input.facturable ?? o.facturable;
  const mats: { articuloId: string; cantidad: number; almacenId: string | null; precio: number; info: Awaited<ReturnType<typeof precioPara>> }[] = [];
  for (const m of input.materiales) {
    const info = await precioPara(tx, ctx.empresaId, m.articuloId, o.terceroId);
    mats.push({ articuloId: m.articuloId, cantidad: m.cantidad, almacenId: m.almacenId ?? almacenDefecto, precio: info.precio, info });
  }
  if (mats.length)
    await tx.insert(satOrdenMateriales).values(mats.map((m) => ({ ordenId: o.id, articuloId: m.articuloId, descripcion: m.info.descripcion, cantidad: m.cantidad, almacenId: m.almacenId, precio: m.precio })));

  /* Firma del cliente */
  let firmaArchivoId: string | null = null;
  if (input.firma) {
    const png = Buffer.from(input.firma.split(',')[1]!, 'base64');
    firmaArchivoId = (await saveFile(tx, { empresaId: ctx.empresaId, nombre: `Firma ${o.codigo}.png`, mime: 'image/png', data: png, subidoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId })).id;
  }

  /* Albarán: material con su precio (a 0 si no se factura) + mano de obra + desplazamiento */
  let albaranId: string | null = null;
  if (ctx.modules.has('ped') && (facturable || mats.length)) {
    const sys = docCtx(ctx);
    const [hora] = await tx.select({ id: articulos.id }).from(articulos).where(and(eq(articulos.empresaId, ctx.empresaId), eq(articulos.referencia, 'SRV-HORA'), isNull(articulos.archivadoEn)));
    const [despl] = await tx.select({ id: articulos.id }).from(articulos).where(and(eq(articulos.empresaId, ctx.empresaId), eq(articulos.referencia, 'SRV-DESPL'), isNull(articulos.archivadoEn)));
    const lineas: Record<string, unknown>[] = mats.map((m) => ({
      tipoLinea: 'articulo',
      articuloId: m.articuloId,
      referencia: m.info.referencia,
      descripcion: m.info.descripcion,
      cantidad: m.cantidad,
      unidad: m.info.unidad,
      precio: facturable ? m.precio : 0,
      descuento: facturable ? m.info.descuento : 0,
      ivaTipo: m.info.ivaTipo,
      coste: m.info.coste,
      almacenId: m.almacenId,
    }));
    if (horas > 0) {
      if (hora) {
        const p = await precioPara(tx, ctx.empresaId, hora.id, o.terceroId);
        lineas.push({ tipoLinea: 'articulo', articuloId: hora.id, referencia: p.referencia, descripcion: facturable ? p.descripcion : `${p.descripcion} (sin cargo)`, cantidad: horas, unidad: p.unidad, precio: facturable ? p.precio : 0, descuento: facturable ? p.descuento : 0, ivaTipo: p.ivaTipo, coste: p.coste });
      } else lineas.push({ tipoLinea: 'texto', descripcion: `Mano de obra: ${String(horas).replace('.', ',')} h${facturable ? '' : ' (sin cargo)'}` });
    }
    if (facturable && input.desplazamiento && despl) {
      const p = await precioPara(tx, ctx.empresaId, despl.id, o.terceroId);
      lineas.push({ tipoLinea: 'articulo', articuloId: despl.id, referencia: p.referencia, descripcion: p.descripcion, cantidad: 1, unidad: p.unidad, precio: p.precio, descuento: p.descuento, ivaTipo: p.ivaTipo, coste: p.coste });
    }
    const [contacto] = o.ticketId ? await tx.select({ c: satTickets.contactoId }).from(satTickets).where(eq(satTickets.id, o.ticketId)) : [];
    const albaran = await crearDocumento(
      tx,
      sys,
      documentoSchema.parse({
        tipo: 'albaran',
        fecha: madridDay(ahora),
        terceroId: o.terceroId,
        contactoId: contacto?.c ?? null,
        titulo: `Servicio técnico ${o.codigo}`,
        observaciones: (input.trabajoRealizado.slice(0, 4000) + (facturable ? '' : '\nSin cargo: garantía o contrato de mantenimiento.')).trim(),
        origenTipo: 'sat_orden',
        origenId: o.id,
        almacenId: almacenDefecto,
        direccionEnvio: o.direccion ?? null,
        lineas,
      }),
      { sinPermisos: true },
    );
    await ejecutarAccion(tx, sys, albaran.id, 'entregar', { receptor: input.firmaNombre ?? null, firma: input.firma ?? null });
    albaranId = albaran.id;
  }

  const [after] = await tx
    .update(satOrdenes)
    .set({
      estado: 'finalizada',
      finalizadaEn: ahora,
      iniciadaEn: o.iniciadaEn ?? (primero?.inicio ? new Date(primero.inicio) : ahora),
      trabajoRealizado: input.trabajoRealizado,
      checklist,
      facturable,
      desplazamiento: input.desplazamiento,
      firmaArchivoId: firmaArchivoId ?? o.firmaArchivoId,
      firmaNombre: input.firmaNombre ?? o.firmaNombre,
      cierreUid: input.uid ?? null,
      albaranId,
    })
    .where(eq(satOrdenes.id, o.id))
    .returning();
  await audit(tx, ctx, 'cerrar', 'sat_orden', o.id, { horas, materiales: mats.length, facturable, albaranId });
  await recalcularTicket(tx, ctx, o.ticketId);
  await emit(tx, ctx, 'sat.orden_cerrada', { ordenId: o.id, terceroId: o.terceroId, tecnicoId: o.tecnicoId, facturable, albaranId });
  return { orden: after!, albaranId, repetido: false };
}

/* ───────────── Contratos: facturación periódica ───────────── */

/** Crea o actualiza la fila de facturación periódica del núcleo para la cuota del contrato. */
export async function sincronizarRecurrente(tx: Tx, ctx: Ctx, c: typeof satContratos.$inferSelect) {
  if (!ctx.modules.has('fac')) return;
  const activo = c.estado === 'activo' && !!c.cuota && c.cuota > 0 && !c.archivadoEn;
  let [r] = c.recurrenteId ? await tx.select().from(documentosRecurrentes).where(eq(documentosRecurrentes.id, c.recurrenteId)) : [];
  if (!r) [r] = await tx.select().from(documentosRecurrentes).where(and(eq(documentosRecurrentes.origenTipo, 'sat_contrato'), eq(documentosRecurrentes.origenId, c.id)));
  if (!r && !activo) return;
  const per = { mensual: 'mensual', trimestral: 'trimestral', semestral: 'semestral', anual: 'anual' }[c.cuotaPeriodicidad] ?? 'trimestral';
  const values = {
    nombre: `Mantenimiento ${c.codigo} · ${c.nombre}`,
    terceroId: c.terceroId,
    periodicidad: per,
    finFecha: c.fin,
    lineas: [{ articuloId: null, descripcion: `Cuota ${per} del contrato de mantenimiento ${c.codigo} (${c.nombre})`, cantidad: 1, precio: c.cuota ?? 0, ivaTipo: 21 }],
    activo,
  };
  if (r) {
    await tx.update(documentosRecurrentes).set(values).where(eq(documentosRecurrentes.id, r.id));
    if (c.recurrenteId !== r.id) await tx.update(satContratos).set({ recurrenteId: r.id }).where(eq(satContratos.id, c.id));
    await audit(tx, ctx, 'editar', 'documento_recurrente', r.id, { origen: c.codigo, activo });
    return;
  }
  const hoy = madridDay();
  const [nuevo] = await tx
    .insert(documentosRecurrentes)
    .values({ ...values, empresaId: c.empresaId, proximaFecha: c.inicio > hoy ? c.inicio : hoy, origenTipo: 'sat_contrato', origenId: c.id })
    .returning();
  await tx.update(satContratos).set({ recurrenteId: nuevo!.id }).where(eq(satContratos.id, c.id));
  await audit(tx, ctx, 'crear', 'documento_recurrente', nuevo!.id, { origen: c.codigo, cuota: c.cuota, periodicidad: per });
}

/* ───────────── Tareas programadas ───────────── */

/** Genera las órdenes preventivas de los contratos con visita en los próximos 7 días. Idempotente. */
export async function generarPreventivos(empresaId: string, ctx: Ctx, hoy = madridDay()): Promise<number> {
  const limite = addDays(hoy, 7);
  const candidatos = await db
    .select({ id: satContratos.id })
    .from(satContratos)
    .where(and(eq(satContratos.empresaId, empresaId), eq(satContratos.estado, 'activo'), isNull(satContratos.archivadoEn), lte(satContratos.proximaVisita, limite)));
  let n = 0;
  for (const { id } of candidatos) {
    await db.transaction(async (tx) => {
      const [c] = await tx.select().from(satContratos).where(eq(satContratos.id, id)).for('update');
      if (!c?.proximaVisita || c.proximaVisita > limite || c.estado !== 'activo') return;
      if (c.fin && c.proximaVisita > c.fin) return;
      const visita = c.proximaVisita;
      const equipos = await tx.select({ id: satEquipos.id, nombre: satEquipos.nombre }).from(satEquipos).where(and(eq(satEquipos.contratoId, c.id), isNull(satEquipos.archivadoEn)));
      const base = await prepararOrdenNueva(tx, ctx, {
        terceroId: c.terceroId,
        contratoId: c.id,
        equipoId: equipos.length === 1 ? equipos[0]!.id : null,
        tipo: 'preventivo',
        prioridad: 'normal',
        checklistId: c.checklistId,
        tecnicoId: c.tecnicoId,
        facturable: false,
        planificadaInicio: c.tecnicoId ? parseFechaHora(`${visita}T09:00`) : null,
        planificadaFin: c.tecnicoId ? parseFechaHora(`${visita}T11:00`) : null,
        descripcion: `Visita preventiva del contrato ${c.codigo}${equipos.length ? `: ${equipos.map((e) => e.nombre).join(', ')}` : ''}`,
      });
      const ins = await tx
        .insert(satOrdenes)
        .values({ ...(base as typeof satOrdenes.$inferInsert), empresaId, visitaFecha: visita })
        .onConflictDoNothing()
        .returning({ id: satOrdenes.id, codigo: satOrdenes.codigo });
      await tx.update(satContratos).set({ proximaVisita: addMonths(visita, c.periodicidadMeses) }).where(eq(satContratos.id, c.id));
      if (!ins.length) return;
      n++;
      await audit(tx, ctx, 'crear', 'sat_orden', ins[0]!.id, { preventivo: true, contrato: c.codigo, visita });
      await notify(tx, ctx, {
        modulo: 'sat',
        tipo: 'preventivo',
        titulo: `Visita preventiva ${ins[0]!.codigo} generada`,
        cuerpo: `Contrato ${c.codigo} · ${c.nombre} · ${visita.split('-').reverse().join('/')}`,
        enlace: `/sat/ordenes/${ins[0]!.id}`,
        permiso: 'sat.planificar',
        personaIds: [c.tecnicoId],
      });
    });
  }
  return n;
}

/** Marca los tickets que han superado su plazo y avisa a quien planifica y al responsable. */
export async function marcarSlaIncumplidos(empresaId: string, ctx: Ctx): Promise<number> {
  const ahora = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(satTickets)
      .set({ slaIncumplido: true })
      .where(
        and(
          eq(satTickets.empresaId, empresaId),
          eq(satTickets.slaIncumplido, false),
          inArray(satTickets.estado, ['nuevo', 'asignado', 'en_curso', 'esperando_cliente']),
          or(and(isNull(satTickets.primeraRespuestaEn), lte(satTickets.venceRespuesta, ahora)), lte(satTickets.venceResolucion, ahora)),
        ),
      )
      .returning({ id: satTickets.id, codigo: satTickets.codigo, asunto: satTickets.asunto, responsableId: satTickets.responsableId });
    for (const t of rows) {
      await audit(tx, ctx, 'sla_incumplido', 'sat_ticket', t.id);
      await notify(tx, ctx, { modulo: 'sat', tipo: 'sla', titulo: `SLA incumplido: ${t.codigo}`, cuerpo: t.asunto, enlace: `/sat/tickets/${t.id}`, permiso: 'sat.planificar', personaIds: [t.responsableId] });
    }
    return rows.length;
  });
}

/* ───────────── Utilidades de lectura ───────────── */

export const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

export async function contactoDe(tx: DbOrTx, id: string | null) {
  if (!id) return null;
  const [c] = await tx.select({ id: contactos.id, nombre: contactos.nombre, apellidos: contactos.apellidos, telefono: contactos.telefono, movil: contactos.movil, email: contactos.email }).from(contactos).where(eq(contactos.id, id));
  return c ?? null;
}

