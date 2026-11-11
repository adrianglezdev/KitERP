import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { round, tesShared, toZod } from '@kite/shared';
import { db } from '../../db/client';
import { terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { audit } from '../../core/audit';
import { registerCrud } from '../../core/crud';
import { badRequest, conflict, notFound, parse } from '../../core/errors';
import { fileBuffer, getFile } from '../../core/files';
import { canOnOwner, guard } from '../../core/permissions';
import { tesConciliaciones, tesCuentas, tesMovimientos, tesPagos, tesRemesas, tesVencimientos } from './schema';
import { EPS, compensar, pendienteDe, recalcVencimiento, registrarPago, siguienteCuentaContable } from './service';
import { cargarRemesa, cerrarRemesa, crearRemesa, devolverRecibo, marcarEnviada, motivoNoRemesable, quitarDeRemesa } from './remesas';
import { conciliar, deshacerConciliacion, importarExtracto, insertarMovimientos, marcarSinPareja, sugerencias } from './conciliacion';
import { prevision, procesarImpagos, saldosCuentas } from './informes';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
const hoy = () => new Date().toISOString().slice(0, 10);
const medio = z.enum(['transferencia', 'recibo', 'efectivo', 'tarjeta', 'pagare']).default('transferencia');

export async function tesRoutes(app: FastifyInstance) {
  const ver = { preHandler: guard('tes.ver') };
  const gestionar = { preHandler: guard('tes.gestionar') };

  /* ── Bancos y cajas ── */
  registerCrud(app, {
    path: '/cuentas',
    resource: tesShared.cuentaBancariaResource,
    table: tesCuentas,
    entity: 'tes_cuenta',
    perms: { ver: 'tes.ver', crear: 'tes.gestionar' },
    beforeSave: async (tx, ctx, data, existing) => {
      if (!existing && !data.cuentaContable) data.cuentaContable = await siguienteCuentaContable(tx, ctx.empresaId, data.tipo ?? 'banco');
      if (data.cuentaContable) {
        data.cuentaContable = String(data.cuentaContable).replace(/\D/g, '');
        if (!/^57\d{5,}$/.test(data.cuentaContable)) throw badRequest('La cuenta contable de un banco o caja empieza por 570 o 572 y tiene 7 dígitos');
      }
      if (data.porDefecto) await tx.update(tesCuentas).set({ porDefecto: false }).where(and(eq(tesCuentas.empresaId, ctx.empresaId), existing ? ne(tesCuentas.id, existing.id) : undefined));
      return data;
    },
  });
  app.get('/saldos', ver, async (req) => saldosCuentas(req.ctx.empresaId));

  /* ── Vencimientos ── */
  app.get('/vencimientos', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 50));
    const conds: (SQL | undefined)[] = [eq(tesVencimientos.empresaId, ctx.empresaId)];
    if (q.circuito) conds.push(eq(tesVencimientos.circuito, q.circuito));
    if (q.estado) conds.push(inArray(tesVencimientos.estado, q.estado.split(',')));
    else if (q.abiertos !== '0') conds.push(inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'remesado', 'devuelto', 'impagado']));
    if (q.terceroId) conds.push(eq(tesVencimientos.terceroId, q.terceroId));
    if (q.documentoId) conds.push(eq(tesVencimientos.documentoId, q.documentoId));
    if (q.remesaId) conds.push(eq(tesVencimientos.remesaId, q.remesaId));
    if (q.desde) conds.push(gte(tesVencimientos.fecha, q.desde));
    if (q.hasta) conds.push(lte(tesVencimientos.fecha, q.hasta));
    if (q.vencidos === '1') conds.push(lt(tesVencimientos.fecha, hoy()));
    if (q.formaPago) conds.push(eq(tesVencimientos.formaPagoTipo, q.formaPago));
    if (q.q) {
      const like = `%${q.q.trim().replace(/[%_]/g, '')}%`;
      conds.push(or(ilike(tesVencimientos.concepto, like), ilike(terceros.nombre, like), ilike(terceros.nif, like), ilike(documentos.codigo, like)));
    }
    const where = and(...conds);
    const sortCols: Record<string, any> = { fecha: tesVencimientos.fecha, importe: tesVencimientos.importe, tercero: terceros.nombre };
    const dir = q.dir === 'desc' ? desc : asc;
    const [rows, [tot]] = await Promise.all([
      db
        .select({ v: tesVencimientos, tercero: terceros.nombre, nif: terceros.nif, iban: terceros.iban, mandato: terceros.mandatoSepa, codigo: documentos.codigo, tipoDoc: documentos.tipo, comercialId: terceros.comercialId })
        .from(tesVencimientos)
        .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
        .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
        .where(where)
        .orderBy(dir(sortCols[q.sort ?? 'fecha'] ?? tesVencimientos.fecha), asc(tesVencimientos.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ n: sql<number>`count(*)::int`, importe: sql<string>`coalesce(sum(${tesVencimientos.importe}), 0)`, pendiente: sql<string>`coalesce(sum(${tesVencimientos.importe} - ${tesVencimientos.importePagado}), 0)` })
        .from(tesVencimientos)
        .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
        .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
        .where(where),
    ]);
    const h = hoy();
    return {
      items: rows.map((r) => ({
        ...r.v,
        tercero: r.tercero,
        nif: r.nif,
        documento: r.codigo,
        tipoDocumento: r.tipoDoc,
        pendiente: pendienteDe(r.v),
        diasVencido: r.v.fecha < h ? Math.floor((Date.parse(h) - Date.parse(r.v.fecha)) / 86400_000) : 0,
        domiciliable: r.v.circuito === 'cobro' ? !!(r.iban && r.mandato) && r.v.formaPagoTipo === 'domiciliacion' : !!r.iban,
      })),
      total: tot?.n ?? 0,
      sumaImporte: round(Number(tot?.importe ?? 0)),
      sumaPendiente: round(Number(tot?.pendiente ?? 0)),
      page,
      pageSize,
    };
  });

  app.get('/vencimientos/resumen', ver, async (req) => {
    const ctx = req.ctx;
    const h = hoy();
    const en30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const rows = await db
      .select({
        circuito: tesVencimientos.circuito,
        pendiente: sql<string>`coalesce(sum(${tesVencimientos.importe} - ${tesVencimientos.importePagado}), 0)`,
        vencido: sql<string>`coalesce(sum(${tesVencimientos.importe} - ${tesVencimientos.importePagado}) FILTER (WHERE ${tesVencimientos.fecha} < ${h}), 0)`,
        proximos: sql<string>`coalesce(sum(${tesVencimientos.importe} - ${tesVencimientos.importePagado}) FILTER (WHERE ${tesVencimientos.fecha} >= ${h} AND ${tesVencimientos.fecha} <= ${en30}), 0)`,
        impagado: sql<string>`coalesce(sum(${tesVencimientos.importe} - ${tesVencimientos.importePagado}) FILTER (WHERE ${tesVencimientos.estado} IN ('impagado','devuelto')), 0)`,
        n: sql<number>`count(*)::int`,
      })
      .from(tesVencimientos)
      .where(and(eq(tesVencimientos.empresaId, ctx.empresaId), inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'remesado', 'devuelto', 'impagado'])))
      .groupBy(tesVencimientos.circuito);
    const out = (c: string) => {
      const r = rows.find((x) => x.circuito === c);
      return { pendiente: round(Number(r?.pendiente ?? 0)), vencido: round(Number(r?.vencido ?? 0)), proximos30: round(Number(r?.proximos ?? 0)), impagado: round(Number(r?.impagado ?? 0)), n: r?.n ?? 0 };
    };
    return { cobro: out('cobro'), pago: out('pago') };
  });

  app.get('/vencimientos/:id', ver, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [r] = await db
      .select({ v: tesVencimientos, tercero: terceros.nombre, codigo: documentos.codigo })
      .from(tesVencimientos)
      .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
      .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
      .where(and(eq(tesVencimientos.id, id), eq(tesVencimientos.empresaId, ctx.empresaId)));
    if (!r) throw notFound('Vencimiento no encontrado');
    const pagos = await db
      .select({ p: tesPagos, cuenta: tesCuentas.nombre, conciliado: sql<boolean>`EXISTS (SELECT 1 FROM ${tesConciliaciones} c WHERE c.pago_id = ${tesPagos.id})` })
      .from(tesPagos)
      .leftJoin(tesCuentas, eq(tesCuentas.id, tesPagos.cuentaId))
      .where(eq(tesPagos.vencimientoId, id))
      .orderBy(asc(tesPagos.fecha), asc(tesPagos.creadoEn));
    return { ...r.v, tercero: r.tercero, documento: r.codigo, pendiente: pendienteDe(r.v), pagos: pagos.map((p) => ({ ...p.p, cuenta: p.cuenta, conciliado: p.conciliado })) };
  });

  const manualSchema = toZod(tesShared.vencimientoManualResource);
  app.post('/vencimientos', gestionar, async (req, reply) => {
    const ctx = req.ctx;
    const b = parse(manualSchema, req.body) as Record<string, any>;
    if (!b.importe) throw badRequest('Indica el importe');
    const row = await db.transaction(async (tx) => {
      const [v] = await tx
        .insert(tesVencimientos)
        .values({ empresaId: ctx.empresaId, circuito: b.circuito, terceroId: b.terceroId ?? null, concepto: b.concepto, fecha: b.fecha, importe: round(b.importe), cuentaContrapartida: b.cuentaContrapartida ? String(b.cuentaContrapartida).replace(/\D/g, '') : null, notas: b.notas ?? null, formaPagoTipo: 'transferencia' })
        .returning();
      await audit(tx, ctx, 'crear', 'tes_vencimiento', v!.id, { manual: true, concepto: b.concepto, importe: b.importe, fecha: b.fecha });
      return v!;
    });
    reply.code(201);
    return row;
  });

  app.patch('/vencimientos/:id', gestionar, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const b = parse(z.object({ fecha: fecha.optional(), notas: z.string().max(2000).nullish(), concepto: z.string().max(200).optional() }), req.body);
    return db.transaction(async (tx) => {
      const [v] = await tx.select().from(tesVencimientos).where(and(eq(tesVencimientos.id, id), eq(tesVencimientos.empresaId, ctx.empresaId)));
      if (!v) throw notFound('Vencimiento no encontrado');
      if (b.concepto && v.documentoId) delete b.concepto;
      const [u] = await tx.update(tesVencimientos).set(b).where(eq(tesVencimientos.id, id)).returning();
      await audit(tx, ctx, 'editar', 'tes_vencimiento', id, { antes: { fecha: v.fecha, notas: v.notas }, despues: b });
      return u;
    });
  });

  app.delete('/vencimientos/:id', gestionar, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const [v] = await tx.select().from(tesVencimientos).where(and(eq(tesVencimientos.id, id), eq(tesVencimientos.empresaId, ctx.empresaId)));
      if (!v) throw notFound('Vencimiento no encontrado');
      if (v.documentoId) throw conflict('Los vencimientos de una factura no se borran: se cobran, se compensan o se rectifica la factura');
      const [p] = await tx.select({ id: tesPagos.id }).from(tesPagos).where(eq(tesPagos.vencimientoId, id)).limit(1);
      if (p) throw conflict('Este vencimiento ya tiene cobros o pagos registrados');
      await tx.delete(tesVencimientos).where(eq(tesVencimientos.id, id));
      await audit(tx, ctx, 'borrar', 'tes_vencimiento', id, v);
    });
    return { ok: true };
  });

  app.post('/vencimientos/:id/pagos', gestionar, async (req) => {
    const { id } = req.params as { id: string };
    const b = parse(z.object({ importe: z.coerce.number().nullish(), fecha: fecha.default(hoy()), cuentaId: z.string().uuid().nullish(), medio, notas: z.string().max(300).nullish() }), req.body);
    return db.transaction((tx) => registrarPago(tx, req.ctx, { vencimientoId: id, ...b }));
  });

  app.post('/vencimientos/registrar-lote', gestionar, async (req) => {
    const b = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(500), fecha: fecha.default(hoy()), cuentaId: z.string().uuid().nullish(), medio }), req.body);
    return db.transaction(async (tx) => {
      let n = 0;
      let total = 0;
      for (const id of b.ids) {
        const [v] = await tx.select().from(tesVencimientos).where(and(eq(tesVencimientos.id, id), eq(tesVencimientos.empresaId, req.ctx.empresaId)));
        if (!v || Math.abs(pendienteDe(v)) < EPS || v.estado === 'remesado') continue;
        const r = await registrarPago(tx, req.ctx, { vencimientoId: id, fecha: b.fecha, cuentaId: b.cuentaId, medio: b.medio });
        n++;
        total = round(total + r.pago.importe);
      }
      if (!n) throw badRequest('Ninguno de los vencimientos elegidos tiene importe pendiente (los que están en una remesa se cobran al cerrarla)');
      return { registrados: n, total };
    });
  });

  app.post('/vencimientos/compensar', gestionar, async (req) => {
    const b = parse(z.object({ ids: z.array(z.string().uuid()).min(2), fecha: fecha.default(hoy()) }), req.body);
    return db.transaction((tx) => compensar(tx, req.ctx, b.ids, b.fecha));
  });

  app.post('/vencimientos/:id/devolver', gestionar, async (req) => {
    const { id } = req.params as { id: string };
    const b = parse(z.object({ fecha: fecha.default(hoy()), motivo: z.string().max(300).nullish() }), req.body);
    return db.transaction((tx) => devolverRecibo(tx, req.ctx, id, b));
  });

  app.post('/vencimientos/:id/impagado', gestionar, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const { activo } = parse(z.object({ activo: z.boolean().default(true) }), req.body);
    return db.transaction(async (tx) => {
      const [v] = await tx.select().from(tesVencimientos).where(and(eq(tesVencimientos.id, id), eq(tesVencimientos.empresaId, ctx.empresaId)));
      if (!v) throw notFound('Vencimiento no encontrado');
      if (activo) {
        if (v.estado === 'pagado') throw conflict('El vencimiento ya está pagado');
        await audit(tx, ctx, 'marcar_impagado', 'tes_vencimiento', id);
        return recalcVencimiento(tx, id, 'impagado');
      }
      await tx.update(tesVencimientos).set({ estado: 'pendiente', recordatorios: 0 }).where(eq(tesVencimientos.id, id));
      await audit(tx, ctx, 'reactivar', 'tes_vencimiento', id);
      return recalcVencimiento(tx, id);
    });
  });

  /** Anula un cobro o pago registrado por error (se registra el movimiento contrario y su asiento). */
  app.post('/pagos/:id/anular', gestionar, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    return db.transaction(async (tx) => {
      const [p] = await tx.select().from(tesPagos).where(and(eq(tesPagos.id, id), eq(tesPagos.empresaId, ctx.empresaId)));
      if (!p) throw notFound('Cobro o pago no encontrado');
      if (p.medio === 'devolucion' || p.notas?.startsWith('Anulación')) throw conflict('Este movimiento ya es una anulación');
      const [c] = await tx.select({ id: tesConciliaciones.id }).from(tesConciliaciones).where(eq(tesConciliaciones.pagoId, id));
      if (c) throw conflict('Está conciliado con el banco: deshaz antes la conciliación');
      const [ya] = await tx.select({ id: tesPagos.id }).from(tesPagos).where(and(eq(tesPagos.vencimientoId, p.vencimientoId), eq(tesPagos.notas, `Anulación del ${p.id}`)));
      if (ya) throw conflict('Este cobro o pago ya está anulado');
      return registrarPago(tx, ctx, { vencimientoId: p.vencimientoId, importe: -p.importe, fecha: hoy(), cuentaId: p.cuentaId, medio: p.medio === 'compensacion' ? 'compensacion' : 'devolucion', notas: `Anulación del ${p.id}` });
    });
  });

  /* ── Remesas ── */
  app.get('/remesas', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const rows = await db
      .select({ r: tesRemesas, cuenta: tesCuentas.nombre })
      .from(tesRemesas)
      .innerJoin(tesCuentas, eq(tesCuentas.id, tesRemesas.cuentaId))
      .where(and(eq(tesRemesas.empresaId, ctx.empresaId), q.tipo ? eq(tesRemesas.tipo, q.tipo) : undefined, q.estado ? eq(tesRemesas.estado, q.estado) : undefined))
      .orderBy(desc(tesRemesas.fechaCargo), desc(tesRemesas.creadoEn))
      .limit(200);
    return rows.map((r) => ({ ...r.r, cuenta: r.cuenta }));
  });

  app.get('/remesas/candidatos', ver, async (req) => {
    const ctx = req.ctx;
    const tipo = (req.query as { tipo?: string }).tipo === 'pago' ? 'pago' : 'cobro';
    return db.transaction(async (tx) => {
      const vs = await tx
        .select({ v: tesVencimientos, tercero: terceros.nombre, codigo: documentos.codigo })
        .from(tesVencimientos)
        .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
        .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
        .where(and(eq(tesVencimientos.empresaId, ctx.empresaId), eq(tesVencimientos.circuito, tipo), inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'devuelto']), sql`${tesVencimientos.importe} > 0`, isNull(tesVencimientos.remesaId)))
        .orderBy(asc(tesVencimientos.fecha))
        .limit(500);
      const out = [];
      for (const r of vs) {
        if (tipo === 'cobro' && r.v.formaPagoTipo !== 'domiciliacion') continue;
        out.push({ ...r.v, tercero: r.tercero, documento: r.codigo, pendiente: pendienteDe(r.v), motivo: await motivoNoRemesable(tx, r.v, tipo) });
      }
      return out;
    });
  });

  app.get('/remesas/:id', ver, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [r] = await db
      .select({ r: tesRemesas, cuenta: tesCuentas.nombre, iban: tesCuentas.iban })
      .from(tesRemesas)
      .innerJoin(tesCuentas, eq(tesCuentas.id, tesRemesas.cuentaId))
      .where(and(eq(tesRemesas.id, id), eq(tesRemesas.empresaId, ctx.empresaId)));
    if (!r) throw notFound('Remesa no encontrada');
    // recibos actuales y los que pasaron por ella (devueltos)
    const vs = await db
      .select({ v: tesVencimientos, tercero: terceros.nombre, codigo: documentos.codigo })
      .from(tesVencimientos)
      .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
      .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
      .where(or(eq(tesVencimientos.remesaId, id), sql`EXISTS (SELECT 1 FROM ${tesPagos} p WHERE p.vencimiento_id = ${tesVencimientos.id} AND p.remesa_id = ${id})`))
      .orderBy(asc(terceros.nombre));
    return { ...r.r, cuenta: r.cuenta, iban: r.iban, vencimientos: vs.map((x) => ({ ...x.v, tercero: x.tercero, documento: x.codigo, pendiente: pendienteDe(x.v) })) };
  });

  app.post('/remesas', gestionar, async (req, reply) => {
    const b = parse(z.object({ tipo: z.enum(['cobro', 'pago']), cuentaId: z.string().uuid({ message: 'Elige la cuenta bancaria' }), fechaCargo: fecha, vencimientoIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos un vencimiento').max(2000) }), req.body);
    if (b.fechaCargo < hoy()) throw badRequest('La fecha de cargo no puede ser anterior a hoy');
    const r = await db.transaction((tx) => crearRemesa(tx, req.ctx, b));
    reply.code(201);
    const { xml: _x, ...rest } = r;
    return rest;
  });

  app.get('/remesas/:id/xml', ver, async (req) => {
    const r = await db.transaction((tx) => cargarRemesa(tx, req.ctx, (req.params as { id: string }).id));
    if (!r.archivoId) throw notFound('La remesa no tiene fichero');
    const f = await getFile(db, r.archivoId);
    return { __file: true, buffer: await fileBuffer(f.ruta), mime: 'application/xml', name: f.nombre };
  });

  app.post('/remesas/:id/enviada', gestionar, async (req) => {
    await db.transaction((tx) => marcarEnviada(tx, req.ctx, (req.params as { id: string }).id));
    return { ok: true };
  });
  app.post('/remesas/:id/cerrar', gestionar, async (req) => {
    const b = parse(z.object({ fecha: fecha.optional() }), req.body ?? {});
    return db.transaction((tx) => cerrarRemesa(tx, req.ctx, (req.params as { id: string }).id, b.fecha));
  });
  app.delete('/remesas/:id/vencimientos/:vid', gestionar, async (req) => {
    const { id, vid } = req.params as { id: string; vid: string };
    await db.transaction((tx) => quitarDeRemesa(tx, req.ctx, id, vid));
    return { ok: true };
  });

  /* ── Extracto y conciliación ── */
  app.get('/movimientos', ver, async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 25));
    const conds: (SQL | undefined)[] = [eq(tesMovimientos.empresaId, ctx.empresaId)];
    if (q.cuentaId) conds.push(eq(tesMovimientos.cuentaId, q.cuentaId));
    if (q.estado) conds.push(inArray(tesMovimientos.estado, q.estado.split(',')));
    if (q.desde) conds.push(gte(tesMovimientos.fecha, q.desde));
    if (q.hasta) conds.push(lte(tesMovimientos.fecha, q.hasta));
    if (q.q) conds.push(ilike(tesMovimientos.concepto, `%${q.q.replace(/[%_]/g, '')}%`));
    const where = and(...conds);
    const [rows, [tot]] = await Promise.all([
      db
        .select({ m: tesMovimientos, cuenta: tesCuentas.nombre })
        .from(tesMovimientos)
        .innerJoin(tesCuentas, eq(tesCuentas.id, tesMovimientos.cuentaId))
        .where(where)
        .orderBy(desc(tesMovimientos.fecha), desc(tesMovimientos.creadoEn))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(tesMovimientos).where(where),
    ]);
    const conc = rows.length
      ? await db
          .select({ movimientoId: tesConciliaciones.movimientoId, concepto: tesVencimientos.concepto, tercero: terceros.nombre, importe: tesConciliaciones.importe })
          .from(tesConciliaciones)
          .innerJoin(tesVencimientos, eq(tesVencimientos.id, tesConciliaciones.vencimientoId))
          .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
          .where(inArray(tesConciliaciones.movimientoId, rows.map((r) => r.m.id)))
      : [];
    const items = [];
    for (const r of rows) {
      items.push({
        ...r.m,
        cuenta: r.cuenta,
        conciliadoCon: conc.filter((c) => c.movimientoId === r.m.id).map((c) => ({ concepto: c.concepto, tercero: c.tercero, importe: c.importe })),
        sugerencias: r.m.estado === 'pendiente' && q.sugerencias !== '0' ? await sugerencias(ctx, r.m) : [],
      });
    }
    return { items, total: tot?.n ?? 0, page, pageSize };
  });

  app.post('/movimientos/importar', gestionar, async (req) => {
    const b = parse(z.object({ cuentaId: z.string().uuid({ message: 'Elige la cuenta' }), archivoId: z.string().uuid() }), req.body);
    return db.transaction((tx) => importarExtracto(tx, req.ctx, b.cuentaId, b.archivoId));
  });

  app.post('/movimientos', gestionar, async (req, reply) => {
    const b = parse(z.object({ cuentaId: z.string().uuid(), fecha, importe: z.coerce.number().refine((n) => n !== 0, 'El importe no puede ser cero'), concepto: z.string().trim().min(1).max(500), referencia: z.string().max(60).nullish() }), req.body);
    const r = await db.transaction(async (tx) => {
      const [c] = await tx.select({ id: tesCuentas.id }).from(tesCuentas).where(and(eq(tesCuentas.id, b.cuentaId), eq(tesCuentas.empresaId, req.ctx.empresaId)));
      if (!c) throw badRequest('La cuenta no existe');
      return insertarMovimientos(tx, req.ctx, b.cuentaId, 'manual', [{ ...b, referencia: b.referencia ?? null }]);
    });
    reply.code(201);
    return r;
  });

  app.post('/movimientos/:id/conciliar', gestionar, async (req) => {
    const b = parse(z.object({ tipo: z.enum(['vencimiento', 'pago', 'remesa']), id: z.string().uuid() }), req.body);
    return db.transaction((tx) => conciliar(tx, req.ctx, (req.params as { id: string }).id, b));
  });

  /** Concilia de una vez los movimientos con una única pareja clara (mismo importe y nombre o referencia en el concepto). */
  app.post('/movimientos/autoconciliar', gestionar, async (req) => {
    const ctx = req.ctx;
    const b = parse(z.object({ cuentaId: z.string().uuid().nullish() }), req.body ?? {});
    const pend = await db
      .select()
      .from(tesMovimientos)
      .where(and(eq(tesMovimientos.empresaId, ctx.empresaId), eq(tesMovimientos.estado, 'pendiente'), b.cuentaId ? eq(tesMovimientos.cuentaId, b.cuentaId) : undefined))
      .limit(300);
    let n = 0;
    const usados = new Set<string>();
    for (const m of pend) {
      const s = await sugerencias(ctx, m);
      const top = s[0];
      if (!top || top.puntuacion < 75 || (s[1] && s[1].puntuacion >= top.puntuacion - 10) || usados.has(top.id)) continue;
      usados.add(top.id);
      await db.transaction((tx) => conciliar(tx, ctx, m.id, { tipo: top.tipo, id: top.id }));
      n++;
    }
    return { conciliados: n, revisados: pend.length };
  });

  app.post('/movimientos/:id/ignorar', gestionar, async (req) => {
    const b = parse(z.object({ nota: z.string().max(300).nullish() }), req.body ?? {});
    await db.transaction((tx) => marcarSinPareja(tx, req.ctx, (req.params as { id: string }).id, b.nota ?? null));
    return { ok: true };
  });
  app.post('/movimientos/:id/deshacer', gestionar, async (req) => {
    await db.transaction((tx) => deshacerConciliacion(tx, req.ctx, (req.params as { id: string }).id));
    return { ok: true };
  });
  app.delete('/movimientos/:id', gestionar, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(tesMovimientos).where(and(eq(tesMovimientos.id, id), eq(tesMovimientos.empresaId, ctx.empresaId)));
      if (!m) throw notFound('Movimiento no encontrado');
      if (m.estado === 'conciliado') throw conflict('Deshaz antes la conciliación');
      await tx.delete(tesMovimientos).where(eq(tesMovimientos.id, id));
      await audit(tx, ctx, 'borrar', 'tes_movimiento', id, m);
    });
    return { ok: true };
  });

  /* ── Previsión e impagos ── */
  app.get('/prevision', ver, async (req) => prevision(req.ctx.empresaId, Math.min(26, Math.max(4, Number((req.query as { semanas?: string }).semanas) || 13))));

  app.post('/impagos/ejecutar', gestionar, async (req) => {
    const b = parse(z.object({ fecha: fecha.optional() }), req.body ?? {});
    return db.transaction((tx) => procesarImpagos(tx, req.ctx, b.fecha));
  });

  /* ── Ficha del tercero ── */
  app.get('/terceros/:id', ver, async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    const [t] = await db.select({ id: terceros.id, comercialId: terceros.comercialId, empresaId: terceros.empresaId }).from(terceros).where(eq(terceros.id, id));
    if (!t || t.empresaId !== ctx.empresaId || !(await canOnOwner(ctx, 'terceros.ver', t.comercialId))) throw notFound('Cliente o proveedor no encontrado');
    const vs = await db
      .select({ v: tesVencimientos, codigo: documentos.codigo })
      .from(tesVencimientos)
      .leftJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
      .where(eq(tesVencimientos.terceroId, id))
      .orderBy(desc(tesVencimientos.fecha))
      .limit(200);
    const pagos = vs.length
      ? await db
          .select({ p: tesPagos, cuenta: tesCuentas.nombre })
          .from(tesPagos)
          .leftJoin(tesCuentas, eq(tesCuentas.id, tesPagos.cuentaId))
          .where(inArray(tesPagos.vencimientoId, vs.map((v) => v.v.id)))
          .orderBy(desc(tesPagos.fecha))
      : [];
    const h = hoy();
    const abiertos = vs.filter((v) => !['pagado'].includes(v.v.estado));
    const resumen = (c: string) => ({
      pendiente: round(abiertos.filter((v) => v.v.circuito === c).reduce((a, v) => a + pendienteDe(v.v), 0)),
      vencido: round(abiertos.filter((v) => v.v.circuito === c && v.v.fecha < h).reduce((a, v) => a + pendienteDe(v.v), 0)),
    });
    // días medios de cobro de lo ya cobrado (fecha del cobro − fecha de la factura)
    const [dmc] = await db
      .select({ d: sql<string | null>`avg(${tesPagos.fecha} - ${documentos.fecha})` })
      .from(tesPagos)
      .innerJoin(tesVencimientos, eq(tesVencimientos.id, tesPagos.vencimientoId))
      .innerJoin(documentos, eq(documentos.id, tesVencimientos.documentoId))
      .where(and(eq(tesVencimientos.terceroId, id), eq(tesVencimientos.circuito, 'cobro'), sql`${tesPagos.importe} > 0`));
    return {
      cobro: resumen('cobro'),
      pago: resumen('pago'),
      diasMedioCobro: dmc?.d ? Math.round(Number(dmc.d)) : null,
      vencimientos: vs.map((v) => ({ ...v.v, documento: v.codigo, pendiente: pendienteDe(v.v) })),
      pagos: pagos.map((p) => ({ ...p.p, cuenta: p.cuenta, vencimiento: vs.find((v) => v.v.id === p.p.vencimientoId)?.v.concepto ?? null })),
    };
  });
}
