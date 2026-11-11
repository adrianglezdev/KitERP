import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { MODULE_CODES, fmtDate, fmtMoney } from '@kite/shared';
import { db } from '../../db/client';
import { documentos } from '../../db/schema/documentos';
import { terceros } from '../../db/schema/core';
import { systemCtx } from '../../core/context';
import { defineModule } from '../../core/modules';
import { can, scopeCondition } from '../../core/permissions';
import { convertir, crearDocumento, ejecutarAccion } from '../../services/documentos';

export default defineModule({
  code: 'ped',

  dashboard: async (_db, ctx) => {
    const s = ctx.perms.get('ped.ver');
    if (!s && !can(ctx, 'ped.preparar')) return [];
    const scope = s ? await scopeCondition(ctx, s, documentos.comercialId) : undefined;
    const rows = await db
      .select({ id: documentos.id, codigo: documentos.codigo, entrega: documentos.fechaEntrega, estado: documentos.estado, total: documentos.total, tercero: terceros.nombre })
      .from(documentos)
      .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
      .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'pedido'), inArray(documentos.estado, ['confirmado', 'en_preparacion', 'parcial']), isNull(documentos.archivadoEn), scope))
      .orderBy(sql`${documentos.fechaEntrega} NULLS LAST`)
      .limit(6);
    const [tot] = await db
      .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${documentos.baseImponible}),0)::float` })
      .from(documentos)
      .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'pedido'), inArray(documentos.estado, ['confirmado', 'en_preparacion', 'parcial']), isNull(documentos.archivadoEn), scope));
    const hoy = new Date().toISOString().slice(0, 10);
    return [
      { id: 'ped.cartera', modulo: 'ped', titulo: 'Cartera de pedidos', size: 'sm', data: { kind: 'stat', value: tot?.total ?? 0, format: 'money', hint: `${tot?.n ?? 0} pedidos pendientes de servir`, enlace: '/pedidos' } },
      {
        id: 'ped.servir',
        modulo: 'ped',
        titulo: 'Próximas entregas',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'No hay pedidos pendientes',
          enlace: '/pedidos/preparacion',
          items: rows.map((r) => ({ titulo: `${r.codigo} · ${r.tercero}`, subtitulo: fmtMoney(r.total), valor: r.entrega ? (r.entrega < hoy ? 'Retrasado' : fmtDate(r.entrega)) : 'Sin fecha', tone: r.entrega && r.entrega < hoy ? 'red' : 'gray', enlace: `/documentos/${r.id}` })),
        },
      },
    ];
  },

  seed: async (tx, s) => {
    const ctx = systemCtx(s.empresaId, MODULE_CODES);
    const dia = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    const A = s.articulos;
    const l = (ref: string, cantidad: number, precio: number, coste: number, descripcion: string) => ({ tipoLinea: 'articulo' as const, articuloId: A[ref] ?? null, referencia: ref, descripcion, cantidad, precio, descuento: 0, ivaTipo: 21, retencion: 0, coste });
    // Pedido del colegio a partir del presupuesto aceptado
    const [pre] = await tx.select().from(documentos).where(and(eq(documentos.empresaId, s.empresaId), eq(documentos.tipo, 'presupuesto'), eq(documentos.estado, 'aceptado'))).limit(1);
    if (pre) {
      const ped = await convertir(tx, ctx, pre.id, 'pedido');
      await tx.update(documentos).set({ fechaEntrega: dia(6) }).where(eq(documentos.id, ped.id));
      await ejecutarAccion(tx, ctx, ped.id, 'confirmar');
    }
    // Pedido del supermercado: entregado en parte, con un albarán pendiente de facturar
    const ped2 = await crearDocumento(tx, ctx, { tipo: 'pedido', fecha: dia(-8), fechaEntrega: dia(-2), terceroId: s.terceros.super!, titulo: 'Repuestos tiendas', descuentoGlobal: 0, referenciaExterna: 'PO-55821', lineas: [l('FIL-AC-STD', 24, 18, 6.5, 'Filtro estándar para split'), l('BOMBA-COND', 3, 89, 41, 'Bomba de condensados'), l('GAS-R32-3', 2, 145, 82, 'Gas refrigerante R32 (botella 3 kg)')] }, { sinPermisos: true });
    await ejecutarAccion(tx, ctx, ped2.id, 'confirmar');
    const alb = await convertir(tx, ctx, ped2.id, 'albaran');
    // se entrega todo menos el gas
    const { documentoLineas } = await import('../../db/schema/documentos');
    await tx.delete(documentoLineas).where(and(eq(documentoLineas.documentoId, alb.id), eq(documentoLineas.referencia, 'GAS-R32-3')));
    await ejecutarAccion(tx, ctx, alb.id, 'entregar', { receptor: 'Miguel García' });
    // Pedido urgente del hotel en preparación
    const ped3 = await crearDocumento(tx, ctx, { tipo: 'pedido', fecha: dia(-1), fechaEntrega: dia(1), terceroId: s.terceros.hotel!, titulo: 'Material de mantenimiento', descuentoGlobal: 0, lineas: [l('FIL-AC-STD', 12, 18, 6.5, 'Filtro estándar para split'), l('MAG-16A', 6, 14.5, 5.8, 'Magnetotérmico 2P 16 A')] }, { sinPermisos: true });
    await ejecutarAccion(tx, ctx, ped3.id, 'confirmar');
    await ejecutarAccion(tx, ctx, ped3.id, 'preparar');
    void asc;
  },
});
