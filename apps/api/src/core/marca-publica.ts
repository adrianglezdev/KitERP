import { eq } from 'drizzle-orm';
import { normalizarApariencia, type Apariencia } from '@kite/shared';
import { db } from '../db/client';
import { empresas } from '../db/schema';
import { fileUrl } from './files';

export interface MarcaPublica {
  nombre: string | null;
  logoUrl: string | null;
  apariencia: Apariencia;
}

/**
 * Marca de una empresa tal como puede verla cualquiera: nombre, logo y apariencia.
 * La llevan las páginas públicas (portal del cliente, presupuestos, firmas, quiosco…) para
 * pintarse con los colores de la empresa que las envía. No incluye ningún dato interno.
 */
export async function marcaPublica(empresaId: string): Promise<MarcaPublica> {
  const [e] = await db.select({ nombre: empresas.nombre, logo: empresas.logoArchivoId, ajustes: empresas.ajustes }).from(empresas).where(eq(empresas.id, empresaId));
  return { nombre: e?.nombre ?? null, logoUrl: fileUrl(e?.logo, 86400), apariencia: normalizarApariencia(e?.ajustes?.apariencia) };
}
