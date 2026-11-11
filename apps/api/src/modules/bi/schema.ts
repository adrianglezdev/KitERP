// Tablas del módulo BI (prefijo bi_)
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, flag, pk, updatedAt } from '../../db/helpers';
import { empresas, usuarios } from '../../db/schema/core';

/** Informes guardados sobre el catálogo cerrado de conjuntos de datos (sin SQL libre). */
export const biInformes = pgTable(
  'bi_informes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    descripcion: text(),
    dataset: text().notNull(),
    filtros: jsonb().$type<{ periodo: string; desde?: string | null; hasta?: string | null; campos?: Record<string, string> }>().notNull(),
    columnas: text().array().notNull(),
    agruparPor: text(),
    orden: text(),
    compartido: flag(false),
    programacion: text().notNull().default('ninguna'), // ninguna | diaria | semanal | mensual
    destinatarios: text().array().notNull().default(sql`'{}'::text[]`),
    ultimoEnvio: day(),
    propietarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
  },
  (t) => [index().on(t.empresaId, t.propietarioId)],
);
