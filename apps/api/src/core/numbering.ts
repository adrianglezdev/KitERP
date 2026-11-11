import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { series } from '../db/schema';
import { badRequest } from './errors';

const DEFAULT_CODES: Record<string, { codigo: string; nombre: string }> = {
  presupuesto: { codigo: 'P', nombre: 'Presupuestos' },
  pedido: { codigo: 'PV', nombre: 'Pedidos de venta' },
  albaran: { codigo: 'A', nombre: 'Albaranes' },
  factura: { codigo: 'F', nombre: 'Facturas' },
  factura_rectificativa: { codigo: 'R', nombre: 'Facturas rectificativas' },
  factura_simplificada: { codigo: 'T', nombre: 'Facturas simplificadas' },
  proforma: { codigo: 'PF', nombre: 'Proformas' },
  pedido_compra: { codigo: 'PC', nombre: 'Pedidos a proveedor' },
  recepcion: { codigo: 'RC', nombre: 'Recepciones' },
  factura_proveedor: { codigo: 'FP', nombre: 'Facturas de proveedor' },
};

/**
 * Asigna el siguiente número de una serie de forma correlativa y sin huecos.
 * Bloquea la fila de la serie (FOR UPDATE) hasta que termina la transacción,
 * así dos usuarios nunca obtienen el mismo número ni se salta ninguno.
 * Si no existe serie para el año, se crea.
 */
export async function nextNumber(
  tx: Tx,
  empresaId: string,
  tipo: string,
  fecha: string,
  opts: { serieId?: string | null; codigo?: string; nombre?: string; digitos?: number } = {},
): Promise<{ serieId: string; numero: number; codigo: string }> {
  const anio = Number(fecha.slice(0, 4));
  let serie: typeof series.$inferSelect | undefined;

  if (opts.serieId) {
    [serie] = await tx.select().from(series).where(eq(series.id, opts.serieId)).for('update');
    if (!serie) throw badRequest('La serie no existe');
    if (serie.anio !== anio) {
      // misma serie, nuevo año
      const found = await findOrCreate(tx, empresaId, tipo, serie.codigo, serie.nombre, anio, serie.digitos);
      serie = found;
    }
  } else {
    const def = DEFAULT_CODES[tipo] ?? { codigo: opts.codigo ?? tipo.slice(0, 3).toUpperCase(), nombre: opts.nombre ?? tipo };
    const [byDefault] = await tx
      .select()
      .from(series)
      .where(and(eq(series.empresaId, empresaId), eq(series.tipo, tipo), eq(series.anio, anio), eq(series.porDefecto, true), eq(series.activo, true)))
      .limit(1)
      .for('update');
    serie = byDefault ?? (await findOrCreate(tx, empresaId, tipo, opts.codigo ?? def.codigo, opts.nombre ?? def.nombre, anio, opts.digitos ?? 5));
  }

  const numero = serie.siguiente;
  await tx.update(series).set({ siguiente: numero + 1 }).where(eq(series.id, serie.id));
  const codigo = `${serie.codigo}${String(anio).slice(2)}-${String(numero).padStart(serie.digitos, '0')}`;
  return { serieId: serie.id, numero, codigo };
}

async function findOrCreate(tx: Tx, empresaId: string, tipo: string, codigo: string, nombre: string, anio: number, digitos: number) {
  await tx
    .insert(series)
    .values({ empresaId, tipo, codigo, nombre, anio, digitos, siguiente: 1, porDefecto: true })
    .onConflictDoNothing();
  const [s] = await tx
    .select()
    .from(series)
    .where(and(eq(series.empresaId, empresaId), eq(series.tipo, tipo), eq(series.codigo, codigo), eq(series.anio, anio)))
    .for('update');
  return s!;
}

/** Código legible sin numeración legal (p. ej. tickets o proyectos): secuencia por empresa y año. */
export async function nextCode(tx: Tx, empresaId: string, tipo: string, prefijo: string, fecha = new Date().toISOString().slice(0, 10)) {
  return (await nextNumber(tx, empresaId, tipo, fecha, { codigo: prefijo, nombre: prefijo, digitos: 5 })).codigo;
}

export const _sql = sql; // evita aviso de import sin usar en algunos bundlers
