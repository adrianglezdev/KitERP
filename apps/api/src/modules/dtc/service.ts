import { and, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { dtcShared } from '@kite/shared';
import { db, type DbOrTx, type Tx } from '../../db/client';
import { archivos, departamentos, personas } from '../../db/schema/core';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { fileUrl } from '../../core/files';
import { notify } from '../../core/notify';
import { can } from '../../core/permissions';
import { searchRefs } from '../../core/refs';
import { dtcDistribucion, dtcDocumentos, dtcLecturas, dtcVersiones, dtcVinculos } from './schema';

const NADIE = '00000000-0000-0000-0000-000000000000';

export function hoyMadrid() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function sumarMeses(fecha: string, n: number) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export const puedeGestionar = (ctx: Ctx) => can(ctx, 'dtc.editar') || can(ctx, 'dtc.aprobar');

/**
 * Qué documentos ve un usuario:
 *  - los restringidos solo con dtc.restringido;
 *  - quien no redacta ni aprueba solo ve los que tienen una versión vigente (o de los que es responsable).
 */
export function visibilidad(ctx: Ctx): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (!can(ctx, 'dtc.restringido')) conds.push(ne(dtcDocumentos.confidencialidad, 'restringido'));
  if (!puedeGestionar(ctx)) conds.push(or(isNotNull(dtcDocumentos.versionVigenteId), eq(dtcDocumentos.responsableId, ctx.personaId ?? NADIE)));
  const c = conds.filter(Boolean) as SQL[];
  return c.length ? and(...c) : undefined;
}

export function puedeVerDoc(ctx: Ctx, d: { empresaId: string; confidencialidad: string; versionVigenteId: string | null; responsableId: string | null }) {
  if (d.empresaId !== ctx.empresaId || !can(ctx, 'dtc.ver')) return false;
  if (d.confidencialidad === 'restringido' && !can(ctx, 'dtc.restringido')) return false;
  if (!puedeGestionar(ctx) && !d.versionVigenteId && d.responsableId !== ctx.personaId) return false;
  return true;
}

export async function cargarDoc(ctx: Ctx, id: string, tx: DbOrTx = db) {
  const [d] = await tx.select().from(dtcDocumentos).where(eq(dtcDocumentos.id, id));
  if (!d || !puedeVerDoc(ctx, d)) throw notFound('Documento no encontrado');
  return d;
}

/** Personas de los departamentos a los que se distribuye el documento. */
export async function destinatarios(tx: DbOrTx, documentoId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: personas.id })
    .from(personas)
    .innerJoin(dtcDistribucion, eq(dtcDistribucion.departamentoId, personas.departamentoId))
    .where(and(eq(dtcDistribucion.documentoId, documentoId), eq(personas.activo, true), isNull(personas.archivadoEn)));
  return rows.map((r) => r.id);
}

/* ───────────── Flujo de versiones ───────────── */

export async function nuevaVersion(tx: Tx, ctx: Ctx, documentoId: string, input: { archivoId: string; numero?: string | null; mayor?: boolean; resumenCambios?: string | null }) {
  if (!can(ctx, 'dtc.editar')) throw forbidden();
  const [d] = await tx.select().from(dtcDocumentos).where(eq(dtcDocumentos.id, documentoId)).for('update');
  if (!d || !puedeVerDoc(ctx, d)) throw notFound('Documento no encontrado');
  if (d.archivadoEn) throw conflict('El documento está archivado');
  const [arch] = await tx.select({ e: archivos.empresaId }).from(archivos).where(eq(archivos.id, input.archivoId));
  if (!arch || arch.e !== ctx.empresaId) throw badRequest('Archivo no válido');
  const vs = await tx.select().from(dtcVersiones).where(eq(dtcVersiones.documentoId, documentoId));
  if (vs.some((v) => ['borrador', 'en_revision'].includes(v.estado))) throw conflict('Ya hay una versión en preparación o en revisión. Termina esa antes de subir otra.');
  const ultima = vs.map((v) => v.numero).sort(compararVersion).at(-1) ?? null;
  const numero = (input.numero?.trim() || dtcShared.siguienteVersion(ultima, input.mayor)).slice(0, 20);
  if (vs.some((v) => v.numero === numero)) throw conflict(`Ya existe la versión ${numero}`);
  if (ultima && compararVersion(numero, ultima) <= 0) throw badRequest(`La versión debe ser posterior a la ${ultima}`);
  const [v] = await tx
    .insert(dtcVersiones)
    .values({ documentoId, numero, archivoId: input.archivoId, resumenCambios: input.resumenCambios ?? null, autorId: ctx.personaId, autorUsuarioId: ctx.usuarioId === NADIE ? null : ctx.usuarioId })
    .returning();
  await audit(tx, ctx, 'nueva_version', 'dtc_documento', documentoId, { version: numero });
  return v!;
}

export function compararVersion(a: string, b: string) {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

async function cargarVersion(tx: Tx, ctx: Ctx, versionId: string) {
  const [v] = await tx.select().from(dtcVersiones).where(eq(dtcVersiones.id, versionId)).for('update');
  if (!v) throw notFound('Versión no encontrada');
  const [d] = await tx.select().from(dtcDocumentos).where(eq(dtcDocumentos.id, v.documentoId)).for('update');
  if (!d || !puedeVerDoc(ctx, d)) throw notFound('Versión no encontrada');
  return { v, d };
}

export async function enviarARevision(tx: Tx, ctx: Ctx, versionId: string) {
  if (!can(ctx, 'dtc.editar')) throw forbidden();
  const { v, d } = await cargarVersion(tx, ctx, versionId);
  if (v.estado !== 'borrador') throw conflict('Solo se puede enviar a revisión una versión en borrador');
  await tx.update(dtcVersiones).set({ estado: 'en_revision', enviadoEn: new Date() }).where(eq(dtcVersiones.id, v.id));
  await tx.update(dtcDocumentos).set({ estado: 'en_revision' }).where(eq(dtcDocumentos.id, d.id));
  await audit(tx, ctx, 'enviar_revision', 'dtc_documento', d.id, { version: v.numero });
  await notify(tx, ctx, {
    modulo: 'dtc',
    tipo: 'revision',
    titulo: `Revisar ${d.codigo} v${v.numero}`,
    cuerpo: `${d.titulo}${v.resumenCambios ? ` · ${v.resumenCambios}` : ''}`,
    enlace: `/dtc/documentos/${d.id}`,
    ...(d.revisorId ? { personaIds: [d.revisorId] } : { permiso: 'dtc.aprobar' }),
  });
}

export async function aprobarVersion(tx: Tx, ctx: Ctx, versionId: string) {
  if (!can(ctx, 'dtc.aprobar')) throw forbidden('No puedes aprobar documentación técnica');
  const { v, d } = await cargarVersion(tx, ctx, versionId);
  if (v.estado !== 'en_revision') throw conflict('Esta versión no está pendiente de revisión');
  if (!ctx.isAdmin && v.autorId && v.autorId === ctx.personaId) throw forbidden('No puedes aprobar una versión que has redactado tú: debe revisarla otra persona');
  const ahora = new Date();
  // la versión vigente anterior pasa a obsoleta (sigue disponible en el historial)
  await tx.update(dtcVersiones).set({ estado: 'obsoleta', obsoletaEn: ahora }).where(and(eq(dtcVersiones.documentoId, d.id), eq(dtcVersiones.estado, 'aprobada')));
  await tx.update(dtcVersiones).set({ estado: 'aprobada', aprobadoPor: ctx.personaId, aprobadoEn: ahora }).where(eq(dtcVersiones.id, v.id));
  await tx
    .update(dtcDocumentos)
    .set({ estado: 'aprobado', versionVigenteId: v.id, versionVigente: v.numero, proximaRevision: sumarMeses(hoyMadrid(), d.revisionMeses), avisoRevisionEn: null })
    .where(eq(dtcDocumentos.id, d.id));
  await audit(tx, ctx, 'aprobar_version', 'dtc_documento', d.id, { version: v.numero, anterior: d.versionVigente });
  const lectores = await destinatarios(tx, d.id);
  if (lectores.length)
    await notify(tx, ctx, { modulo: 'dtc', tipo: 'lectura', titulo: `Nueva versión para leer: ${d.titulo} (v${v.numero})`, cuerpo: v.resumenCambios ?? null, enlace: `/dtc/documentos/${d.id}`, personaIds: lectores });
  await notify(tx, ctx, { modulo: 'dtc', tipo: 'aprobada', titulo: `${d.codigo} v${v.numero} aprobada`, enlace: `/dtc/documentos/${d.id}`, personaIds: [v.autorId, d.responsableId] });
}

export async function rechazarVersion(tx: Tx, ctx: Ctx, versionId: string, motivo: string | null) {
  if (!can(ctx, 'dtc.aprobar')) throw forbidden('No puedes revisar documentación técnica');
  const { v, d } = await cargarVersion(tx, ctx, versionId);
  if (v.estado !== 'en_revision') throw conflict('Esta versión no está pendiente de revisión');
  await tx.update(dtcVersiones).set({ estado: 'rechazada', rechazoMotivo: motivo }).where(eq(dtcVersiones.id, v.id));
  await tx.update(dtcDocumentos).set({ estado: d.versionVigenteId ? 'aprobado' : 'borrador' }).where(eq(dtcDocumentos.id, d.id));
  await audit(tx, ctx, 'rechazar_version', 'dtc_documento', d.id, { version: v.numero, motivo });
  await notify(tx, ctx, { modulo: 'dtc', tipo: 'rechazada', titulo: `${d.codigo} v${v.numero} devuelta`, cuerpo: motivo, enlace: `/dtc/documentos/${d.id}`, personaIds: [v.autorId] });
}

/* ───────────── Lecturas ───────────── */

export async function pendientesDeLeer(ctx: Ctx, limit = 100) {
  if (!ctx.personaId || !ctx.departamentoId || !can(ctx, 'dtc.ver')) return [];
  return db
    .select({ id: dtcDocumentos.id, codigo: dtcDocumentos.codigo, titulo: dtcDocumentos.titulo, tipo: dtcDocumentos.tipo, version: dtcDocumentos.versionVigente, versionId: dtcVersiones.id, aprobadoEn: dtcVersiones.aprobadoEn, resumenCambios: dtcVersiones.resumenCambios })
    .from(dtcDocumentos)
    .innerJoin(dtcVersiones, eq(dtcVersiones.id, dtcDocumentos.versionVigenteId))
    .innerJoin(dtcDistribucion, and(eq(dtcDistribucion.documentoId, dtcDocumentos.id), eq(dtcDistribucion.departamentoId, ctx.departamentoId)))
    .where(
      and(
        eq(dtcDocumentos.empresaId, ctx.empresaId),
        isNull(dtcDocumentos.archivadoEn),
        ne(dtcDocumentos.estado, 'obsoleto'),
        can(ctx, 'dtc.restringido') ? undefined : ne(dtcDocumentos.confidencialidad, 'restringido'),
        sql`NOT EXISTS (SELECT 1 FROM dtc_lecturas l WHERE l.version_id = ${dtcVersiones.id} AND l.persona_id = ${ctx.personaId})`,
      ),
    )
    .orderBy(desc(dtcVersiones.aprobadoEn))
    .limit(limit);
}

export async function marcarLeido(tx: Tx, ctx: Ctx, documentoId: string) {
  if (!ctx.personaId) throw badRequest('Tu usuario no está asociado a una persona');
  const d = await cargarDoc(ctx, documentoId, tx);
  if (!d.versionVigenteId) throw conflict('El documento aún no tiene una versión aprobada');
  const r = await tx.insert(dtcLecturas).values({ documentoId, versionId: d.versionVigenteId, personaId: ctx.personaId }).onConflictDoNothing().returning();
  if (r.length) await audit(tx, ctx, 'leido', 'dtc_documento', documentoId, { version: d.versionVigente });
  return { ok: true, version: d.versionVigente };
}

/** Quién ha leído (y quién no) la versión vigente de un documento. */
export async function informeLecturas(ctx: Ctx, documentoId: string) {
  const d = await cargarDoc(ctx, documentoId);
  if (!d.versionVigenteId) return { version: null, personas: [], leidas: 0, total: 0 };
  const deps = await db.select({ id: dtcDistribucion.departamentoId }).from(dtcDistribucion).where(eq(dtcDistribucion.documentoId, documentoId));
  const lect = await db.select({ personaId: dtcLecturas.personaId, leidoEn: dtcLecturas.leidoEn }).from(dtcLecturas).where(eq(dtcLecturas.versionId, d.versionVigenteId));
  const ids = new Set(lect.map((l) => l.personaId));
  const conds: SQL[] = [];
  if (deps.length) conds.push(and(inArray(personas.departamentoId, deps.map((x) => x.id)), eq(personas.activo, true), isNull(personas.archivadoEn))!);
  if (ids.size) conds.push(inArray(personas.id, [...ids]));
  const ps = conds.length
    ? await db
        .select({ id: personas.id, nombre: sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`, departamento: departamentos.nombre, departamentoId: personas.departamentoId })
        .from(personas)
        .leftJoin(departamentos, eq(departamentos.id, personas.departamentoId))
        .where(and(eq(personas.empresaId, ctx.empresaId), or(...conds)))
        .orderBy(departamentos.nombre, personas.nombre)
    : [];
  const leidoEn = new Map(lect.map((l) => [l.personaId, l.leidoEn]));
  const depSet = new Set(deps.map((x) => x.id));
  const out = ps.map((p) => ({ ...p, debeLeer: !!p.departamentoId && depSet.has(p.departamentoId), leidoEn: leidoEn.get(p.id) ?? null }));
  const deben = out.filter((p) => p.debeLeer);
  return { version: d.versionVigente, personas: out, leidas: deben.filter((p) => p.leidoEn).length, total: deben.length };
}

/* ───────────── Vínculos ───────────── */

export async function etiquetasVinculos(ctx: Ctx, rows: { id: string; entidad: string; entidadId: string }[]) {
  const out: { id: string; entidad: string; entidadId: string; label: string | null }[] = [];
  const porEntidad = new Map<string, string[]>();
  for (const r of rows) porEntidad.set(r.entidad, [...(porEntidad.get(r.entidad) ?? []), r.entidadId]);
  const labels = new Map<string, string>();
  for (const [entidad, ids] of porEntidad) {
    const target = dtcShared.DTC_VINCULO_REF[entidad as dtcShared.DtcVinculo];
    if (!target) continue;
    try {
      for (const r of await searchRefs(ctx, target, '', ids, {})) labels.set(`${entidad}:${r.id}`, r.label);
    } catch {
      /* módulo no disponible */
    }
  }
  for (const r of rows) out.push({ ...r, label: labels.get(`${r.entidad}:${r.entidadId}`) ?? null });
  return out;
}

/** Documentos visibles vinculados a alguna de las entidades indicadas. */
export async function documentosVinculados(ctx: Ctx, refs: { entidad: string; id: string }[]) {
  if (!refs.length || !can(ctx, 'dtc.ver')) return [];
  const rows = await db
    .selectDistinctOn([dtcDocumentos.id], {
      id: dtcDocumentos.id,
      codigo: dtcDocumentos.codigo,
      titulo: dtcDocumentos.titulo,
      tipo: dtcDocumentos.tipo,
      estado: dtcDocumentos.estado,
      confidencialidad: dtcDocumentos.confidencialidad,
      version: dtcDocumentos.versionVigente,
      archivoId: dtcVersiones.archivoId,
      nombreArchivo: archivos.nombre,
      vinculoId: dtcVinculos.id,
      entidad: dtcVinculos.entidad,
    })
    .from(dtcVinculos)
    .innerJoin(dtcDocumentos, eq(dtcDocumentos.id, dtcVinculos.documentoId))
    .leftJoin(dtcVersiones, eq(dtcVersiones.id, dtcDocumentos.versionVigenteId))
    .leftJoin(archivos, eq(archivos.id, dtcVersiones.archivoId))
    .where(and(eq(dtcDocumentos.empresaId, ctx.empresaId), isNull(dtcDocumentos.archivadoEn), or(...refs.map((r) => and(eq(dtcVinculos.entidad, r.entidad), eq(dtcVinculos.entidadId, r.id)))), visibilidad(ctx)))
    .orderBy(dtcDocumentos.id)
    .limit(100);
  return rows.map(({ archivoId, ...r }) => ({ ...r, url: fileUrl(archivoId) }));
}

/** Manuales públicos (confidencialidad "público", vigentes) para el portal del cliente. */
export async function manualesPublicos(empresaId: string, refs: { entidad: string; id: string }[]) {
  if (!refs.length) return [];
  const rows = await db
    .selectDistinct({ titulo: dtcDocumentos.titulo, tipo: dtcDocumentos.tipo, version: dtcDocumentos.versionVigente, archivoId: dtcVersiones.archivoId })
    .from(dtcVinculos)
    .innerJoin(dtcDocumentos, eq(dtcDocumentos.id, dtcVinculos.documentoId))
    .innerJoin(dtcVersiones, eq(dtcVersiones.id, dtcDocumentos.versionVigenteId))
    .where(and(eq(dtcDocumentos.empresaId, empresaId), eq(dtcDocumentos.confidencialidad, 'publico'), ne(dtcDocumentos.estado, 'obsoleto'), isNull(dtcDocumentos.archivadoEn), or(...refs.map((r) => and(eq(dtcVinculos.entidad, r.entidad), eq(dtcVinculos.entidadId, r.id))))))
    .limit(20);
  return rows.map((r) => ({ titulo: r.titulo, tipo: r.tipo, version: r.version, url: fileUrl(r.archivoId, 6 * 3600) }));
}

/* ───────────── Tarea programada ───────────── */

/** Avisa al responsable de los documentos cuya revisión periódica ha vencido (como mucho una vez por semana). */
export async function avisarRevisiones(empresaId: string, ctx: Ctx) {
  const hoy = hoyMadrid();
  const haceSemana = new Date(Date.parse(hoy + 'T12:00:00Z') - 7 * 86400_000).toISOString().slice(0, 10);
  const docs = await db
    .select()
    .from(dtcDocumentos)
    .where(
      and(
        eq(dtcDocumentos.empresaId, empresaId),
        isNull(dtcDocumentos.archivadoEn),
        inArray(dtcDocumentos.estado, ['aprobado', 'en_revision']),
        lte(dtcDocumentos.proximaRevision, hoy),
        or(isNull(dtcDocumentos.avisoRevisionEn), lte(dtcDocumentos.avisoRevisionEn, haceSemana)),
      ),
    );
  for (const d of docs) {
    await db.transaction(async (tx) => {
      await tx.update(dtcDocumentos).set({ avisoRevisionEn: hoy }).where(eq(dtcDocumentos.id, d.id));
      await notify(tx, ctx, {
        modulo: 'dtc',
        tipo: 'revision_periodica',
        titulo: `Toca revisar ${d.codigo}: ${d.titulo}`,
        cuerpo: `La revisión periódica venció el ${d.proximaRevision!.split('-').reverse().join('/')}. Sube una nueva versión o confirma que sigue vigente.`,
        enlace: `/dtc/documentos/${d.id}`,
        ...(d.responsableId ? { personaIds: [d.responsableId] } : { permiso: 'dtc.editar' }),
      });
    });
  }
  return docs.length;
}
