import { eq, inArray } from 'drizzle-orm';
import type { ModuleDef } from '../../core/modules';
import { documentoLineas, documentos } from '../../db/schema/documentos';
import { consumirReservas, expandir, liberar, marcarSeriesSalida, r4, registrarLoteYSeries, registrarMovimientos, reservar, resolverAlmacen, type MovInput } from './service';

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Reacciones de STK a los documentos comerciales y a los proyectos.
 * Se ejecutan dentro de la transacción del documento: si algo falla no se confirma ni el documento ni el stock.
 */
export const stkEvents: ModuleDef['events'] = {
  'ventas.pedido_confirmado': async (tx, ctx, p) => {
    await reservar(tx, ctx, p.documentoId, p.lineas);
  },

  'ventas.pedido_liberado': async (tx, _ctx, p) => {
    await liberar(tx, p.documentoId);
  },

  'ventas.albaran_entregado': async (tx, ctx, p) => {
    const exp = await expandir(tx, p.lineas);
    if (!exp.length) return;
    const lineaIds = [...new Set(exp.map((l) => l.lineaId).filter(Boolean) as string[])];
    const origen = lineaIds.length ? await tx.select({ id: documentoLineas.id, origen: documentoLineas.lineaOrigenId }).from(documentoLineas).where(inArray(documentoLineas.id, lineaIds)) : [];
    const origenDe = new Map(origen.map((o) => [o.id, o.origen]));
    const tipoSalida = p.origenTipo === 'sat_orden' ? 'consumo_sat' : 'salida_venta';
    const cache = new Map<string, string>();
    const movs: MovInput[] = [];
    for (const l of exp) {
      const almacenId = await resolverAlmacen(tx, ctx.empresaId, l.almacenId, cache);
      movs.push({
        tipo: l.cantidad < 0 ? 'devolucion' : tipoSalida,
        articuloId: l.articuloId,
        almacenId,
        cantidad: -l.cantidad,
        lote: l.lote,
        documentoId: p.documentoId,
        lineaId: l.lineaId,
        origenTipo: 'documento',
        origenId: p.documentoId,
        series: l.series,
      });
      if (l.cantidad > 0) await marcarSeriesSalida(tx, l.articuloId, l.series, { terceroId: p.terceroId, documentoId: p.documentoId, fecha: hoy(), estado: 'vendido' });
    }
    await registrarMovimientos(tx, ctx, movs);
    await consumirReservas(
      tx,
      exp.filter((l) => l.lineaId && origenDe.get(l.lineaId) && l.cantidad > 0).map((l) => ({ lineaId: origenDe.get(l.lineaId!)!, articuloId: l.articuloId, cantidad: l.cantidad })),
    );
  },

  'compras.recepcion_confirmada': async (tx, ctx, p) => {
    const exp = await expandir(tx, p.lineas);
    if (!exp.length) return;
    // coste unitario real de compra: importe de la línea (con su descuento y el global) / cantidad
    const [doc] = await tx.select({ descuentoGlobal: documentos.descuentoGlobal, fecha: documentos.fecha }).from(documentos).where(eq(documentos.id, p.documentoId));
    const lineaIds = [...new Set(exp.map((l) => l.lineaId).filter(Boolean) as string[])];
    const ls = lineaIds.length ? await tx.select().from(documentoLineas).where(inArray(documentoLineas.id, lineaIds)) : [];
    const lineaDe = new Map(ls.map((l) => [l.id, l]));
    const factorGlobal = 1 - (doc?.descuentoGlobal ?? 0) / 100;
    const cache = new Map<string, string>();
    const movs: MovInput[] = [];
    for (const l of exp) {
      const almacenId = await resolverAlmacen(tx, ctx.empresaId, l.almacenId, cache);
      const dl = l.lineaId ? lineaDe.get(l.lineaId) : undefined;
      let coste: number | null = null;
      if (!l.kitId && dl && dl.cantidad) coste = r4((dl.subtotal / dl.cantidad) * factorGlobal);
      else if (!l.kitId && l.coste) coste = l.coste;
      movs.push({
        tipo: l.cantidad < 0 ? 'devolucion' : 'entrada_compra',
        articuloId: l.articuloId,
        almacenId,
        cantidad: l.cantidad,
        costeUnitario: coste && coste > 0 ? coste : null,
        lote: l.lote,
        documentoId: p.documentoId,
        lineaId: l.lineaId,
        origenTipo: 'documento',
        origenId: p.documentoId,
        series: l.series,
      });
      if (l.cantidad > 0) await registrarLoteYSeries(tx, ctx, { ...l, almacenId }, { proveedorId: p.terceroId, documentoId: p.documentoId, fecha: doc?.fecha ?? hoy() });
    }
    await registrarMovimientos(tx, ctx, movs);
  },

  'pry.material_consumido': async (tx, ctx, p) => {
    const exp = await expandir(tx, p.lineas);
    if (!exp.length) return;
    const cache = new Map<string, string>();
    const movs: MovInput[] = [];
    for (const l of exp) {
      const almacenId = await resolverAlmacen(tx, ctx.empresaId, l.almacenId, cache);
      movs.push({
        tipo: l.cantidad < 0 ? 'devolucion' : 'consumo_proyecto',
        articuloId: l.articuloId,
        almacenId,
        cantidad: -l.cantidad,
        lote: l.lote,
        lineaId: l.lineaId,
        origenTipo: 'pry_proyecto',
        origenId: p.proyectoId,
        series: l.series,
      });
      if (l.cantidad > 0) await marcarSeriesSalida(tx, l.articuloId, l.series, { fecha: hoy(), estado: 'instalado' });
    }
    await registrarMovimientos(tx, ctx, movs);
  },
};
