import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { ficShared, fmtDate, fmtMoney, nomShared, optionLabel, type ApprovalItem, type DashboardWidget } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { personas } from '../../db/schema/core';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, forbidden, notFound, parse } from '../../core/errors';
import { emit } from '../../core/events';
import { fileBuffer, fileUrl, getFile, saveFile } from '../../core/files';
import { defineModule } from '../../core/modules';
import { notify } from '../../core/notify';
import { renderTextPdf } from '../../core/pdf';
import { can, canOnOwner, guard } from '../../core/permissions';
import { getEmpresa } from '../../core/settings';
import { ficTrabajadores } from '../fic/schema';
import { condAlcance, nombrePersona, nombres, personaPorId, personasActivas } from '../fic/personas';
import { horasMes } from '../hor/calculo';
import { hoyMadrid, limitesMes } from '../hor/tiempo';
import { ausSolicitudes, ausTipos } from '../aus/schema';
import { nomAnticipos, nomPeriodos, nomRecibos, nomVariables } from './schema';
import { agruparPaginas, extraerPaginas, textoPorPagina } from './pdf';
import { seedNom } from './seed';

const { variableResource, VARIABLE_CONCEPTOS, CONCEPTOS_DESCUENTO, nombrePeriodo, RECIBO_TIPOS } = nomShared;

/* ──────────────── Ayudantes ──────────────── */

async function periodoDe(ctx: Ctx, id: string) {
  const [p] = await db.select().from(nomPeriodos).where(and(eq(nomPeriodos.id, id), eq(nomPeriodos.empresaId, ctx.empresaId)));
  if (!p) throw notFound('Periodo no encontrado');
  return p;
}

/** Periodo abierto para un mes (lo crea si no existe; si está cerrado, usa el siguiente). */
export async function periodoAbierto(tx: Tx, empresaId: string, anio: number, mes: number): Promise<typeof nomPeriodos.$inferSelect> {
  for (let i = 0; i < 24; i++) {
    const [p] = await tx.select().from(nomPeriodos).where(and(eq(nomPeriodos.empresaId, empresaId), eq(nomPeriodos.anio, anio), eq(nomPeriodos.mes, mes)));
    if (!p) {
      const [n] = await tx.insert(nomPeriodos).values({ empresaId, anio, mes }).onConflictDoNothing().returning();
      if (n) return n;
      continue;
    }
    if (p.estado === 'abierto') return p;
    mes++;
    if (mes > 12) {
      mes = 1;
      anio++;
    }
  }
  throw badRequest('No hay ningún periodo de nómina abierto');
}

/** Normaliza un DNI para comparar. */
const norm = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[\s-]/g, '');

async function precioHora(personaId: string) {
  const [f] = await db.select({ s: ficTrabajadores.salarioBruto, j: ficTrabajadores.jornadaHoras }).from(ficTrabajadores).where(eq(ficTrabajadores.personaId, personaId));
  if (!f?.s) return 0;
  return Math.round((Number(f.s) / ((Number(f.j) || 40) * 52)) * 100) / 100;
}

/** Procesa PDFs de recibos: si un PDF contiene varios trabajadores, lo separa por páginas detectando el DNI. */
async function procesarRecibos(
  tx: Tx,
  ctx: Ctx,
  archivoIds: string[],
  opts: { periodoId: string | null; anio: number; mes: number | null; tipo: string; titulo: string },
) {
  const fichas = await tx
    .select({ personaId: ficTrabajadores.personaId, dni: ficTrabajadores.dni })
    .from(ficTrabajadores)
    .where(and(eq(ficTrabajadores.empresaId, ctx.empresaId), sql`${ficTrabajadores.dni} IS NOT NULL`));
  const porDni = new Map(fichas.map((f) => [norm(f.dni), f.personaId]));
  const creados: { id: string; personaId: string | null; persona: string | null; dni: string | null; paginas: string; nombre: string }[] = [];
  for (const archivoId of archivoIds) {
    const arch = await getFile(tx, archivoId);
    if (arch.empresaId !== ctx.empresaId) throw forbidden();
    if (!arch.mime.includes('pdf') && !arch.nombre.toLowerCase().endsWith('.pdf')) throw badRequest(`${arch.nombre} no es un PDF`);
    const buf = await fileBuffer(arch.ruta);
    let textos: string[];
    try {
      textos = await textoPorPagina(buf);
    } catch {
      throw badRequest(`No se ha podido leer ${arch.nombre}. Comprueba que es un PDF con texto (no escaneado).`);
    }
    const trozos = agruparPaginas(textos, new Set(porDni.keys()));
    const unico = trozos.length === 1;
    for (const t of trozos) {
      const personaId = t.dni ? (porDni.get(t.dni) ?? null) : null;
      let fileId = archivoId;
      if (!unico) {
        const parte = await extraerPaginas(buf, t.paginas);
        const n = personaId ? (await nombres(tx, [personaId]))[personaId] : 'sin asignar';
        fileId = (await saveFile(tx, { empresaId: ctx.empresaId, nombre: `${opts.titulo} - ${n}.pdf`, mime: 'application/pdf', data: parte, subidoPor: ctx.usuarioId })).id;
      }
      const paginas = t.paginas.length === 1 ? `${t.paginas[0]! + 1}` : `${t.paginas[0]! + 1}-${t.paginas[t.paginas.length - 1]! + 1}`;
      if (personaId && opts.periodoId) {
        // si ya había un recibo de esa persona en el periodo, se sustituye
        await tx.delete(nomRecibos).where(and(eq(nomRecibos.periodoId, opts.periodoId), eq(nomRecibos.personaId, personaId), eq(nomRecibos.tipo, opts.tipo)));
      }
      const [r] = await tx
        .insert(nomRecibos)
        .values({
          empresaId: ctx.empresaId,
          periodoId: opts.periodoId,
          personaId,
          tipo: opts.tipo,
          titulo: opts.titulo,
          anio: opts.anio,
          mes: opts.mes,
          archivoId: fileId,
          origenArchivoId: unico ? null : archivoId,
          paginas: unico ? null : paginas,
          dniDetectado: t.dni,
          publicadoPor: ctx.usuarioId,
        })
        .returning();
      const nombre = personaId ? (await nombres(tx, [personaId]))[personaId]! : '';
      creados.push({ id: r!.id, personaId, persona: nombre || null, dni: t.dni, paginas, nombre: arch.nombre });
      if (personaId)
        await notify(tx, ctx, { modulo: 'nom', tipo: 'recibo', titulo: `Ya tienes disponible: ${opts.titulo}`, enlace: '/mis-nominas', personaIds: [personaId], email: true });
    }
  }
  await audit(tx, ctx, 'publicar_recibos', 'nom_recibo', opts.periodoId, { archivos: archivoIds.length, recibos: creados.length, sinAsignar: creados.filter((c) => !c.personaId).length });
  return { creados, asignados: creados.filter((c) => c.personaId).length, sinAsignar: creados.filter((c) => !c.personaId).length };
}

/* ──────────────── Rutas ──────────────── */

async function routes(app: FastifyInstance) {
  /* ── Periodos ── */
  app.get('/periodos', { preHandler: guard('nom.gestionar') }, async (req) => {
    const rows = await db
      .select({
        p: nomPeriodos,
        variables: sql<number>`(SELECT count(*)::int FROM nom_variables v WHERE v.periodo_id = ${nomPeriodos.id})`,
        importeVariables: sql<number>`(SELECT coalesce(sum(CASE WHEN v.concepto IN ('anticipo','embargo') THEN -v.importe ELSE v.importe END), 0)::float FROM nom_variables v WHERE v.periodo_id = ${nomPeriodos.id})`,
        recibos: sql<number>`(SELECT count(*)::int FROM nom_recibos r WHERE r.periodo_id = ${nomPeriodos.id})`,
        sinAsignar: sql<number>`(SELECT count(*)::int FROM nom_recibos r WHERE r.periodo_id = ${nomPeriodos.id} AND r.persona_id IS NULL)`,
        leidos: sql<number>`(SELECT count(*)::int FROM nom_recibos r WHERE r.periodo_id = ${nomPeriodos.id} AND r.leido_en IS NOT NULL)`,
      })
      .from(nomPeriodos)
      .where(eq(nomPeriodos.empresaId, req.ctx.empresaId))
      .orderBy(desc(nomPeriodos.anio), desc(nomPeriodos.mes));
    return rows.map((r) => ({ ...r.p, nombre: nombrePeriodo(r.p.anio, r.p.mes), variables: r.variables, importeVariables: r.importeVariables, recibos: r.recibos, sinAsignar: r.sinAsignar, leidos: r.leidos }));
  });

  app.post('/periodos', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const b = parse(z.object({ anio: z.number().int().min(2000).max(2100), mes: z.number().int().min(1).max(12) }), req.body);
    return db.transaction(async (tx) => {
      const [p] = await tx.insert(nomPeriodos).values({ empresaId: ctx.empresaId, ...b }).onConflictDoNothing().returning();
      if (!p) throw conflict(`El periodo ${nombrePeriodo(b.anio, b.mes)} ya existe`);
      await audit(tx, ctx, 'crear', 'nom_periodo', p.id, p);
      return { ...p, nombre: nombrePeriodo(p.anio, p.mes) };
    });
  });

  app.get('/periodos/:id', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const p = await periodoDe(ctx, (req.params as { id: string }).id);
    const vars = await db.select().from(nomVariables).where(eq(nomVariables.periodoId, p.id)).orderBy(asc(nomVariables.creadoEn));
    const recibos = await db.select().from(nomRecibos).where(eq(nomRecibos.periodoId, p.id));
    const lista = await personasActivas(db, ctx.empresaId, null);
    const extra = [...new Set([...vars.map((v) => v.personaId), ...recibos.map((r) => r.personaId).filter(Boolean)])].filter((id) => !lista.some((l) => l.id === id)) as string[];
    const todas = [...lista, ...(await personasActivas(db, ctx.empresaId, extra, true))];
    return {
      ...p,
      nombre: nombrePeriodo(p.anio, p.mes),
      personas: todas.map((x) => {
        const vs = vars.filter((v) => v.personaId === x.id);
        const r = recibos.find((rr) => rr.personaId === x.id && rr.tipo === 'nomina');
        return {
          personaId: x.id,
          nombre: x.nombre,
          departamento: x.departamento,
          variables: vs,
          total: Math.round(vs.reduce((a, v) => a + (CONCEPTOS_DESCUENTO.includes(v.concepto) ? -1 : 1) * Number(v.importe), 0) * 100) / 100,
          recibo: r ? { id: r.id, leidoEn: r.leidoEn, url: fileUrl(r.archivoId), publicadoEn: r.publicadoEn } : null,
        };
      }),
      sinAsignar: recibos.filter((r) => !r.personaId).map((r) => ({ ...r, url: fileUrl(r.archivoId) })),
    };
  });

  /** Trae las horas extra y nocturnas del control horario. */
  app.post('/periodos/:id/importar-horas', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const p = await periodoDe(ctx, (req.params as { id: string }).id);
    if (p.estado !== 'abierto') throw badRequest('El periodo está cerrado');
    if (!ctx.modules.has('hor')) throw badRequest('El control horario no está activo');
    const { desde, hasta } = limitesMes(`${p.anio}-${String(p.mes).padStart(2, '0')}`);
    const lista = await personasActivas(db, ctx.empresaId, null);
    const horas = await horasMes(
      db,
      ctx.empresaId,
      lista.map((x) => x.id),
      desde,
      hasta,
      ctx.modules,
    );
    let n = 0;
    await db.transaction(async (tx) => {
      await tx.delete(nomVariables).where(and(eq(nomVariables.periodoId, p.id), eq(nomVariables.origen, 'hor')));
      for (const x of lista) {
        const t = horas.get(x.id);
        if (!t) continue;
        const ph = await precioHora(x.id);
        if (t.extra >= 0.25) {
          await tx.insert(nomVariables).values({ empresaId: ctx.empresaId, periodoId: p.id, personaId: x.id, concepto: 'horas_extra', descripcion: `Horas por encima de la jornada prevista (${t.extra} h)`, cantidad: t.extra, importe: Math.round(t.extra * ph * 100) / 100, origen: 'hor', creadoPor: ctx.usuarioId });
          n++;
        }
        if (t.nocturnas >= 0.25) {
          await tx.insert(nomVariables).values({ empresaId: ctx.empresaId, periodoId: p.id, personaId: x.id, concepto: 'nocturnidad', descripcion: `Plus de nocturnidad (${t.nocturnas} h, 25 %)`, cantidad: t.nocturnas, importe: Math.round(t.nocturnas * ph * 0.25 * 100) / 100, origen: 'hor', creadoPor: ctx.usuarioId });
          n++;
        }
      }
      await audit(tx, ctx, 'importar_horas', 'nom_periodo', p.id, { variables: n });
    });
    return { ok: true, variables: n };
  });

  registerCrud(app, {
    path: '/variables',
    resource: variableResource,
    table: nomVariables,
    entity: 'nom_variable',
    perms: { ver: 'nom.gestionar', crear: 'nom.gestionar' },
    hardDelete: true,
    defaults: (ctx) => ({ origen: 'manual', creadoPor: ctx.usuarioId }),
    beforeSave: async (tx, _ctx, data, existing) => {
      const [p] = await tx.select().from(nomPeriodos).where(eq(nomPeriodos.id, (data.periodoId ?? existing?.periodoId) as string));
      if (!p) throw badRequest('Periodo no válido');
      if (p.estado !== 'abierto') throw badRequest('El periodo está cerrado: no se pueden cambiar sus variables');
      return data;
    },
    beforeDelete: async (tx, _ctx, row) => {
      const [p] = await tx.select().from(nomPeriodos).where(eq(nomPeriodos.id, row.periodoId));
      if (p?.estado !== 'abierto') throw badRequest('El periodo está cerrado');
    },
  });

  /** Excel para la gestoría: una fila por persona con sus datos y variables, más el detalle y las ausencias del mes. */
  app.get('/periodos/:id/excel', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const p = await periodoDe(ctx, (req.params as { id: string }).id);
    const { desde, hasta } = limitesMes(`${p.anio}-${String(p.mes).padStart(2, '0')}`);
    const emp = await getEmpresa(ctx.empresaId);
    const vars = await db.select().from(nomVariables).where(eq(nomVariables.periodoId, p.id));
    const lista = await personasActivas(db, ctx.empresaId, null, true);
    const fichas = await db.select().from(ficTrabajadores).where(eq(ficTrabajadores.empresaId, ctx.empresaId));
    const incluidos = lista.filter((x) => x.activo || vars.some((v) => v.personaId === x.id) || fichas.find((f) => f.personaId === x.id && f.fechaBaja && f.fechaBaja >= desde));
    const aus = ctx.modules.has('aus')
      ? await db
          .select({ personaId: ausSolicitudes.personaId, desde: ausSolicitudes.desde, hasta: ausSolicitudes.hasta, dias: ausSolicitudes.dias, tipo: ausTipos.nombre, retribuido: ausTipos.retribuido, clave: ausTipos.clave })
          .from(ausSolicitudes)
          .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
          .where(and(eq(ausSolicitudes.empresaId, ctx.empresaId), eq(ausSolicitudes.estado, 'aprobada'), lte(ausSolicitudes.desde, hasta), gte(ausSolicitudes.hasta, desde)))
      : [];
    const wb = new ExcelJS.Workbook();
    wb.creator = 'KiteERP';
    const ws = wb.addWorksheet('Resumen');
    const conceptos = VARIABLE_CONCEPTOS.map((c) => c.value).filter((c) => vars.some((v) => v.concepto === c));
    ws.addRow([`${emp.razonSocial ?? emp.nombre} · Variables de nómina de ${nombrePeriodo(p.anio, p.mes)}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    const head = ws.addRow(['Código', 'Trabajador', 'DNI/NIE', 'NAF', 'Categoría', 'Grupo', 'Contrato', 'Jornada (h/sem)', 'Alta', 'Baja', 'Salario bruto anual', ...conceptos.map((c) => optionLabel(VARIABLE_CONCEPTOS, c)!.label), 'Total variables', 'Días de IT', 'Días no retribuidos', 'Otras ausencias', 'Observaciones']);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E2A78' } }));
    const [personasDb] = [await db.select({ id: personas.id, codigo: personas.codigoEmpleado }).from(personas).where(eq(personas.empresaId, ctx.empresaId))];
    for (const x of incluidos) {
      const f = fichas.find((ff) => ff.personaId === x.id);
      const vs = vars.filter((v) => v.personaId === x.id);
      const as = aus.filter((a) => a.personaId === x.id);
      const diasEn = (a: (typeof as)[number]) => {
        const d0 = a.desde < desde ? desde : a.desde;
        const d1 = a.hasta > hasta ? hasta : a.hasta;
        return Math.round((new Date(d1 + 'T12:00:00Z').getTime() - new Date(d0 + 'T12:00:00Z').getTime()) / 86400000) + 1;
      };
      const it = as.filter((a) => a.clave === 'baja_medica').reduce((s, a) => s + diasEn(a), 0);
      const nr = as.filter((a) => !a.retribuido).reduce((s, a) => s + diasEn(a), 0);
      const otras = as.filter((a) => a.clave !== 'baja_medica' && a.retribuido).map((a) => `${a.tipo} ${fmtDate(a.desde).slice(0, 5)}${a.hasta !== a.desde ? '–' + fmtDate(a.hasta).slice(0, 5) : ''}`);
      ws.addRow([
        personasDb.find((pp) => pp.id === x.id)?.codigo ?? '',
        x.nombre,
        f?.dni ?? '',
        f?.nss ?? '',
        f?.categoria ?? '',
        f?.grupoCotizacion ?? '',
        optionLabel(ficShared.TIPOS_CONTRATO, f?.tipoContrato)?.label ?? '',
        f?.jornadaHoras ?? '',
        f?.fechaAlta ? fmtDate(f.fechaAlta) : '',
        f?.fechaBaja ? fmtDate(f.fechaBaja) : '',
        f?.salarioBruto ?? '',
        ...conceptos.map((c) => vs.filter((v) => v.concepto === c).reduce((s, v) => s + Number(v.importe), 0) || ''),
        vs.reduce((s, v) => s + (CONCEPTOS_DESCUENTO.includes(v.concepto) ? -1 : 1) * Number(v.importe), 0),
        it || '',
        nr || '',
        otras.join(', '),
        f?.fechaBaja && f.fechaBaja >= desde && f.fechaBaja <= hasta ? `Baja el ${fmtDate(f.fechaBaja)}: preparar finiquito` : f?.fechaAlta && f.fechaAlta >= desde ? `Alta el ${fmtDate(f.fechaAlta)}` : '',
      ]);
    }
    ws.columns.forEach((c, i) => (c.width = i === 1 ? 28 : i === 0 ? 9 : 15));
    const det = wb.addWorksheet('Detalle de variables');
    det.addRow(['Trabajador', 'DNI/NIE', 'Concepto', 'Descripción', 'Cantidad', 'Importe', 'Origen']).font = { bold: true };
    const n = await nombres(
      db,
      vars.map((v) => v.personaId),
    );
    for (const v of vars)
      det.addRow([n[v.personaId], fichas.find((f) => f.personaId === v.personaId)?.dni ?? '', optionLabel(VARIABLE_CONCEPTOS, v.concepto)?.label, v.descripcion, v.cantidad, (CONCEPTOS_DESCUENTO.includes(v.concepto) ? -1 : 1) * Number(v.importe), optionLabel(nomShared.VARIABLE_ORIGENES, v.origen)?.label]);
    det.columns.forEach((c) => (c.width = 22));
    if (aus.length) {
      const wa = wb.addWorksheet('Ausencias');
      wa.addRow(['Trabajador', 'Tipo', 'Desde', 'Hasta', 'Días', 'Retribuida']).font = { bold: true };
      const na = await nombres(
        db,
        aus.map((a) => a.personaId),
      );
      for (const a of aus) wa.addRow([na[a.personaId], a.tipo, fmtDate(a.desde), fmtDate(a.hasta), a.dias, a.retribuido ? 'Sí' : 'No']);
      wa.columns.forEach((c) => (c.width = 20));
    }
    await audit(db, ctx, 'exportar', 'nom_periodo', p.id);
    return { __file: true, buffer: Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `nomina-${p.anio}-${String(p.mes).padStart(2, '0')}.xlsx` };
  });

  /** Cierra el periodo con los totales del resumen de la gestoría (lo recoge Contabilidad). */
  app.post('/periodos/:id/cerrar', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const p = await periodoDe(ctx, (req.params as { id: string }).id);
    if (p.estado !== 'abierto') throw badRequest('El periodo ya está cerrado');
    const n = z.coerce.number().min(0).max(100_000_000);
    const { totales, notas } = parse(z.object({ totales: z.object({ bruto: n, ssEmpresa: n, ssTrabajador: n, irpf: n, neto: n }), notas: z.string().max(2000).nullish() }), req.body);
    const esperado = Math.round((totales.bruto - totales.ssTrabajador - totales.irpf) * 100) / 100;
    if (Math.abs(esperado - totales.neto) > 1 && Math.abs(esperado - totales.neto) > totales.bruto * 0.05)
      throw badRequest(`Revisa los totales: bruto menos SS del trabajador e IRPF da ${fmtMoney(esperado)} y el neto indicado es ${fmtMoney(totales.neto)}`);
    await db.transaction(async (tx) => {
      await tx.update(nomPeriodos).set({ estado: 'cerrado', totales, notas: notas ?? null, cerradoPor: ctx.usuarioId, cerradoEn: new Date() }).where(eq(nomPeriodos.id, p.id));
      await audit(tx, ctx, 'cerrar', 'nom_periodo', p.id, { totales });
      await emit(tx, ctx, 'nom.periodo_cerrado', { periodoId: p.id, anio: p.anio, mes: p.mes, totales });
    });
    return { ok: true };
  });

  /* ── Recibos ── */
  const subidaSchema = z.object({ archivoIds: z.array(z.string().uuid()).min(1).max(50), tipo: z.enum(['nomina', 'paga_extra', 'finiquito', 'certificado', 'otro']).default('nomina'), titulo: z.string().trim().max(200).nullish() });
  app.post('/periodos/:id/recibos', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const p = await periodoDe(ctx, (req.params as { id: string }).id);
    const b = parse(subidaSchema, req.body);
    const titulo = b.titulo || `${optionLabel(RECIBO_TIPOS, b.tipo)?.label ?? 'Nómina'} de ${nombrePeriodo(p.anio, p.mes).toLowerCase()}`;
    return db.transaction((tx) => procesarRecibos(tx, ctx, b.archivoIds, { periodoId: p.id, anio: p.anio, mes: p.mes, tipo: b.tipo, titulo }));
  });

  /** Certificados y otros documentos sin periodo (certificado de retenciones, etc.). */
  app.post('/documentos', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const b = parse(subidaSchema.extend({ anio: z.number().int().min(2000).max(2100), titulo: z.string().trim().min(1).max(200) }), req.body);
    return db.transaction((tx) => procesarRecibos(tx, ctx, b.archivoIds, { periodoId: null, anio: b.anio, mes: null, tipo: b.tipo, titulo: b.titulo }));
  });

  app.get('/recibos', async (req) => {
    const ctx = req.ctx;
    const q = req.query as { periodoId?: string; personaId?: string; mias?: string; sinAsignar?: string };
    const conds = [eq(nomRecibos.empresaId, ctx.empresaId)];
    if (q.mias || !can(ctx, 'nom.gestionar')) {
      if (!ctx.personaId || !can(ctx, 'nom.ver')) return [];
      if (q.personaId && q.personaId !== ctx.personaId) {
        if (!(await canOnOwner(ctx, 'nom.ver', q.personaId))) throw forbidden('No puedes ver las nóminas de otra persona');
        conds.push(eq(nomRecibos.personaId, q.personaId));
      } else if (q.mias || ctx.perms.get('nom.ver') === 'propio') conds.push(eq(nomRecibos.personaId, ctx.personaId));
      else {
        const c = await condAlcance(ctx, 'nom.ver', nomRecibos.personaId);
        if (c) conds.push(c);
      }
    } else {
      if (q.periodoId) conds.push(eq(nomRecibos.periodoId, q.periodoId));
      if (q.personaId) conds.push(eq(nomRecibos.personaId, q.personaId));
      if (q.sinAsignar) conds.push(isNull(nomRecibos.personaId));
    }
    const rows = await db.select().from(nomRecibos).where(and(...conds)).orderBy(desc(nomRecibos.anio), sql`${nomRecibos.mes} DESC NULLS LAST`, desc(nomRecibos.publicadoEn)).limit(300);
    const n = await nombres(
      db,
      rows.map((r) => r.personaId),
    );
    return rows.map((r) => ({ ...r, persona: r.personaId ? n[r.personaId] : null, leido: !!r.leidoEn }));
  });

  /** Abre un recibo: devuelve un enlace temporal y, si es propio, lo marca como leído. */
  app.post('/recibos/:id/abrir', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(nomRecibos).where(and(eq(nomRecibos.id, id), eq(nomRecibos.empresaId, ctx.empresaId)));
    if (!r) throw notFound('Recibo no encontrado');
    const propio = !!r.personaId && r.personaId === ctx.personaId;
    if (!propio && !can(ctx, 'nom.gestionar') && !(r.personaId && (await canOnOwner(ctx, 'nom.ver', r.personaId)))) throw forbidden('No puedes ver las nóminas de otra persona');
    if (propio && !r.leidoEn)
      await db.transaction(async (tx) => {
        await tx.update(nomRecibos).set({ leidoEn: new Date() }).where(eq(nomRecibos.id, id));
        await audit(tx, ctx, 'leer_recibo', 'nom_recibo', id);
      });
    return { url: fileUrl(r.archivoId, 600), titulo: r.titulo };
  });

  app.patch('/recibos/:id', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(z.object({ personaId: z.string().uuid().nullable(), bruto: z.number().nullish(), neto: z.number().nullish() }), req.body);
    const [r] = await db.select().from(nomRecibos).where(and(eq(nomRecibos.id, id), eq(nomRecibos.empresaId, ctx.empresaId)));
    if (!r) throw notFound();
    if (b.personaId && !(await personaPorId(db, ctx.empresaId, b.personaId))) throw badRequest('Persona no válida');
    await db.transaction(async (tx) => {
      await tx.update(nomRecibos).set({ personaId: b.personaId, leidoEn: b.personaId !== r.personaId ? null : r.leidoEn, ...(b.bruto !== undefined ? { bruto: b.bruto } : {}), ...(b.neto !== undefined ? { neto: b.neto } : {}) }).where(eq(nomRecibos.id, id));
      await audit(tx, ctx, 'asignar_recibo', 'nom_recibo', id, { antes: r.personaId, despues: b.personaId });
      if (b.personaId && b.personaId !== r.personaId) await notify(tx, ctx, { modulo: 'nom', tipo: 'recibo', titulo: `Ya tienes disponible: ${r.titulo}`, enlace: '/mis-nominas', personaIds: [b.personaId], email: true });
    });
    return { ok: true };
  });

  app.delete('/recibos/:id', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(nomRecibos).where(and(eq(nomRecibos.id, id), eq(nomRecibos.empresaId, ctx.empresaId)));
    if (!r) throw notFound();
    await db.transaction(async (tx) => {
      await tx.delete(nomRecibos).where(eq(nomRecibos.id, id));
      await audit(tx, ctx, 'borrar', 'nom_recibo', id, r);
    });
    return { ok: true };
  });

  /** Certificado de empresa generado al momento para la propia persona. */
  app.get('/certificado', async (req) => {
    const ctx = req.ctx;
    if (!ctx.personaId) throw forbidden();
    const p = await personaPorId(db, ctx.empresaId, ctx.personaId);
    const [f] = await db.select().from(ficTrabajadores).where(eq(ficTrabajadores.personaId, ctx.personaId));
    const emp = await getEmpresa(ctx.empresaId);
    if (!p || !f?.fechaAlta) throw badRequest('Tu ficha laboral no tiene fecha de alta. Pide a RRHH que la complete.');
    const texto = [
      `${emp.razonSocial ?? emp.nombre}, con NIF ${emp.nif ?? '—'} y domicilio en ${[emp.direccion, emp.codigoPostal, emp.localidad].filter(Boolean).join(', ')},`,
      '',
      'CERTIFICA:',
      '',
      `Que ${p.nombre}, con DNI/NIE ${f.dni ?? '—'}, presta sus servicios en esta empresa desde el ${fmtDate(f.fechaAlta)}${f.fechaBaja ? ` hasta el ${fmtDate(f.fechaBaja)}` : ' hasta la fecha'}, con la categoría profesional de ${f.categoria ?? p.puesto ?? '—'}, contrato ${(optionLabel(ficShared.TIPOS_CONTRATO, f.tipoContrato)?.label ?? '').toLowerCase()} y una jornada de ${f.jornadaHoras ?? 40} horas semanales.`,
      '',
      'Y para que conste a los efectos oportunos, se expide el presente certificado a petición de la persona interesada.',
      '',
      `En ${emp.localidad ?? ''}, a ${fmtDate(hoyMadrid())}.`,
    ].join('\n');
    const pdf = await renderTextPdf('Certificado de empresa', texto, { nombre: emp.nombre, nif: emp.nif, direccion: emp.direccion, localidad: emp.localidad });
    await audit(db, ctx, 'generar_certificado', 'nom_certificado', ctx.personaId);
    return { __file: true, buffer: pdf, mime: 'application/pdf', name: `certificado-empresa-${p.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf`, inline: true };
  });

  /* ── Anticipos ── */
  app.get('/anticipos', async (req) => {
    const ctx = req.ctx;
    const q = req.query as { mias?: string; estado?: string };
    const conds = [eq(nomAnticipos.empresaId, ctx.empresaId)];
    if (q.mias || !can(ctx, 'nom.anticipos')) {
      if (!ctx.personaId) return [];
      conds.push(eq(nomAnticipos.personaId, ctx.personaId));
    } else {
      const c = await condAlcance(ctx, 'nom.anticipos', nomAnticipos.personaId);
      if (c) conds.push(c);
    }
    if (q.estado) conds.push(eq(nomAnticipos.estado, q.estado));
    const rows = await db
      .select({ a: nomAnticipos, nombre: nombrePersona })
      .from(nomAnticipos)
      .innerJoin(personas, eq(personas.id, nomAnticipos.personaId))
      .where(and(...conds))
      .orderBy(desc(nomAnticipos.creadoEn))
      .limit(200);
    const out = [];
    for (const r of rows) out.push({ ...r.a, persona: r.nombre, puedeAprobar: r.a.estado === 'pendiente' && r.a.personaId !== ctx.personaId && (await canOnOwner(ctx, 'nom.anticipos', r.a.personaId)) });
    return out;
  });

  app.post('/anticipos', async (req, reply) => {
    const ctx = req.ctx;
    if (!ctx.personaId || !can(ctx, 'nom.ver')) throw forbidden();
    const b = parse(z.object({ importe: z.coerce.number().positive('Indica el importe').max(10000), motivo: z.string().trim().max(500).nullish(), fechaDeseada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }), req.body);
    const [f] = await db.select({ s: ficTrabajadores.salarioBruto }).from(ficTrabajadores).where(eq(ficTrabajadores.personaId, ctx.personaId));
    const tope = f?.s ? Math.floor(Number(f.s) / 14) : null;
    if (tope && b.importe > tope) throw badRequest(`El anticipo no puede superar el importe de una mensualidad (${fmtMoney(tope)})`);
    const [pend] = await db.select({ id: nomAnticipos.id }).from(nomAnticipos).where(and(eq(nomAnticipos.personaId, ctx.personaId), eq(nomAnticipos.estado, 'pendiente')));
    if (pend) throw conflict('Ya tienes un anticipo pendiente de aprobar');
    const row = await db.transaction(async (tx) => {
      const [a] = await tx.insert(nomAnticipos).values({ empresaId: ctx.empresaId, personaId: ctx.personaId!, importe: b.importe, motivo: b.motivo ?? null, fechaDeseada: b.fechaDeseada ?? null }).returning();
      await audit(tx, ctx, 'solicitar_anticipo', 'nom_anticipo', a!.id, { importe: b.importe });
      await notify(tx, ctx, { modulo: 'nom', tipo: 'anticipo', titulo: `${ctx.nombre} solicita un anticipo de ${fmtMoney(b.importe)}`, cuerpo: b.motivo ?? null, enlace: '/bandeja', permiso: 'nom.anticipos' });
      return a!;
    });
    reply.code(201);
    return row;
  });

  async function anticipoRevisable(ctx: Ctx, id: string) {
    const [a] = await db.select().from(nomAnticipos).where(and(eq(nomAnticipos.id, id), eq(nomAnticipos.empresaId, ctx.empresaId)));
    if (!a) throw notFound();
    if (a.estado !== 'pendiente') throw badRequest('Este anticipo ya está resuelto');
    if (a.personaId === ctx.personaId) throw forbidden('No puedes aprobar tu propio anticipo');
    if (!(await canOnOwner(ctx, 'nom.anticipos', a.personaId))) throw forbidden();
    return a;
  }
  app.post('/anticipos/:id/aprobar', async (req) => {
    const ctx = req.ctx;
    const a = await anticipoRevisable(ctx, (req.params as { id: string }).id);
    await db.transaction(async (tx) => {
      const hoy = hoyMadrid();
      const p = await periodoAbierto(tx, ctx.empresaId, Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)));
      await tx.insert(nomVariables).values({ empresaId: ctx.empresaId, periodoId: p.id, personaId: a.personaId, concepto: 'anticipo', descripcion: `Anticipo aprobado el ${fmtDate(hoy)}`, importe: a.importe, origen: 'anticipo', origenId: a.id, creadoPor: ctx.usuarioId });
      await tx.update(nomAnticipos).set({ estado: 'aprobado', periodoId: p.id, revisadoPor: ctx.usuarioId, revisadoEn: new Date() }).where(eq(nomAnticipos.id, a.id));
      await audit(tx, ctx, 'aprobar_anticipo', 'nom_anticipo', a.id, { periodo: p.id });
      await notify(tx, ctx, { modulo: 'nom', tipo: 'anticipo_aprobado', titulo: `Anticipo de ${fmtMoney(a.importe)} aprobado`, cuerpo: `Se descontará en la nómina de ${nombrePeriodo(p.anio, p.mes).toLowerCase()}.`, enlace: '/mis-nominas', personaIds: [a.personaId], email: true });
    });
    return { ok: true };
  });
  app.post('/anticipos/:id/rechazar', async (req) => {
    const ctx = req.ctx;
    const a = await anticipoRevisable(ctx, (req.params as { id: string }).id);
    const { motivo } = parse(z.object({ motivo: z.string().trim().max(1000).nullish() }), req.body ?? {});
    await db.transaction(async (tx) => {
      await tx.update(nomAnticipos).set({ estado: 'rechazado', revisadoPor: ctx.usuarioId, revisadoEn: new Date(), motivoRechazo: motivo ?? null }).where(eq(nomAnticipos.id, a.id));
      await audit(tx, ctx, 'rechazar_anticipo', 'nom_anticipo', a.id, { motivo });
      await notify(tx, ctx, { modulo: 'nom', tipo: 'anticipo_rechazado', titulo: `Anticipo de ${fmtMoney(a.importe)} no aprobado`, cuerpo: motivo ?? null, enlace: '/mis-nominas', personaIds: [a.personaId] });
    });
    return { ok: true };
  });

  /* ── Registro retributivo (RD 902/2020) ── */
  app.get('/registro-retributivo', { preHandler: guard('nom.gestionar') }, async (req) => {
    const ctx = req.ctx;
    const q = req.query as { anio?: string; agrupar?: string; format?: string };
    const anio = Number(q.anio) || Number(hoyMadrid().slice(0, 4));
    const agrupar = q.agrupar === 'categoria' ? 'categoria' : 'grupo';
    const rows = await db
      .select({ personaId: ficTrabajadores.personaId, sexo: ficTrabajadores.sexo, categoria: ficTrabajadores.categoria, grupo: ficTrabajadores.grupoCotizacion, salario: ficTrabajadores.salarioBruto, jornada: ficTrabajadores.jornadaHoras })
      .from(ficTrabajadores)
      .innerJoin(personas, eq(personas.id, ficTrabajadores.personaId))
      .where(and(eq(ficTrabajadores.empresaId, ctx.empresaId), sql`${ficTrabajadores.salarioBruto} IS NOT NULL`, sql`(${ficTrabajadores.fechaBaja} IS NULL OR ${ficTrabajadores.fechaBaja} >= ${`${anio}-01-01`})`, sql`(${ficTrabajadores.fechaAlta} IS NULL OR ${ficTrabajadores.fechaAlta} <= ${`${anio}-12-31`})`));
    const complementos = await db
      .select({ personaId: nomVariables.personaId, total: sql<number>`sum(${nomVariables.importe})::float` })
      .from(nomVariables)
      .innerJoin(nomPeriodos, eq(nomPeriodos.id, nomVariables.periodoId))
      .where(and(eq(nomVariables.empresaId, ctx.empresaId), eq(nomPeriodos.anio, anio), sql`${nomVariables.concepto} NOT IN ('anticipo','embargo','dietas','kilometraje')`))
      .groupBy(nomVariables.personaId);
    const stats = (vals: number[]) => {
      if (!vals.length) return { n: 0, media: null as number | null, mediana: null as number | null };
      const s = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return { n: s.length, media: Math.round((s.reduce((a, v) => a + v, 0) / s.length) * 100) / 100, mediana: s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 100) / 100 };
    };
    const grupos = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = (agrupar === 'categoria' ? r.categoria : r.grupo) ?? 'Sin clasificar';
      grupos.set(k, [...(grupos.get(k) ?? []), r]);
    }
    const anual = (r: (typeof rows)[number]) => (Number(r.salario) * 40) / (Number(r.jornada) || 40) + (complementos.find((c) => c.personaId === r.personaId)?.total ?? 0);
    const fila = (nombre: string, list: typeof rows) => {
      const m = stats(list.filter((r) => r.sexo === 'mujer').map(anual));
      const h = stats(list.filter((r) => r.sexo === 'hombre').map(anual));
      const brecha = m.media && h.media ? Math.round(((h.media - m.media) / h.media) * 10000) / 100 : null;
      return { grupo: agrupar === 'grupo' ? (optionLabel(ficShared.GRUPOS_COTIZACION, nombre)?.label ?? nombre) : nombre, mujeres: m, hombres: h, otros: list.filter((r) => r.sexo !== 'mujer' && r.sexo !== 'hombre').length, brecha };
    };
    const filas = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true })).map(([k, v]) => fila(k, v));
    const total = fila('Total', rows);
    const result = { anio, agrupar, filas, total: { ...total, grupo: 'Total empresa' }, nota: 'Retribución anual equivalente a jornada completa (salario bruto pactado más complementos salariales del año). Las celdas con menos de 3 personas pueden identificar a alguien: trátalas con reserva.' };
    if (q.format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Registro retributivo');
      ws.addRow([`Registro retributivo ${anio} (RD 902/2020)`]).font = { bold: true, size: 13 };
      ws.addRow([]);
      ws.addRow([agrupar === 'grupo' ? 'Grupo profesional' : 'Categoría', 'Mujeres (n)', 'Media mujeres', 'Mediana mujeres', 'Hombres (n)', 'Media hombres', 'Mediana hombres', 'Brecha (%)']).font = { bold: true };
      for (const f of [...filas, result.total]) ws.addRow([f.grupo, f.mujeres.n, f.mujeres.media, f.mujeres.mediana, f.hombres.n, f.hombres.media, f.hombres.mediana, f.brecha]);
      ws.addRow([]);
      ws.addRow([result.nota]).font = { italic: true, size: 9 };
      ws.columns.forEach((c, i) => (c.width = i === 0 ? 40 : 16));
      await audit(db, ctx, 'exportar_registro_retributivo', 'nom_registro', null, { anio });
      return { __file: true, buffer: Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `registro-retributivo-${anio}.xlsx` };
    }
    return result;
  });
}

export default defineModule({
  code: 'nom',
  routes,
  refTargets: {
    'nom.periodos': {
      table: nomPeriodos,
      id: nomPeriodos.id,
      label: sql<string>`${nomPeriodos.anio}::text || '-' || lpad(${nomPeriodos.mes}::text, 2, '0')`,
      search: [],
      empresaCol: nomPeriodos.empresaId,
      perm: 'nom.gestionar',
    },
  },
  events: {
    /** Gastos liquidados en nómina: pasan como variable del mes. */
    'gas.gasto_liquidado': async (tx, ctx, e) => {
      if (e.via !== 'nomina') return;
      const p = await periodoAbierto(tx, ctx.empresaId, Number(e.fecha.slice(0, 4)), Number(e.fecha.slice(5, 7)));
      await tx
        .insert(nomVariables)
        .values({ empresaId: ctx.empresaId, periodoId: p.id, personaId: e.personaId, concepto: 'dietas', descripcion: `Gastos liquidados el ${fmtDate(e.fecha)}`, importe: e.importe, origen: 'gas', origenId: e.gastoId, creadoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId })
        .onConflictDoNothing();
    },
  },
  approvals: async (dbx, ctx): Promise<ApprovalItem[]> => {
    if (!can(ctx, 'nom.anticipos')) return [];
    const rows = await dbx
      .select({ a: nomAnticipos, nombre: nombrePersona })
      .from(nomAnticipos)
      .innerJoin(personas, eq(personas.id, nomAnticipos.personaId))
      .where(and(eq(nomAnticipos.empresaId, ctx.empresaId), eq(nomAnticipos.estado, 'pendiente'), ctx.personaId ? ne(nomAnticipos.personaId, ctx.personaId) : undefined, await condAlcance(ctx, 'nom.anticipos', nomAnticipos.personaId)))
      .orderBy(asc(nomAnticipos.creadoEn));
    return rows.map((r) => ({
      id: `nom-${r.a.id}`,
      modulo: 'nom',
      tipo: 'Anticipo de nómina',
      titulo: `${r.nombre}: ${fmtMoney(r.a.importe)}`,
      detalle: [r.a.motivo, r.a.fechaDeseada ? `Lo necesita el ${fmtDate(r.a.fechaDeseada)}` : null].filter(Boolean).join(' · ') || null,
      solicitante: r.nombre,
      fecha: r.a.creadoEn.toISOString(),
      enlace: '/nominas?tab=anticipos',
      aprobarUrl: `/api/nom/anticipos/${r.a.id}/aprobar`,
      rechazarUrl: `/api/nom/anticipos/${r.a.id}/rechazar`,
    }));
  },
  dashboard: async (dbx, ctx): Promise<DashboardWidget[]> => {
    const out: DashboardWidget[] = [];
    if (ctx.personaId && can(ctx, 'nom.ver')) {
      const [r] = await dbx.select().from(nomRecibos).where(and(eq(nomRecibos.personaId, ctx.personaId), eq(nomRecibos.tipo, 'nomina'))).orderBy(desc(nomRecibos.anio), desc(nomRecibos.mes)).limit(1);
      if (r) out.push({ id: 'nom.ultima', modulo: 'nom', titulo: 'Mi última nómina', size: 'sm', data: { kind: 'stat', value: r.mes ? nombrePeriodo(r.anio, r.mes) : String(r.anio), hint: r.leidoEn ? 'Ya la has abierto' : 'Nueva: sin abrir', enlace: '/mis-nominas' } });
    }
    if (can(ctx, 'nom.gestionar')) {
      const [p] = await dbx.select().from(nomPeriodos).where(and(eq(nomPeriodos.empresaId, ctx.empresaId), eq(nomPeriodos.estado, 'abierto'))).orderBy(asc(nomPeriodos.anio), asc(nomPeriodos.mes)).limit(1);
      const [sa] = await dbx.select({ n: sql<number>`count(*)::int` }).from(nomRecibos).where(and(eq(nomRecibos.empresaId, ctx.empresaId), isNull(nomRecibos.personaId)));
      const [ap] = await dbx.select({ n: sql<number>`count(*)::int` }).from(nomAnticipos).where(and(eq(nomAnticipos.empresaId, ctx.empresaId), eq(nomAnticipos.estado, 'pendiente')));
      out.push({
        id: 'nom.gestion',
        modulo: 'nom',
        titulo: 'Nóminas',
        size: 'md',
        data: {
          kind: 'list',
          enlace: '/nominas',
          items: [
            p ? { titulo: `Periodo abierto: ${nombrePeriodo(p.anio, p.mes)}`, subtitulo: 'Revisa variables y exporta a la gestoría', enlace: `/nominas/${p.id}` } : { titulo: 'No hay ningún periodo abierto', enlace: '/nominas' },
            { titulo: 'Recibos sin asignar', valor: String(sa?.n ?? 0), tone: sa?.n ? 'red' : 'green', enlace: '/nominas' },
            { titulo: 'Anticipos pendientes', valor: String(ap?.n ?? 0), tone: ap?.n ? 'yellow' : 'green', enlace: '/nominas?tab=anticipos' },
          ],
        },
      });
    }
    return out;
  },
  timeline: async (dbx, ctx, entidad, id) => {
    if (entidad !== 'persona') return [];
    if (id !== ctx.personaId && !(await canOnOwner(ctx, 'nom.ver', id))) return [];
    const rows = await dbx.select().from(nomRecibos).where(eq(nomRecibos.personaId, id)).orderBy(desc(nomRecibos.publicadoEn)).limit(12);
    return rows.map((r) => ({ id: `nr-${r.id}`, modulo: 'nom', tipo: 'recibo', icono: 'Wallet', titulo: `Recibo publicado: ${r.titulo}`, detalle: r.leidoEn ? 'Abierto' : 'Sin abrir', fecha: r.publicadoEn.toISOString(), enlace: id === ctx.personaId ? '/mis-nominas' : `/personas/${id}?tab=nom-nominas`, tone: r.leidoEn ? 'green' : 'yellow' }));
  },
  seed: seedNom,
});
