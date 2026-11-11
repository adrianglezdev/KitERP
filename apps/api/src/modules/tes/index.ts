import { and, asc, desc, eq, ilike, inArray, lte, sql } from 'drizzle-orm';
import { MODULE_CODES, fmtMoney, optionLabel, round, tesShared } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { empresas, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { systemCtx, type Ctx } from '../../core/context';
import { defineModule, type SeedCtx } from '../../core/modules';
import { can } from '../../core/permissions';
import { tesCuentas, tesMovimientos, tesPagos, tesRemesas, tesVencimientos } from './schema';
import { tesRoutes } from './routes';
import { pendienteDe, crearVencimientosDocumento, registrarPago } from './service';
import { cerrarRemesa, crearRemesa, devolverRecibo, motivoNoRemesable } from './remesas';
import { conciliar, insertarMovimientos } from './conciliacion';
import { procesarImpagos } from './informes';

const hoy = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);

/** IBAN español con dígitos de control correctos a partir de la cuenta (entidad, oficina, DC y número). */
function ibanES(ccc: string) {
  const numeric = (ccc + 'ES00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return `ES${String(98 - rem).padStart(2, '0')}${ccc}`;
}

async function seed(tx: Tx, s: SeedCtx) {
  const ctx: Ctx = { ...systemCtx(s.empresaId, MODULE_CODES), usuarioId: s.adminUsuarioId };
  const [emp] = await tx.select().from(empresas).where(eq(empresas.id, s.empresaId));
  const anio = Number(hoy().slice(0, 4));
  const [caixa, bbva] = await tx
    .insert(tesCuentas)
    .values([
      { empresaId: s.empresaId, nombre: 'CaixaBank cuenta principal', tipo: 'banco', iban: emp?.iban ?? ibanES('21000418450200051332'), bic: emp?.bic ?? 'CAIXESBBXXX', cuentaContable: '5720001', saldoInicial: 45000, fechaSaldo: `${anio}-01-01`, sufijoSepa: '000', porDefecto: true },
      { empresaId: s.empresaId, nombre: 'BBVA pagos a proveedores', tipo: 'banco', iban: ibanES('01825322010201234567'), bic: 'BBVAESMMXXX', cuentaContable: '5720002', saldoInicial: 0, fechaSaldo: `${anio}-01-01`, sufijoSepa: '000' },
      { empresaId: s.empresaId, nombre: 'Caja oficina', tipo: 'caja', cuentaContable: '5700001', saldoInicial: 600, fechaSaldo: `${anio}-01-01` },
    ])
    .returning();

  // Facturas que ya existían antes de activar Tesorería (por si su semilla se cargó sin el módulo)
  const facturas = await tx
    .select({ id: documentos.id, tipo: documentos.tipo })
    .from(documentos)
    .where(and(eq(documentos.empresaId, s.empresaId), eq(documentos.bloqueado, true), inArray(documentos.tipo, ['factura', 'factura_rectificativa', 'factura_simplificada', 'factura_proveedor'])));
  for (const f of facturas) await crearVencimientosDocumento(tx, ctx, f.id, f.tipo === 'factura_proveedor' ? 'pago' : 'cobro');

  const h = hoy();
  const cobros = await tx
    .select({ v: tesVencimientos, nombre: terceros.nombre })
    .from(tesVencimientos)
    .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
    .where(and(eq(tesVencimientos.empresaId, s.empresaId), eq(tesVencimientos.circuito, 'cobro'), eq(tesVencimientos.estado, 'pendiente'), sql`${tesVencimientos.importe} > 0`))
    .orderBy(asc(tesVencimientos.fecha));
  const domiciliables: typeof cobros = [];
  const otros: typeof cobros = [];
  for (const c of cobros) ((await motivoNoRemesable(tx, c.v, 'cobro')) || c.v.formaPagoTipo !== 'domiciliacion' ? otros : domiciliables).push(c);

  const movimientos: { fecha: string; importe: number; concepto: string; referencia?: string }[] = [];
  const aConciliar: { idx: number; tipo: 'pago' | 'remesa' | 'vencimiento'; id: string }[] = [];

  // Cobros por transferencia de los vencimientos más antiguos (la mitad de los vencidos)
  const vencidos = otros.filter((c) => c.v.fecha < h);
  for (const [i, c] of vencidos.slice(0, Math.ceil(vencidos.length / 2)).entries()) {
    const fecha = c.v.fecha > addDays(h, -3) ? h : addDays(c.v.fecha, 2);
    const r = await registrarPago(tx, ctx, { vencimientoId: c.v.id, fecha, cuentaId: caixa!.id, medio: 'transferencia' });
    movimientos.push({ fecha, importe: r.pago.importe, concepto: `TRANSF DE ${c.nombre?.toUpperCase() ?? ''} ${c.v.concepto ?? ''}`.slice(0, 76) });
    if (i % 2 === 0) aConciliar.push({ idx: movimientos.length - 1, tipo: 'pago', id: r.pago.id });
  }
  // Movimientos del banco de cobros aún sin registrar (para que la conciliación los proponga)
  for (const c of otros.filter((x) => x.v.fecha >= addDays(h, -20) && !vencidos.slice(0, Math.ceil(vencidos.length / 2)).includes(x)).slice(0, 2))
    movimientos.push({ fecha: addDays(h, -1), importe: pendienteDe(c.v), concepto: `TRANSFERENCIA ${c.nombre?.toUpperCase() ?? ''} PAGO FRA` });

  // Remesa de recibos ya cargada (con una devolución) y otra pendiente de enviar
  const pasados = domiciliables.filter((c) => c.v.fecha <= h);
  if (pasados.length) {
    const fechaCargo = pasados[pasados.length - 1]!.v.fecha;
    const r = await crearRemesa(tx, ctx, { tipo: 'cobro', cuentaId: caixa!.id, fechaCargo, vencimientoIds: pasados.map((c) => c.v.id) });
    await tx.update(tesRemesas).set({ estado: 'enviada' }).where(eq(tesRemesas.id, r.id));
    await cerrarRemesa(tx, ctx, r.id, fechaCargo);
    movimientos.push({ fecha: fechaCargo, importe: r.total, concepto: `ABONO REMESA RECIBOS ${r.codigo}` });
    aConciliar.push({ idx: movimientos.length - 1, tipo: 'remesa', id: r.id });
    if (pasados.length > 1) {
      const dev = pasados[0]!;
      await devolverRecibo(tx, ctx, dev.v.id, { fecha: addDays(fechaCargo, 3) > h ? h : addDays(fechaCargo, 3), motivo: 'MS02 · Motivo no especificado por el cliente' });
      movimientos.push({ fecha: addDays(fechaCargo, 3) > h ? h : addDays(fechaCargo, 3), importe: -dev.v.importe, concepto: `DEVOLUCION RECIBO ${dev.nombre?.toUpperCase() ?? ''}` });
    }
  }
  const futuros = domiciliables.filter((c) => c.v.fecha > h);
  if (futuros.length) await crearRemesa(tx, ctx, { tipo: 'cobro', cuentaId: caixa!.id, fechaCargo: futuros[0]!.v.fecha, vencimientoIds: futuros.slice(0, 6).map((c) => c.v.id) });

  // Pagos a proveedores: el más antiguo pagado, el siguiente en una remesa de transferencias
  const pagos = await tx
    .select({ v: tesVencimientos, nombre: terceros.nombre })
    .from(tesVencimientos)
    .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
    .where(and(eq(tesVencimientos.empresaId, s.empresaId), eq(tesVencimientos.circuito, 'pago'), eq(tesVencimientos.estado, 'pendiente'), sql`${tesVencimientos.importe} > 0`))
    .orderBy(asc(tesVencimientos.fecha));
  if (pagos[0]) {
    const fecha = pagos[0].v.fecha <= h ? pagos[0].v.fecha : h;
    const r = await registrarPago(tx, ctx, { vencimientoId: pagos[0].v.id, fecha, cuentaId: caixa!.id, medio: 'transferencia' });
    movimientos.push({ fecha, importe: -r.pago.importe, concepto: `TRANSFERENCIA A ${pagos[0].nombre?.toUpperCase() ?? ''}` });
  }
  if (pagos.length > 1) await crearRemesa(tx, ctx, { tipo: 'pago', cuentaId: bbva!.id, fechaCargo: pagos[1]!.v.fecha > h ? pagos[1]!.v.fecha : addDays(h, 2), vencimientoIds: pagos.slice(1, 3).map((p) => p.v.id) });

  // Previsiones fijas: alquiler, seguros sociales, préstamo e IVA
  const manuales = [];
  for (let m = 0; m < 3; m++) {
    const base = new Date(Date.UTC(anio, Number(h.slice(5, 7)) - 1 + m, 1));
    const y = base.getUTCFullYear();
    const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
    const fin = new Date(Date.UTC(y, base.getUTCMonth() + 1, 0)).getUTCDate();
    if (`${y}-${mm}-05` >= h) manuales.push({ concepto: `Alquiler nave Paterna ${mm}/${y}`, fecha: `${y}-${mm}-05`, importe: 1850, cuentaContrapartida: '6210000' });
    if (`${y}-${mm}-${fin}` >= h) manuales.push({ concepto: `Seguros sociales ${mm}/${y}`, fecha: `${y}-${mm}-${fin}`, importe: 4200, cuentaContrapartida: '4760000' });
    if (`${y}-${mm}-15` >= h) manuales.push({ concepto: `Cuota préstamo furgonetas ${mm}/${y}`, fecha: `${y}-${mm}-15`, importe: 640, cuentaContrapartida: '5200000' });
  }
  manuales.push({ concepto: `IVA 4.º trimestre ${anio} (modelo 303)`, fecha: `${anio + 1}-01-30`, importe: 3500, cuentaContrapartida: '4750000' });
  await tx.insert(tesVencimientos).values(manuales.map((m) => ({ empresaId: s.empresaId, circuito: 'pago', formaPagoTipo: 'transferencia', ...m })));

  // Extracto del banco
  movimientos.push({ fecha: addDays(h, -6), importe: -12.5, concepto: 'COMISION MANTENIMIENTO CUENTA' }, { fecha: addDays(h, -2), importe: -3.2, concepto: 'COMISION TRANSFERENCIA' });
  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  await insertarMovimientos(tx, ctx, caixa!.id, 'n43', movimientos);
  const insertados = await tx.select().from(tesMovimientos).where(eq(tesMovimientos.cuentaId, caixa!.id)).orderBy(asc(tesMovimientos.fecha), asc(tesMovimientos.creadoEn));
  for (const a of aConciliar) {
    const mov = movimientos[a.idx];
    const row = insertados.find((x) => x.fecha === mov!.fecha && Math.abs(x.importe - mov!.importe) < 0.005 && x.estado === 'pendiente');
    if (row) await conciliar(tx, ctx, row.id, { tipo: a.tipo, id: a.id });
  }
}


export default defineModule({
  code: 'tes',
  routes: tesRoutes,

  events: {
    'ventas.factura_emitida': async (tx, ctx, p) => {
      await crearVencimientosDocumento(tx, ctx, p.documentoId, 'cobro');
    },
    'compras.factura_registrada': async (tx, ctx, p) => {
      await crearVencimientosDocumento(tx, ctx, p.documentoId, 'pago');
    },
  },

  refTargets: {
    cuentas_bancarias: {
      table: tesCuentas,
      id: tesCuentas.id,
      label: sql<string>`${tesCuentas.nombre}`,
      sub: sql<string | null>`coalesce(${tesCuentas.iban}, ${tesCuentas.cuentaContable})`,
      search: [tesCuentas.nombre, tesCuentas.iban],
      empresaCol: tesCuentas.empresaId,
      archivedCol: tesCuentas.archivadoEn,
      perm: 'tes.ver',
      where: (_ctx, f) => and(eq(tesCuentas.activo, true), f.tipo ? eq(tesCuentas.tipo, f.tipo) : undefined),
      order: tesCuentas.nombre,
    },
  },

  jobs: [
    {
      id: 'tes.impagos',
      dailyAt: '08:00',
      run: async (_empresaId, ctx) => {
        const r = await db.transaction((tx) => procesarImpagos(tx, ctx));
        return `${r.recordatorios} recordatorios, ${r.impagados} impagados`;
      },
    },
  ],

  dashboard: async (_db, ctx) => {
    if (!can(ctx, 'tes.ver')) return [];
    const h = hoy();
    const [c] = await db
      .select({ p: sql<string>`coalesce(sum(${tesVencimientos.importe} - ${tesVencimientos.importePagado}), 0)`, v: sql<string>`coalesce(sum(${tesVencimientos.importe} - ${tesVencimientos.importePagado}) FILTER (WHERE ${tesVencimientos.fecha} < ${h}), 0)` })
      .from(tesVencimientos)
      .where(and(eq(tesVencimientos.empresaId, ctx.empresaId), eq(tesVencimientos.circuito, 'cobro'), inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'remesado', 'devuelto', 'impagado'])));
    const proximos = await db
      .select({ v: tesVencimientos, tercero: terceros.nombre })
      .from(tesVencimientos)
      .leftJoin(terceros, eq(terceros.id, tesVencimientos.terceroId))
      .where(and(eq(tesVencimientos.empresaId, ctx.empresaId), eq(tesVencimientos.circuito, 'pago'), inArray(tesVencimientos.estado, ['pendiente', 'parcial', 'remesado']), lte(tesVencimientos.fecha, addDays(h, 7))))
      .orderBy(asc(tesVencimientos.fecha))
      .limit(6);
    return [
      {
        id: 'tes.pendiente_cobro',
        modulo: 'tes',
        titulo: 'Pendiente de cobro',
        size: 'sm',
        data: { kind: 'stat', value: round(Number(c?.p ?? 0)), format: 'money', hint: Number(c?.v ?? 0) > 0 ? `${fmtMoney(Number(c?.v))} vencido` : 'Nada vencido', enlace: '/tesoreria/vencimientos' },
      },
      {
        id: 'tes.pagos_semana',
        modulo: 'tes',
        titulo: 'Pagos de los próximos 7 días',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'No hay pagos previstos esta semana',
          enlace: '/tesoreria/vencimientos?tab=pago',
          items: proximos.map((p) => ({ titulo: p.tercero ?? p.v.concepto ?? 'Pago', subtitulo: `${p.v.fecha < h ? 'Vencido el' : 'Vence el'} ${p.v.fecha.split('-').reverse().join('/')}`, valor: fmtMoney(pendienteDe(p.v)), tone: p.v.fecha < h ? 'red' : 'gray', enlace: '/tesoreria/vencimientos?tab=pago' })),
        },
      },
    ];
  },

  timeline: async (_db, ctx, entidad, id) => {
    if (entidad !== 'tercero' || !can(ctx, 'tes.ver')) return [];
    const vs = await db.select().from(tesVencimientos).where(and(eq(tesVencimientos.empresaId, ctx.empresaId), eq(tesVencimientos.terceroId, id))).orderBy(desc(tesVencimientos.fecha)).limit(40);
    const ps = vs.length
      ? await db.select().from(tesPagos).where(inArray(tesPagos.vencimientoId, vs.map((v) => v.id))).orderBy(desc(tesPagos.fecha)).limit(40)
      : [];
    const enlace = `/terceros/${id}?tab=tes-cobros`;
    return [
      ...vs
        .filter((v) => v.estado !== 'pagado')
        .map((v) => {
          const e = optionLabel(tesShared.VENC_ESTADOS, v.estado);
          return { id: `tv-${v.id}`, modulo: 'tes', tipo: 'vencimiento', icono: 'CalendarDays', titulo: `${v.circuito === 'cobro' ? 'Cobro' : 'Pago'} pendiente · ${fmtMoney(pendienteDe(v))}`, detalle: [v.concepto, e?.label].filter(Boolean).join(' · '), fecha: `${v.fecha}T09:00:00.000Z`, enlace, tone: e?.tone };
        }),
      ...ps.map((p) => {
        const v = vs.find((x) => x.id === p.vencimientoId)!;
        const neg = p.importe < 0 !== v.importe < 0;
        return { id: `tp-${p.id}`, modulo: 'tes', tipo: 'pago', icono: 'Landmark', titulo: `${neg ? 'Devolución' : v.circuito === 'cobro' ? 'Cobro' : 'Pago'} de ${fmtMoney(Math.abs(p.importe))}`, detalle: v.concepto, fecha: p.creadoEn.toISOString(), enlace, tone: neg ? 'red' : 'green' };
      }),
    ];
  },

  search: async (_db, ctx, q) => {
    if (!can(ctx, 'tes.ver')) return [];
    const rows = await db.select().from(tesRemesas).where(and(eq(tesRemesas.empresaId, ctx.empresaId), ilike(tesRemesas.codigo, `%${q.replace(/[%_]/g, '')}%`))).limit(5);
    return rows.map((r) => ({ id: r.id, modulo: 'tes', tipo: r.tipo === 'cobro' ? 'Remesa de recibos' : 'Remesa de transferencias', titulo: r.codigo, subtitulo: `${fmtMoney(r.total)} · ${r.numOperaciones} operaciones`, enlace: `/tesoreria/remesas?id=${r.id}`, icono: 'Landmark' }));
  },

  seed,
});

