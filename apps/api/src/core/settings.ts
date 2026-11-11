import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { empresas } from '../db/schema';

/** Ajustes de negocio con sus valores por defecto (se guardan en empresas.ajustes). */
export const AJUSTES_DEFECTO = {
  margenMinimoPresupuesto: 15,
  validezPresupuestoDias: 30,
  umbralAprobacionCompra: 1000,
  precioKm: 0.26,
  condicionesPresupuesto: 'Precios válidos durante el periodo indicado. IVA no incluido salvo indicación.',
  pieFactura: '',
  recordatoriosImpagoDias: [7, 15, 30],
  bloquearRiesgo: false,
  horasJornadaMax: 9,
  minutosCortesia: 10,
};

export type Ajustes = typeof AJUSTES_DEFECTO & Record<string, unknown>;

export async function getAjustes(empresaId: string): Promise<Ajustes> {
  const [e] = await db.select({ ajustes: empresas.ajustes }).from(empresas).where(eq(empresas.id, empresaId));
  return { ...AJUSTES_DEFECTO, ...(e?.ajustes ?? {}) } as Ajustes;
}

export async function getEmpresa(empresaId: string) {
  const [e] = await db.select().from(empresas).where(eq(empresas.id, empresaId));
  return e!;
}
