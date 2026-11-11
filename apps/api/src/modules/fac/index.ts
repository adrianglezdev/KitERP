import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { DOC_FACTURAS, MODULE_CODES, fmtMoney } from '@kite/shared';
import { db } from '../../db/client';
import { documentos, documentosRecurrentes } from '../../db/schema/documentos';
import { systemCtx } from '../../core/context';
import { defineModule } from '../../core/modules';
import { can, scopeCondition } from '../../core/permissions';
import { generarRecurrentes } from '../../routes/documentos';
import { crearDocumento, ejecutarAccion } from '../../services/documentos';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default defineModule({
  code: 'fac',

  dashboard: async (_db, ctx) => {
    const s = ctx.perms.get('fac.ver');
    if (!s) return [];
    const scope = await scopeCondition(ctx, s, documentos.comercialId);
    const base = and(eq(documentos.empresaId, ctx.empresaId), inArray(documentos.tipo, DOC_FACTURAS), eq(documentos.bloqueado, true), isNull(documentos.archivadoEn), scope);
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const mesIso = inicioMes.toISOString().slice(0, 10);
    const ant = new Date(inicioMes);
    ant.setMonth(ant.getMonth() - 1);
    const [r] = await db
      .select({
        mes: sql<number>`coalesce(sum(${documentos.baseImponible}) FILTER (WHERE ${documentos.fecha} >= ${mesIso}), 0)::float`,
        anterior: sql<number>`coalesce(sum(${documentos.baseImponible}) FILTER (WHERE ${documentos.fecha} >= ${ant.toISOString().slice(0, 10)} AND ${documentos.fecha} < ${mesIso}), 0)::float`,
      })
      .from(documentos)
      .where(base);
    const hace12 = new Date();
    hace12.setMonth(hace12.getMonth() - 11, 1);
    const porMes = await db
      .select({ mes: sql<string>`to_char(${documentos.fecha}, 'YYYY-MM')`, total: sql<number>`sum(${documentos.baseImponible})::float` })
      .from(documentos)
      .where(and(base, gte(documentos.fecha, hace12.toISOString().slice(0, 10))))
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    const serie = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(hace12);
      d.setMonth(hace12.getMonth() + i);
      const k = d.toISOString().slice(0, 7);
      return { mes: `${MESES[d.getMonth()]}`, facturado: porMes.find((p) => p.mes === k)?.total ?? 0 };
    });
    const out = [
      { id: 'fac.mes', modulo: 'fac', titulo: 'Facturado este mes (base)', size: 'sm' as const, data: { kind: 'stat' as const, value: r?.mes ?? 0, format: 'money' as const, delta: r?.anterior ? Math.round(((r.mes - r.anterior) / r.anterior) * 1000) / 10 : null, hint: 'respecto al mes anterior completo', enlace: '/facturas' } },
      { id: 'fac.evolucion', modulo: 'fac', titulo: 'Facturación de los últimos 12 meses', size: 'lg' as const, data: { kind: 'chart' as const, chart: 'bar' as const, data: serie, xKey: 'mes', series: [{ key: 'facturado', label: 'Base facturada', color: '#7D2CDD' }], format: 'money' as const } },
    ];
    if (can(ctx, 'fac.editar')) {
      const [p] = await db
        .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${documentos.baseImponible}),0)::float` })
        .from(documentos)
        .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'albaran'), eq(documentos.estado, 'entregado'), isNull(documentos.archivadoEn)));
      if (p?.n) out.push({ id: 'fac.pendiente', modulo: 'fac', titulo: 'Pendiente de facturar', size: 'sm' as const, data: { kind: 'stat' as const, value: p.total, format: 'money' as const, delta: null, hint: `${p.n} albaranes entregados`, enlace: '/facturas/pendientes' } } as never);
    }
    return out;
  },

  jobs: [{ id: 'fac.recurrentes', dailyAt: '07:00', run: async (empresaId) => `${await generarRecurrentes(empresaId)} facturas recurrentes` }],

  seed: async (tx, s) => {
    const ctx = systemCtx(s.empresaId, MODULE_CODES);
    const A = s.articulos;
    const l = (ref: string, cantidad: number, precio: number, coste: number, descripcion: string) => ({ tipoLinea: 'articulo' as const, articuloId: A[ref] ?? null, referencia: ref, descripcion, cantidad, precio, descuento: 0, ivaTipo: 21, retencion: 0, coste });
    const clientes = ['hotel', 'clinica', 'colegio', 'super', 'oficinas', 'restaurante', 'ayto'];
    const plantillas = [
      { titulo: 'Mantenimiento preventivo trimestral', lineas: [l('SRV-MANT-ANUAL', 6, 75, 35, 'Mantenimiento preventivo por equipo'), l('FIL-AC-STD', 6, 18, 6.5, 'Filtros')] },
      { titulo: 'Reparación de avería', lineas: [l('SRV-HORA', 3, 42, 24, 'Horas de técnico'), l('SRV-DESPL', 1, 25, 8, 'Desplazamiento'), l('BOMBA-COND', 1, 89, 41, 'Bomba de condensados')] },
      { titulo: 'Instalación de equipo', lineas: [l('AC-SPLIT-35', 1, 890, 520, 'Split 3,5 kW'), l('SRV-INST-SPLIT', 1, 280, 150, 'Instalación')] },
      { titulo: 'Recarga de gas', lineas: [l('GAS-R32-3', 1, 145, 82, 'Gas R32'), l('SRV-HORA', 2, 42, 24, 'Horas de técnico')] },
      { titulo: 'Renovación de iluminación', lineas: [l('LED-PAN-60', 12, 39, 14.2, 'Panel LED 60x60'), l('SRV-HORA', 6, 42, 24, 'Horas de montaje')] },
    ];
    // Facturas emitidas de los últimos 6 meses, en orden cronológico (numeración correlativa por fecha)
    const hoy = new Date();
    const fechas: string[] = [];
    for (let m = 5; m >= 0; m--) {
      const n = m === 0 ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - m, 3 + i * 6, 12);
        if (d > hoy) continue;
        fechas.push(d.toISOString().slice(0, 10));
      }
    }
    fechas.sort();
    let k = 0;
    for (const fecha of fechas) {
      const p = plantillas[k % plantillas.length]!;
      const t = clientes[k % clientes.length]!;
      const d = await crearDocumento(tx, ctx, { tipo: 'factura', fecha, terceroId: s.terceros[t]!, titulo: p.titulo, descuentoGlobal: 0, lineas: p.lineas }, { sinPermisos: true });
      await ejecutarAccion(tx, ctx, d.id, 'emitir');
      k++;
    }
    // Una factura en borrador y una proforma
    await crearDocumento(tx, ctx, { tipo: 'factura', fecha: hoy.toISOString().slice(0, 10), terceroId: s.terceros.oficinas!, titulo: 'Revisión de instalación eléctrica', descuentoGlobal: 0, lineas: [l('SRV-HORA', 4, 42, 24, 'Horas de técnico'), l('DIF-40A', 2, 48, 21, 'Diferencial 2P 40 A')] }, { sinPermisos: true });
    // Cuota mensual recurrente de mantenimiento
    const prox = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1, 12).toISOString().slice(0, 10);
    await tx.insert(documentosRecurrentes).values({
      empresaId: s.empresaId,
      nombre: 'Cuota mensual de mantenimiento',
      terceroId: s.terceros.super!,
      periodicidad: 'mensual',
      proximaFecha: prox,
      lineas: [{ articuloId: A['SRV-MANT-ANUAL'] ?? null, descripcion: 'Cuota mensual de mantenimiento preventivo (3 tiendas)', cantidad: 1, precio: 390, descuento: 0, ivaTipo: 21, retencion: 0 }],
      emitirAutomaticamente: false,
    });
    void lt;
    void fmtMoney;
  },
});
