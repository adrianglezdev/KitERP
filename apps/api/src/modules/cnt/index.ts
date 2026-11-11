import { and, eq, ilike, inArray, like, or, sql } from 'drizzle-orm';
import { fmtMoney } from '@kite/shared';
import { db } from '../../db/client';
import { defineModule } from '../../core/modules';
import { can } from '../../core/permissions';
import { cntApuntes, cntAsientos, cntCentrosCoste, cntCuentas } from './schema';
import { asientoAmortizacion, asientoCobroPago, asientoFacturaCompra, asientoFacturaVenta, asientoGasto, asientoNomina } from './automaticos';
import { pyg } from './libros';
import { cntRoutes } from './routes';
import { crearAsiento, ensureEjercicio, ensurePlan, renumerar } from './service';
import { systemCtx } from '../../core/context';
import { MODULE_CODES } from '@kite/shared';

export default defineModule({
  code: 'cnt',
  routes: cntRoutes,

  events: {
    'ventas.factura_emitida': (tx, ctx, p) => asientoFacturaVenta(tx, ctx, p),
    'compras.factura_registrada': (tx, ctx, p) => asientoFacturaCompra(tx, ctx, p),
    'tes.cobro_registrado': (tx, ctx, p) => asientoCobroPago(tx, ctx, 'cobro', p),
    'tes.pago_registrado': (tx, ctx, p) => asientoCobroPago(tx, ctx, 'pago', p),
    'nom.periodo_cerrado': (tx, ctx, p) => asientoNomina(tx, ctx, p),
    'gas.gasto_liquidado': (tx, ctx, p) => asientoGasto(tx, ctx, p),
    'act.amortizacion': (tx, ctx, p) => asientoAmortizacion(tx, ctx, p),
  },

  refTargets: {
    cnt_cuentas: {
      table: cntCuentas,
      id: cntCuentas.id,
      label: sql<string>`${cntCuentas.codigo} || ' · ' || ${cntCuentas.nombre}`,
      sub: sql<string | null>`null`,
      search: [cntCuentas.codigo, cntCuentas.nombre],
      empresaCol: cntCuentas.empresaId,
      archivedCol: cntCuentas.archivadoEn,
      perm: 'cnt.ver',
      where: (_ctx, f) => and(f.todas ? undefined : eq(cntCuentas.subcuenta, true), f.grupo ? eq(cntCuentas.grupo, f.grupo) : undefined),
      order: cntCuentas.codigo,
    },
    centros_coste: {
      table: cntCentrosCoste,
      id: cntCentrosCoste.id,
      label: sql<string>`${cntCentrosCoste.codigo} || ' · ' || ${cntCentrosCoste.nombre}`,
      search: [cntCentrosCoste.codigo, cntCentrosCoste.nombre],
      empresaCol: cntCentrosCoste.empresaId,
      archivedCol: cntCentrosCoste.archivadoEn,
      perm: 'cnt.ver',
      where: () => eq(cntCentrosCoste.activo, true),
      order: cntCentrosCoste.codigo,
    },
  },

  entities: {
    asiento: {
      label: 'Asiento contable',
      module: 'cnt',
      canView: async (ctx, id) => {
        if (!can(ctx, 'cnt.ver')) return false;
        const [a] = await db.select({ e: cntAsientos.empresaId }).from(cntAsientos).where(eq(cntAsientos.id, id));
        return a?.e === ctx.empresaId;
      },
      canEdit: async (ctx, id) => {
        if (!can(ctx, 'cnt.gestionar')) return false;
        const [a] = await db.select({ e: cntAsientos.empresaId }).from(cntAsientos).where(eq(cntAsientos.id, id));
        return a?.e === ctx.empresaId;
      },
      title: async (id) => {
        const [a] = await db.select({ n: cntAsientos.numero, f: cntAsientos.fecha }).from(cntAsientos).where(eq(cntAsientos.id, id));
        return a ? `Asiento ${a.n} (${a.f.slice(0, 4)})` : null;
      },
      url: (id) => `/contabilidad/asientos/${id}`,
    },
  },

  dashboard: async (_db, ctx) => {
    if (!can(ctx, 'cnt.ver')) return [];
    const anio = new Date().getFullYear();
    const r = await pyg(ctx.empresaId, `${anio}-01-01`, `${anio}-12-31`);
    const cifra = r.lineas.find((l) => l.id === '1')?.importe ?? 0;
    return [
      {
        id: 'cnt.resultado',
        modulo: 'cnt',
        titulo: `Resultado del ejercicio ${anio}`,
        size: 'sm',
        data: { kind: 'stat', value: r.resultado, format: 'money', hint: `Cifra de negocios ${fmtMoney(cifra)}`, enlace: '/contabilidad/pyg' },
      },
    ];
  },

  search: async (_db, ctx, q) => {
    if (!can(ctx, 'cnt.ver')) return [];
    const t = q.replace(/[%_]/g, '');
    const rows = await db
      .select({ id: cntCuentas.id, codigo: cntCuentas.codigo, nombre: cntCuentas.nombre })
      .from(cntCuentas)
      .where(and(eq(cntCuentas.empresaId, ctx.empresaId), eq(cntCuentas.subcuenta, true), or(like(cntCuentas.codigo, `${t}%`), ilike(cntCuentas.nombre, `%${t}%`))))
      .orderBy(cntCuentas.codigo)
      .limit(5);
    return rows.map((r) => ({ id: r.id, modulo: 'cnt', tipo: 'Cuenta contable', titulo: `${r.codigo} · ${r.nombre}`, subtitulo: 'Ver libro mayor', enlace: `/contabilidad/mayor?cuenta=${r.codigo}`, icono: 'BookOpen' }));
  },

  /**
   * Datos de ejemplo: plan de cuentas, centros de coste, asiento de apertura con los saldos iniciales
   * y reparto analítico de los asientos que ya han generado las facturas de ejemplo.
   */
  seed: async (tx, s) => {
    const ctx = systemCtx(s.empresaId, MODULE_CODES);
    await ensurePlan(tx, s.empresaId);
    const centros = await tx
      .insert(cntCentrosCoste)
      .values([
        { empresaId: s.empresaId, codigo: 'INST', nombre: 'Instalaciones' },
        { empresaId: s.empresaId, codigo: 'SAT', nombre: 'Mantenimiento y servicio técnico' },
        { empresaId: s.empresaId, codigo: 'EST', nombre: 'Estructura y administración' },
      ])
      .returning();
    const cc = Object.fromEntries(centros.map((c) => [c.codigo, c.id]));
    const anio = new Date().getFullYear();
    await crearAsiento(tx, ctx, {
      fecha: `${anio}-01-01`,
      concepto: `Asiento de apertura ${anio}`,
      origen: 'apertura',
      refClave: `inicial-${anio}`,
      lineas: [
        { cuenta: '2170000', debe: 18000, concepto: 'Equipos informáticos' },
        { cuenta: '2180000', debe: 32000, concepto: 'Furgonetas de servicio' },
        { cuenta: '5720001', nombreCuenta: 'CaixaBank cuenta principal', debe: 45000 },
        { cuenta: '5700001', nombreCuenta: 'Caja oficina', debe: 600 },
        { cuenta: '1000000', haber: 60000 },
        { cuenta: '1120000', haber: 6000 },
        { cuenta: '1700000', haber: 29600, concepto: 'Préstamo furgonetas' },
      ],
    });
    // reparto analítico de ventas y gastos ya contabilizados
    const apuntes = await tx
      .select({ id: cntApuntes.id, cuenta: cntApuntes.cuenta })
      .from(cntApuntes)
      .where(and(eq(cntApuntes.empresaId, s.empresaId), sql`left(${cntApuntes.cuenta}, 1) IN ('6','7')`));
    const asignar = (cuenta: string) => (cuenta.startsWith('705') ? cc.SAT : cuenta.startsWith('700') || cuenta.startsWith('600') ? cc.INST : cc.EST);
    for (const grupo of ['INST', 'SAT', 'EST']) {
      const ids = apuntes.filter((a) => asignar(a.cuenta) === cc[grupo]).map((a) => a.id);
      if (ids.length) await tx.update(cntApuntes).set({ centroCosteId: cc[grupo] }).where(inArray(cntApuntes.id, ids));
    }
    const ej = await ensureEjercicio(tx, s.empresaId, anio);
    await renumerar(tx, ctx, ej.id);
  },
});
