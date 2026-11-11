import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cntShared, optionLabel, round } from '@kite/shared';
const { ASIENTO_ORIGENES, DIGITOS_SUBCUENTA } = cntShared;
import { db } from '../../db/client';
import { terceros } from '../../db/schema/core';
import { audit } from '../../core/audit';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, notFound, parse } from '../../core/errors';
import { guard } from '../../core/permissions';
import { cntApuntes, cntAsientos, cntCentrosCoste, cntCuentas, cntEjercicios, cntTercerosFiscal } from './schema';
import { borrarAsiento, cargarAsiento, crearAsiento, editarAsientoManual, ensureEjercicio, ensurePlan, renumerar } from './service';
import { analitica, balance, diario, librosIva, mayor, pyg, saldos, sumasYSaldos } from './libros';
import { modelo111, modelo115, modelo180, modelo190, modelo303, modelo347, modelo349, modelo390 } from './modelos';
import { cerrarEjercicio, reabrirEjercicio } from './cierre';
import { csv, fileOut, xlsx, type ColXlsx } from './excel';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
const lineaSchema = z.object({
  cuentaId: z.string().uuid({ message: 'Elige la cuenta' }),
  debe: z.coerce.number().default(0),
  haber: z.coerce.number().default(0),
  concepto: z.string().max(300).nullish(),
  terceroId: z.string().uuid().nullish(),
  centroCosteId: z.string().uuid().nullish(),
});
const asientoSchema = z.object({ fecha, concepto: z.string().trim().min(1, 'Escribe el concepto').max(300), lineas: z.array(lineaSchema).min(2, 'Un asiento necesita al menos dos líneas').max(500) });

const hoy = () => new Date().toISOString().slice(0, 10);
function rango(q: Record<string, string>) {
  const anio = Number(q.anio) || new Date().getFullYear();
  return { desde: q.desde || `${anio}-01-01`, hasta: q.hasta || `${anio}-12-31` };
}
const fmtFecha = (d: string) => d.split('-').reverse().join('/');

export async function cntRoutes(app: FastifyInstance) {
  const ver = { preHandler: guard('cnt.ver') };
  const gestionar = { preHandler: guard('cnt.gestionar') };

  /* ── Plan de cuentas ── */
  app.get('/cuentas', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    await db.transaction((tx) => ensurePlan(tx, ctx.empresaId));
    const conds: (SQL | undefined)[] = [eq(cntCuentas.empresaId, ctx.empresaId)];
    if (q.q) conds.push(or(ilike(cntCuentas.codigo, `${q.q.replace(/[%_]/g, '')}%`), ilike(cntCuentas.nombre, `%${q.q.replace(/[%_]/g, '')}%`)));
    if (q.grupo) conds.push(eq(cntCuentas.grupo, q.grupo));
    if (q.subcuentas === '1') conds.push(eq(cntCuentas.subcuenta, true));
    const cuentas = await db.select().from(cntCuentas).where(and(...conds)).orderBy(asc(cntCuentas.codigo)).limit(Math.min(3000, Number(q.limit) || 3000));
    const anio = Number(q.anio) || new Date().getFullYear();
    const s = await saldos(ctx.empresaId, { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, excluir: ['cierre'] });
    const por = new Map(s.map((r) => [r.cuenta, r]));
    // saldo agregado de las cuentas madre (3-4 dígitos)
    return cuentas.map((c) => {
      if (c.subcuenta) {
        const r = por.get(c.codigo);
        return { ...c, debe: r?.debe ?? 0, haber: r?.haber ?? 0, saldo: r?.saldo ?? 0 };
      }
      const hijos = s.filter((r) => r.cuenta.startsWith(c.codigo));
      return { ...c, debe: round(hijos.reduce((a, r) => a + r.debe, 0)), haber: round(hijos.reduce((a, r) => a + r.haber, 0)), saldo: round(hijos.reduce((a, r) => a + r.saldo, 0)) };
    });
  });

  app.post('/cuentas', gestionar, async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(z.object({ codigo: z.string().trim().regex(/^\d+$/, 'El código solo lleva números'), nombre: z.string().trim().min(1).max(200) }), req.body);
    if (b.codigo.length < DIGITOS_SUBCUENTA) throw badRequest(`Las subcuentas tienen al menos ${DIGITOS_SUBCUENTA} dígitos`);
    const row = await db.transaction(async (tx) => {
      await ensurePlan(tx, ctx.empresaId);
      const madre = await tx.select({ id: cntCuentas.id }).from(cntCuentas).where(and(eq(cntCuentas.empresaId, ctx.empresaId), eq(cntCuentas.codigo, b.codigo.slice(0, 3))));
      if (!madre.length) throw badRequest(`No existe la cuenta ${b.codigo.slice(0, 3)} en el plan de cuentas`);
      const [ya] = await tx.select({ id: cntCuentas.id }).from(cntCuentas).where(and(eq(cntCuentas.empresaId, ctx.empresaId), eq(cntCuentas.codigo, b.codigo)));
      if (ya) throw conflict(`La cuenta ${b.codigo} ya existe`);
      const { naturalezaDe } = await import('./pgc');
      const [c] = await tx.insert(cntCuentas).values({ empresaId: ctx.empresaId, codigo: b.codigo, nombre: b.nombre, grupo: b.codigo[0]!, naturaleza: naturalezaDe(b.codigo), subcuenta: true }).returning();
      await audit(tx, ctx, 'crear', 'cnt_cuenta', c!.id, { codigo: b.codigo, nombre: b.nombre });
      return c!;
    });
    reply.code(201);
    return row;
  });

  app.patch('/cuentas/:id', gestionar, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(z.object({ nombre: z.string().trim().min(1).max(200) }), req.body);
    return db.transaction(async (tx) => {
      const [c] = await tx.update(cntCuentas).set({ nombre: b.nombre }).where(and(eq(cntCuentas.id, id), eq(cntCuentas.empresaId, ctx.empresaId))).returning();
      if (!c) throw notFound('Cuenta no encontrada');
      await audit(tx, ctx, 'editar', 'cnt_cuenta', id, { nombre: b.nombre });
      return c;
    });
  });

  /* ── Ejercicios ── */
  app.get('/ejercicios', ver, async (req) => {
    const ctx = req.ctx;
    await db.transaction((tx) => ensureEjercicio(tx, ctx.empresaId, new Date().getFullYear()));
    const rows = await db
      .select({
        e: cntEjercicios,
        asientos: sql<number>`(SELECT count(*)::int FROM ${cntAsientos} a WHERE a.ejercicio_id = ${cntEjercicios.id})`,
        resultado: sql<string>`(SELECT coalesce(sum(p.haber - p.debe), 0) FROM ${cntApuntes} p JOIN ${cntAsientos} a ON a.id = p.asiento_id WHERE a.ejercicio_id = ${cntEjercicios.id} AND a.origen NOT IN ('regularizacion','cierre') AND left(p.cuenta, 1) IN ('6','7'))`,
      })
      .from(cntEjercicios)
      .where(eq(cntEjercicios.empresaId, ctx.empresaId))
      .orderBy(desc(cntEjercicios.anio));
    return rows.map((r) => ({ ...r.e, asientos: r.asientos, resultado: round(Number(r.resultado)) }));
  });
  app.post('/ejercicios', gestionar, async (req) => {
    const { anio } = parse(z.object({ anio: z.coerce.number().int().min(2000).max(2100) }), req.body);
    return db.transaction(async (tx) => {
      const e = await ensureEjercicio(tx, req.ctx.empresaId, anio);
      await audit(tx, req.ctx, 'crear', 'cnt_ejercicio', e.id, { anio });
      return e;
    });
  });
  app.post('/ejercicios/:anio/cerrar', gestionar, async (req) => db.transaction((tx) => cerrarEjercicio(tx, req.ctx, Number((req.params as { anio: string }).anio))));
  app.post('/ejercicios/:anio/reabrir', gestionar, async (req) => {
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, 'Indica el motivo de la reapertura') }), req.body);
    return db.transaction((tx) => reabrirEjercicio(tx, req.ctx, Number((req.params as { anio: string }).anio), motivo));
  });
  app.post('/ejercicios/:anio/renumerar', gestionar, async (req) =>
    db.transaction(async (tx) => {
      const e = await ensureEjercicio(tx, req.ctx.empresaId, Number((req.params as { anio: string }).anio));
      return renumerar(tx, req.ctx, e.id);
    }),
  );

  /* ── Asientos ── */
  app.get('/asientos', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const { desde, hasta } = rango(q);
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 25));
    const conds: (SQL | undefined)[] = [eq(cntAsientos.empresaId, ctx.empresaId), gte(cntAsientos.fecha, desde), lte(cntAsientos.fecha, hasta)];
    if (q.origen) conds.push(inArray(cntAsientos.origen, q.origen.split(',')));
    if (q.q) {
      const t = q.q.trim().replace(/[%_]/g, '');
      conds.push(
        or(
          ilike(cntAsientos.concepto, `%${t}%`),
          /^\d+$/.test(t) ? eq(cntAsientos.numero, Number(t)) : undefined,
          sql`EXISTS (SELECT 1 FROM ${cntApuntes} p WHERE p.asiento_id = ${cntAsientos.id} AND p.cuenta LIKE ${t + '%'})`,
        ),
      );
    }
    if (q.cuenta) conds.push(sql`EXISTS (SELECT 1 FROM ${cntApuntes} p WHERE p.asiento_id = ${cntAsientos.id} AND p.cuenta LIKE ${q.cuenta.replace(/\D/g, '') + '%'})`);
    const where = and(...conds);
    const [items, [tot]] = await Promise.all([
      db.select().from(cntAsientos).where(where).orderBy(desc(cntAsientos.fecha), desc(cntAsientos.numero)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${cntAsientos.total}), 0)` }).from(cntAsientos).where(where),
    ]);
    const lineas = items.length
      ? await db
          .select({ a: cntApuntes, nombre: cntCuentas.nombre, centro: cntCentrosCoste.codigo })
          .from(cntApuntes)
          .innerJoin(cntCuentas, eq(cntCuentas.id, cntApuntes.cuentaId))
          .leftJoin(cntCentrosCoste, eq(cntCentrosCoste.id, cntApuntes.centroCosteId))
          .where(inArray(cntApuntes.asientoId, items.map((i) => i.id)))
          .orderBy(asc(cntApuntes.orden))
      : [];
    const ejercicios = await db.select().from(cntEjercicios).where(eq(cntEjercicios.empresaId, ctx.empresaId));
    return {
      items: items.map((a) => ({
        ...a,
        cerrado: ejercicios.find((e) => e.id === a.ejercicioId)?.estado === 'cerrado',
        lineas: lineas.filter((l) => l.a.asientoId === a.id).map((l) => ({ ...l.a, nombre: l.nombre, centro: l.centro })),
      })),
      total: tot?.n ?? 0,
      suma: round(Number(tot?.total ?? 0)),
      page,
      pageSize,
    };
  });

  app.get('/asientos/:id', ver, async (req) => {
    const a = await cargarAsiento(db, req.ctx, (req.params as { id: string }).id);
    const lineas = await db
      .select({ a: cntApuntes, nombre: cntCuentas.nombre, tercero: terceros.nombre })
      .from(cntApuntes)
      .innerJoin(cntCuentas, eq(cntCuentas.id, cntApuntes.cuentaId))
      .leftJoin(terceros, eq(terceros.id, cntApuntes.terceroId))
      .where(eq(cntApuntes.asientoId, a.id))
      .orderBy(asc(cntApuntes.orden));
    const [ej] = await db.select().from(cntEjercicios).where(eq(cntEjercicios.id, a.ejercicioId));
    return { ...a, ejercicio: ej?.anio, cerrado: ej?.estado === 'cerrado', lineas: lineas.map((l) => ({ ...l.a, nombre: l.nombre, tercero: l.tercero })) };
  });

  app.post('/asientos', gestionar, async (req, reply) => {
    const b = parse(asientoSchema, req.body);
    const r = await db.transaction((tx) => crearAsiento(tx, req.ctx, { ...b, origen: 'manual' }));
    reply.code(201);
    return r.asiento;
  });
  app.put('/asientos/:id', gestionar, async (req) => {
    const b = parse(asientoSchema, req.body);
    const id = (req.params as { id: string }).id;
    await db.transaction((tx) => editarAsientoManual(tx, req.ctx, id, b));
    return { ok: true };
  });
  app.delete('/asientos/:id', gestionar, async (req) => {
    await db.transaction((tx) => borrarAsiento(tx, req.ctx, (req.params as { id: string }).id));
    return { ok: true };
  });

  /** Centro de coste de un apunte (también en asientos automáticos, para la analítica). */
  app.patch('/apuntes/:id', gestionar, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(z.object({ centroCosteId: z.string().uuid().nullable() }), req.body);
    return db.transaction(async (tx) => {
      const [ap] = await tx.update(cntApuntes).set({ centroCosteId: b.centroCosteId }).where(and(eq(cntApuntes.id, id), eq(cntApuntes.empresaId, ctx.empresaId))).returning();
      if (!ap) throw notFound('Apunte no encontrado');
      await audit(tx, ctx, 'centro_coste', 'cnt_apunte', id, b);
      return ap;
    });
  });

  /* ── Libros ── */
  app.get('/libros/diario', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const f = rango(q);
    const asientos = await diario(ctx.empresaId, { ...f, origen: q.origen, q: q.q });
    const filas = asientos.flatMap((a) => a.lineas.map((l) => ({ fecha: a.fecha, asiento: a.numero, cuenta: l.cuenta, nombre: l.nombre, concepto: l.concepto || a.concepto, debe: l.debe, haber: l.haber, documento: a.refTipo === 'documento' ? a.concepto.split(' · ')[0] : '', centro: l.centro ?? '' })));
    if (q.format === 'a3' || q.format === 'csv') {
      // columnas compatibles con la importación de A3 y Contasol
      const cols: ColXlsx[] = [
        { header: 'Fecha', key: 'fecha', type: 'date' },
        { header: 'Asiento', key: 'asiento', type: 'number' },
        { header: 'Cuenta', key: 'cuenta' },
        { header: 'Concepto', key: 'concepto' },
        { header: 'Debe', key: 'debe', type: 'money' },
        { header: 'Haber', key: 'haber', type: 'money' },
      ];
      return fileOut(csv(cols, filas), `diario-${f.desde}-${f.hasta}.csv`, 'text/csv; charset=utf-8');
    }
    if (q.format === 'xlsx') {
      const buf = await xlsx([
        {
          nombre: 'Libro diario',
          titulo: `Libro diario del ${fmtFecha(f.desde)} al ${fmtFecha(f.hasta)}`,
          columnas: [
            { header: 'Fecha', key: 'fecha', type: 'date' },
            { header: 'Asiento', key: 'asiento', type: 'number', width: 9 },
            { header: 'Cuenta', key: 'cuenta', width: 11 },
            { header: 'Nombre de la cuenta', key: 'nombre', width: 36 },
            { header: 'Concepto', key: 'concepto', width: 44 },
            { header: 'Debe', key: 'debe', type: 'money' },
            { header: 'Haber', key: 'haber', type: 'money' },
            { header: 'Centro de coste', key: 'centro' },
          ],
          filas,
          totales: { concepto: 'Totales', debe: round(filas.reduce((a, r) => a + r.debe, 0)), haber: round(filas.reduce((a, r) => a + r.haber, 0)) },
        },
      ]);
      return fileOut(buf, `diario-${f.desde}-${f.hasta}.xlsx`);
    }
    return asientos.slice(0, 500);
  });

  app.get('/libros/mayor', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const cuenta = (q.cuenta ?? '').replace(/\D/g, '');
    if (!cuenta) throw badRequest('Indica la cuenta');
    const f = rango(q);
    const m = await mayor(ctx.empresaId, cuenta, { ...f, excluir: q.conCierre === '1' ? [] : ['cierre'] });
    if (q.format === 'xlsx') {
      const buf = await xlsx([
        {
          nombre: `Mayor ${cuenta}`,
          titulo: `Libro mayor de la cuenta ${cuenta} · ${fmtFecha(f.desde)} a ${fmtFecha(f.hasta)} · saldo anterior ${m.saldoAnterior.toFixed(2)}`,
          columnas: [
            { header: 'Fecha', key: 'fecha', type: 'date' },
            { header: 'Asiento', key: 'numero', type: 'number', width: 9 },
            { header: 'Cuenta', key: 'cuenta', width: 11 },
            { header: 'Concepto', key: 'concepto', width: 48 },
            { header: 'Debe', key: 'debe', type: 'money' },
            { header: 'Haber', key: 'haber', type: 'money' },
            { header: 'Saldo', key: 'saldo', type: 'money' },
          ],
          filas: m.lineas,
          totales: { concepto: 'Totales', debe: m.debe, haber: m.haber, saldo: m.saldoFinal },
        },
      ]);
      return fileOut(buf, `mayor-${cuenta}.xlsx`);
    }
    const [c] = await db.select().from(cntCuentas).where(and(eq(cntCuentas.empresaId, ctx.empresaId), eq(cntCuentas.codigo, cuenta)));
    return { ...m, nombre: c?.nombre ?? null };
  });

  app.get('/libros/sumas-saldos', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const f = rango(q);
    const nivel = Math.min(12, Math.max(1, Number(q.nivel) || 7));
    const rows = await sumasYSaldos(ctx.empresaId, { ...f, excluir: q.conCierre === '1' ? [] : ['cierre'] }, nivel);
    const tot = { debe: round(rows.reduce((a, r) => a + r.debe, 0)), haber: round(rows.reduce((a, r) => a + r.haber, 0)), deudor: round(rows.reduce((a, r) => a + r.deudor, 0)), acreedor: round(rows.reduce((a, r) => a + r.acreedor, 0)) };
    if (q.format === 'xlsx') {
      const buf = await xlsx([
        {
          nombre: 'Sumas y saldos',
          titulo: `Balance de sumas y saldos · ${fmtFecha(f.desde)} a ${fmtFecha(f.hasta)}`,
          columnas: [
            { header: 'Cuenta', key: 'cuenta', width: 11 },
            { header: 'Nombre', key: 'nombre', width: 44 },
            { header: 'Debe', key: 'debe', type: 'money' },
            { header: 'Haber', key: 'haber', type: 'money' },
            { header: 'Saldo deudor', key: 'deudor', type: 'money' },
            { header: 'Saldo acreedor', key: 'acreedor', type: 'money' },
          ],
          filas: rows,
          totales: { nombre: 'Totales', ...tot },
        },
      ]);
      return fileOut(buf, `sumas-y-saldos-${f.hasta}.xlsx`);
    }
    return { filas: rows, totales: tot, cuadra: Math.abs(tot.debe - tot.haber) < 0.01 };
  });

  app.get('/libros/balance', ver, async (req) => {
    const q = req.query as Record<string, string>;
    const b = await balance(req.ctx.empresaId, q.fecha || `${Number(q.anio) || new Date().getFullYear()}-12-31`);
    if (q.format === 'xlsx') {
      const fila = (l: { titulo: string; importe: number; nivel: number }) => ({ partida: '   '.repeat(l.nivel) + l.titulo, importe: l.importe });
      const buf = await xlsx([
        { nombre: 'Activo', titulo: `Balance de situación abreviado a ${fmtFecha(b.fecha)} · ACTIVO`, columnas: [{ header: 'Partida', key: 'partida', width: 70 }, { header: 'Importe', key: 'importe', type: 'money' }], filas: b.activo.map(fila), totales: { partida: 'TOTAL ACTIVO', importe: b.totalActivo } },
        { nombre: 'Patrimonio neto y pasivo', titulo: `Balance de situación abreviado a ${fmtFecha(b.fecha)} · PATRIMONIO NETO Y PASIVO`, columnas: [{ header: 'Partida', key: 'partida', width: 70 }, { header: 'Importe', key: 'importe', type: 'money' }], filas: b.pasivo.map(fila), totales: { partida: 'TOTAL PATRIMONIO NETO Y PASIVO', importe: b.totalPasivo } },
      ]);
      return fileOut(buf, `balance-${b.fecha}.xlsx`);
    }
    return b;
  });

  app.get('/libros/pyg', ver, async (req) => {
    const q = req.query as Record<string, string>;
    const f = rango(q);
    const r = await pyg(req.ctx.empresaId, f.desde, f.hasta);
    if (q.format === 'xlsx') {
      const buf = await xlsx([{ nombre: 'Pérdidas y ganancias', titulo: `Cuenta de pérdidas y ganancias abreviada · ${fmtFecha(f.desde)} a ${fmtFecha(f.hasta)}`, columnas: [{ header: 'Partida', key: 'titulo', width: 75 }, { header: 'Importe', key: 'importe', type: 'money' }], filas: r.lineas as unknown as Record<string, unknown>[] }]);
      return fileOut(buf, `pyg-${f.desde}-${f.hasta}.xlsx`);
    }
    return r;
  });

  app.get('/libros/iva', ver, async (req) => {
    const q = req.query as Record<string, string>;
    const f = rango(q);
    const tipo = q.tipo === 'recibidas' ? 'recibidas' : 'expedidas';
    const r = await librosIva(req.ctx.empresaId, tipo, f.desde, f.hasta);
    if (q.format === 'xlsx') {
      const cols: ColXlsx[] = [
        { header: 'Fecha', key: 'fecha', type: 'date' },
        { header: tipo === 'expedidas' ? 'Número' : 'Nº registro', key: 'numero' },
        ...(tipo === 'recibidas' ? [{ header: 'Nº factura proveedor', key: 'numeroProveedor' } as ColXlsx] : []),
        { header: 'NIF', key: 'nif' },
        { header: tipo === 'expedidas' ? 'Cliente' : 'Proveedor', key: 'nombre', width: 36 },
        { header: 'Base imponible', key: 'base', type: 'money' },
        { header: '% IVA', key: 'ivaTipo', type: 'number', width: 8 },
        { header: 'Cuota IVA', key: 'cuota', type: 'money' },
        { header: '% Recargo', key: 'recargoPct', type: 'number', width: 10 },
        { header: 'Cuota recargo', key: 'cuotaRecargo', type: 'money' },
        { header: 'Retención', key: 'retencion', type: 'money' },
        { header: 'Total factura', key: 'total', type: 'money' },
      ];
      const buf = await xlsx([{ nombre: tipo === 'expedidas' ? 'Facturas expedidas' : 'Facturas recibidas', titulo: `Libro registro de facturas ${tipo} · ${fmtFecha(f.desde)} a ${fmtFecha(f.hasta)}`, columnas: cols, filas: r.lineas, totales: { nombre: 'Totales', base: r.totales.base, cuota: r.totales.cuota, cuotaRecargo: r.totales.recargo, retencion: r.totales.retencion, total: r.totales.total } }]);
      return fileOut(buf, `libro-iva-${tipo}-${f.desde}-${f.hasta}.xlsx`);
    }
    return r;
  });

  app.get('/libros/analitica', ver, async (req) => {
    const q = req.query as Record<string, string>;
    const f = rango(q);
    const r = await analitica(req.ctx.empresaId, f.desde, f.hasta);
    if (q.format === 'xlsx') {
      const buf = await xlsx([
        {
          nombre: 'Centros de coste',
          titulo: `Resultado por centro de coste · ${fmtFecha(f.desde)} a ${fmtFecha(f.hasta)}`,
          columnas: [
            { header: 'Código', key: 'codigo' },
            { header: 'Centro de coste', key: 'nombre', width: 32 },
            { header: 'Ingresos', key: 'ingresos', type: 'money' },
            { header: 'Gastos', key: 'gastos', type: 'money' },
            { header: 'Resultado', key: 'resultado', type: 'money' },
          ],
          filas: r,
        },
      ]);
      return fileOut(buf, `analitica-${f.desde}-${f.hasta}.xlsx`);
    }
    return r;
  });

  /* ── Modelos tributarios ── */
  app.get('/modelos/:modelo', ver, async (req) => {
    const ctx = req.ctx;
    const { modelo } = req.params as { modelo: string };
    const q = req.query as Record<string, string>;
    const anio = Number(q.anio) || new Date().getFullYear();
    const t = Math.min(4, Math.max(1, Number(q.trimestre) || Math.floor(new Date().getMonth() / 3) + 1));
    switch (modelo) {
      case '303':
        return { modelo, anio, trimestre: t, ...(await modelo303(ctx, anio, t)) };
      case '390':
        return { modelo, anio, ...(await modelo390(ctx, anio)) };
      case '111':
        return { modelo, anio, trimestre: t, ...(await modelo111(ctx, anio, t)) };
      case '115':
        return { modelo, anio, trimestre: t, ...(await modelo115(ctx, anio, t)) };
      case '180':
        return { modelo, anio, ...(await modelo180(ctx, anio)) };
      case '190':
        return { modelo, anio, ...(await modelo190(ctx, anio)) };
      case '347':
        return { modelo, anio, ...(await modelo347(ctx, anio)) };
      case '349':
        return { modelo, anio, trimestre: q.trimestre ? t : null, ...(await modelo349(ctx, anio, q.trimestre ? t : null)) };
      default:
        throw notFound('Modelo no disponible');
    }
  });

  /* ── Resumen para la portada de contabilidad ── */
  app.get('/resumen', ver, async (req) => {
    const ctx = req.ctx;
    const anio = Number((req.query as { anio?: string }).anio) || new Date().getFullYear();
    const r = await pyg(ctx.empresaId, `${anio}-01-01`, `${anio}-12-31`);
    const meses = await db
      .select({ mes: sql<string>`to_char(${cntAsientos.fecha}, 'MM')`, ingresos: sql<string>`coalesce(sum(CASE WHEN ${cntApuntes.cuenta} LIKE '7%' THEN ${cntApuntes.haber} - ${cntApuntes.debe} ELSE 0 END), 0)`, gastos: sql<string>`coalesce(sum(CASE WHEN ${cntApuntes.cuenta} LIKE '6%' THEN ${cntApuntes.debe} - ${cntApuntes.haber} ELSE 0 END), 0)` })
      .from(cntApuntes)
      .innerJoin(cntAsientos, eq(cntAsientos.id, cntApuntes.asientoId))
      .where(and(eq(cntAsientos.empresaId, ctx.empresaId), gte(cntAsientos.fecha, `${anio}-01-01`), lte(cntAsientos.fecha, `${anio}-12-31`), sql`${cntAsientos.origen} NOT IN ('regularizacion','cierre')`))
      .groupBy(sql`to_char(${cntAsientos.fecha}, 'MM')`)
      .orderBy(sql`to_char(${cntAsientos.fecha}, 'MM')`);
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return {
      anio,
      resultado: r.resultado,
      cifraNegocios: r.lineas.find((l) => l.id === '1')?.importe ?? 0,
      meses: nombres.map((n, i) => {
        const m = meses.find((x) => Number(x.mes) === i + 1);
        return { mes: n, ingresos: round(Number(m?.ingresos ?? 0)), gastos: round(Number(m?.gastos ?? 0)) };
      }),
      hoy: hoy(),
      origenes: ASIENTO_ORIGENES.map((o: { value: string }) => ({ value: o.value, label: optionLabel(ASIENTO_ORIGENES, o.value)?.label })),
    };
  });

  /* ── Centros de coste y datos fiscales de terceros ── */
  registerCrud(app, { path: '/centros', resource: cntShared.centroCosteResource, table: cntCentrosCoste, entity: 'cnt_centro_coste', perms: { ver: 'cnt.ver', crear: 'cnt.gestionar' } });
  registerCrud(app, {
    path: '/terceros-fiscal',
    resource: cntShared.terceroFiscalResource,
    table: cntTercerosFiscal,
    entity: 'cnt_tercero_fiscal',
    perms: { ver: 'cnt.ver', crear: 'cnt.gestionar' },
    hardDelete: true,
    beforeSave: async (tx, ctx, data, existing) => {
      if (!existing && data.terceroId) {
        const [ya] = await tx.select({ id: cntTercerosFiscal.id }).from(cntTercerosFiscal).where(and(eq(cntTercerosFiscal.empresaId, ctx.empresaId), eq(cntTercerosFiscal.terceroId, data.terceroId)));
        if (ya) throw conflict('Este tercero ya tiene configuración fiscal: edítala');
      }
      return data;
    },
  });
}
