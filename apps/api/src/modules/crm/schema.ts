import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, pk, ts } from '../../db/helpers';
import { contactos, empresas, personas, terceros } from '../../db/schema/core';

/** Actividad comercial: llamadas, visitas, emails, reuniones y notas con su seguimiento. */
export const crmActividades = pgTable(
  'crm_actividades',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    tipo: text().notNull().default('llamada'),
    asunto: text().notNull(),
    descripcion: text(),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    contactoId: uuid().references(() => contactos.id),
    oportunidadId: uuid(),
    fecha: ts().notNull().defaultNow(),
    duracionMin: integer(),
    estado: text().notNull().default('realizada'),
    proximaAccion: text(),
    proximaFecha: day(),
    personaId: uuid().references(() => personas.id),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.terceroId, t.fecha),
    index().on(t.personaId, t.proximaFecha),
    index('crm_actividades_busqueda_trgm').using('gin', sql`(coalesce(${t.asunto},'') || ' ' || coalesce(${t.descripcion},'')) gin_trgm_ops`),
  ],
);
