import { and, desc, eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { biShared } from '@kite/shared';
import { db } from '../../db/client';
import { audit } from '../../core/audit';
import { buildCtx } from '../../core/auth';
import type { Ctx } from '../../core/context';
import { badRequest, forbidden, notFound, parse } from '../../core/errors';
import { saveFile } from '../../core/files';
import { emailLayout, queueEmail } from '../../core/mail';
import { guard } from '../../core/permissions';
import { getEmpresa } from '../../core/settings';
import { config } from '../../config';
import { fileOut } from '../cnt/excel';
import { datasetPermitido, ejecutarInforme, type DefinicionInforme } from './datasets';
import { informePdf, informeXlsx } from './export';
import { panelDireccion } from './panel';
import { biInformes } from './schema';

const PERIODOS = biShared.BI_PERIODOS.map((p) => p.value) as [string, ...string[]];
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const defSchema = z.object({
  dataset: z.string().min(1),
  filtros: z.object({ periodo: z.enum(PERIODOS).default('anio_actual'), desde: fecha.nullish(), hasta: fecha.nullish(), campos: z.record(z.string(), z.string()).optional() }),
  columnas: z.array(z.string()).max(40).default([]),
  agruparPor: z.string().nullish(),
  orden: z.string().nullish(),
});
const informeSchema = defSchema.extend({
  nombre: z.string().trim().min(1, 'Ponle un nombre').max(120),
  descripcion: z.string().trim().max(500).nullish(),
  compartido: z.boolean().default(false),
  programacion: z.enum(['ninguna', 'diaria', 'semanal', 'mensual']).default('ninguna'),
  destinatarios: z.array(z.string().trim().email('Email no válido')).max(20).default([]),
});

const ver = { preHandler: guard('bi.ver') };

async function cargarInforme(ctx: Ctx, id: string) {
  const [i] = await db.select().from(biInformes).where(and(eq(biInformes.id, id), eq(biInformes.empresaId, ctx.empresaId)));
  if (!i) throw notFound('Informe no encontrado');
  if (i.propietarioId !== ctx.usuarioId && !i.compartido) throw notFound('Informe no encontrado');
  return i;
}
const defDe = (i: typeof biInformes.$inferSelect): DefinicionInforme => ({ dataset: i.dataset, filtros: i.filtros as biShared.BiFiltros, columnas: i.columnas, agruparPor: i.agruparPor, orden: i.orden });

async function exportar(ctx: Ctx, nombre: string, def: DefinicionInforme, formato: string) {
  const r = await ejecutarInforme(ctx, def);
  const base = nombre.replace(/[^\w\-áéíóúñü ]+/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'informe';
  if (formato === 'pdf') {
    const e = await getEmpresa(ctx.empresaId);
    return { buffer: await informePdf(nombre, e.nombre, r), mime: 'application/pdf', name: `${base}.pdf` };
  }
  return { buffer: await informeXlsx(nombre, r), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `${base}.xlsx` };
}

export async function biRoutes(app: FastifyInstance) {
  /** Conjuntos de datos que el usuario puede usar (según módulos activos y permisos). */
  app.get('/datasets', ver, async (req) => biShared.BI_DATASETS.filter((d) => datasetPermitido(req.ctx, d.key)));

  app.post('/ejecutar', ver, async (req) => ejecutarInforme(req.ctx, parse(defSchema, req.body) as DefinicionInforme));

  /** Exportar un informe sin guardar: la definición viaja codificada en la URL (no lleva datos personales). */
  app.get('/exportar', ver, async (req) => {
    const q = req.query as { def?: string; formato?: string; nombre?: string };
    let raw: unknown;
    try {
      raw = JSON.parse(q.def ?? '');
    } catch {
      throw badRequest('Definición del informe no válida');
    }
    const f = await exportar(req.ctx, (q.nombre ?? 'Informe').slice(0, 120), parse(defSchema, raw) as DefinicionInforme, q.formato ?? 'xlsx');
    return fileOut(f.buffer, f.name, f.mime);
  });

  /* ── Informes guardados ── */
  app.get('/informes', ver, async (req) => {
    const ctx = req.ctx;
    const rows = await db
      .select()
      .from(biInformes)
      .where(and(eq(biInformes.empresaId, ctx.empresaId), or(eq(biInformes.propietarioId, ctx.usuarioId), eq(biInformes.compartido, true))))
      .orderBy(desc(biInformes.actualizadoEn));
    return rows
      .filter((r) => datasetPermitido(ctx, r.dataset))
      .map((r) => ({ ...r, mio: r.propietarioId === ctx.usuarioId, dataset: r.dataset, datasetLabel: biShared.biDataset(r.dataset)?.label ?? r.dataset }));
  });

  app.post('/informes', ver, async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(informeSchema, req.body);
    if (!datasetPermitido(ctx, b.dataset)) throw forbidden('No tienes acceso a este conjunto de datos');
    const row = await db.transaction(async (tx) => {
      const [i] = await tx
        .insert(biInformes)
        .values({ empresaId: ctx.empresaId, propietarioId: ctx.usuarioId, nombre: b.nombre, descripcion: b.descripcion ?? null, dataset: b.dataset, filtros: b.filtros, columnas: b.columnas, agruparPor: b.agruparPor ?? null, orden: b.orden ?? null, compartido: b.compartido, programacion: b.programacion, destinatarios: b.destinatarios })
        .returning();
      await audit(tx, ctx, 'crear', 'bi_informe', i!.id, { nombre: b.nombre, dataset: b.dataset });
      return i!;
    });
    reply.code(201);
    return row;
  });

  app.patch('/informes/:id', ver, async (req) => {
    const ctx = req.ctx;
    const i = await cargarInforme(ctx, (req.params as { id: string }).id);
    if (i.propietarioId !== ctx.usuarioId) throw forbidden('Solo quien creó el informe puede cambiarlo');
    const b = parse(informeSchema.partial(), req.body);
    if (b.dataset && !datasetPermitido(ctx, b.dataset)) throw forbidden();
    return db.transaction(async (tx) => {
      const [u] = await tx.update(biInformes).set(b).where(eq(biInformes.id, i.id)).returning();
      await audit(tx, ctx, 'editar', 'bi_informe', i.id, b);
      return u;
    });
  });

  app.delete('/informes/:id', ver, async (req) => {
    const ctx = req.ctx;
    const i = await cargarInforme(ctx, (req.params as { id: string }).id);
    if (i.propietarioId !== ctx.usuarioId && !ctx.isAdmin) throw forbidden('Solo quien creó el informe puede borrarlo');
    await db.transaction(async (tx) => {
      await tx.delete(biInformes).where(eq(biInformes.id, i.id));
      await audit(tx, ctx, 'borrar', 'bi_informe', i.id, { nombre: i.nombre });
    });
    return { ok: true };
  });

  /** Cada persona ve el informe con SUS permisos: un informe compartido no amplía lo que puede ver. */
  app.get('/informes/:id/ejecutar', ver, async (req) => {
    const i = await cargarInforme(req.ctx, (req.params as { id: string }).id);
    return { informe: i, ...(await ejecutarInforme(req.ctx, defDe(i))) };
  });

  app.get('/informes/:id/exportar', ver, async (req) => {
    const i = await cargarInforme(req.ctx, (req.params as { id: string }).id);
    const f = await exportar(req.ctx, i.nombre, defDe(i), (req.query as { formato?: string }).formato ?? 'xlsx');
    return fileOut(f.buffer, f.name, f.mime);
  });

  /* ── Panel de dirección ── */
  app.get('/panel', ver, async (req) => {
    const q = req.query as Record<string, string>;
    const anio = new Date().getFullYear();
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.desde ?? '') ? q.desde! : `${anio}-01-01`;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(q.hasta ?? '') ? q.hasta! : new Date().toISOString().slice(0, 10);
    if (desde > hasta) throw badRequest('La fecha de inicio es posterior a la de fin');
    return { desde, hasta, ...(await panelDireccion(req.ctx, { desde, hasta, comercialId: q.comercialId || null, familiaId: q.familiaId || null })) };
  });
}

/** ¿Toca enviar hoy este informe? */
function tocaHoy(prog: string, hoy: Date, ultimo: string | null, hoyIso: string) {
  if (ultimo === hoyIso) return false;
  if (prog === 'diaria') return true;
  if (prog === 'semanal') return hoy.getUTCDay() === 1;
  if (prog === 'mensual') return hoy.getUTCDate() === 1;
  return false;
}

/**
 * Envío programado: se genera con los permisos del propietario (si ya no tiene acceso, no se envía)
 * y se manda como Excel adjunto a los destinatarios indicados.
 */
export async function enviarProgramados(empresaId: string) {
  const hoy = new Date();
  const hoyIso = hoy.toISOString().slice(0, 10);
  const rows = await db.select().from(biInformes).where(eq(biInformes.empresaId, empresaId));
  const empresa = await getEmpresa(empresaId);
  let enviados = 0;
  for (const i of rows) {
    if (i.programacion === 'ninguna' || !i.destinatarios.length || !tocaHoy(i.programacion, hoy, i.ultimoEnvio, hoyIso)) continue;
    let ctx: Ctx;
    try {
      ctx = await buildCtx({ usuarioId: i.propietarioId, empresaId, ip: null });
    } catch {
      continue; // el propietario ya no tiene acceso a la empresa
    }
    if (!datasetPermitido(ctx, i.dataset)) continue;
    const f = await exportar(ctx, i.nombre, defDe(i), 'xlsx');
    await db.transaction(async (tx) => {
      const arch = await saveFile(tx, { empresaId, nombre: f.name, mime: f.mime, data: f.buffer, subidoPor: i.propietarioId });
      for (const para of i.destinatarios)
        await queueEmail(tx, {
          empresaId,
          para,
          asunto: `${i.nombre} · ${empresa.nombre}`,
          html: emailLayout({ empresa: empresa.nombre, titulo: i.nombre, cuerpo: `Te enviamos el informe «${i.nombre}» actualizado a ${hoyIso.split('-').reverse().join('/')}. Lo tienes adjunto en Excel.`, boton: { texto: 'Abrir en KiteERP', url: `${config.appUrl}/informes?id=${i.id}` } }),
          adjuntos: [{ archivoId: arch.id, nombre: f.name }],
        });
      await tx.update(biInformes).set({ ultimoEnvio: hoyIso }).where(eq(biInformes.id, i.id));
    });
    enviados++;
  }
  return enviados;
}
