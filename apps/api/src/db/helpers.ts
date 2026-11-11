import { boolean, date, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/**
 * Columnas comunes. Convenciones:
 *  - ids UUID v7 (ordenados en el tiempo → índices compactos aunque haya millones de filas)
 *  - importes numeric(14,2) y cantidades/precios unitarios numeric(14,4): nunca coma flotante en la base de datos
 *  - fechas con zona horaria
 *  - borrado lógico con archivado_en (los datos maestros no se borran)
 */
export const newId = () => uuidv7();
export const pk = () => uuid().primaryKey().$defaultFn(newId);
export const money = () => numeric({ precision: 14, scale: 2, mode: 'number' });
export const price = () => numeric({ precision: 14, scale: 4, mode: 'number' });
export const qty = () => numeric({ precision: 14, scale: 4, mode: 'number' });
export const pct = () => numeric({ precision: 6, scale: 2, mode: 'number' });
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());
export const archivedAt = () => timestamp({ withTimezone: true });
export const ts = () => timestamp({ withTimezone: true });
export const day = () => date({ mode: 'string' });
export const flag = (def = false) => boolean().notNull().default(def);
