// Tablas del módulo NOM (prefijo nom_)
import { index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, money, pk, ts } from '../../db/helpers';
import { archivos, empresas, personas } from '../../db/schema/core';
import type { nomShared } from '@kite/shared';

export const nomPeriodos = pgTable(
  'nom_periodos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    anio: integer().notNull(),
    mes: integer().notNull(),
    estado: text().notNull().default('abierto'),
    totales: jsonb().$type<nomShared.TotalesNomina>(),
    notas: text(),
    cerradoPor: uuid(),
    cerradoEn: ts(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex('nom_periodos_uq').on(t.empresaId, t.anio, t.mes)],
);

/** Variables del mes que se envían a la gestoría (horas extra, dietas, comisiones, anticipos, embargos…). */
export const nomVariables = pgTable(
  'nom_variables',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    periodoId: uuid()
      .notNull()
      .references(() => nomPeriodos.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    concepto: text().notNull(),
    descripcion: text(),
    cantidad: numeric({ precision: 10, scale: 2, mode: 'number' }),
    importe: money().notNull(),
    origen: text().notNull().default('manual'),
    /** Id del registro de origen (gasto, anticipo) para no duplicar. */
    origenId: uuid(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.periodoId, t.personaId), uniqueIndex('nom_variables_origen_uq').on(t.origen, t.origenId)],
);

/** Recibos de nómina y certificados repartidos a cada persona. */
export const nomRecibos = pgTable(
  'nom_recibos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    periodoId: uuid().references(() => nomPeriodos.id),
    personaId: uuid().references(() => personas.id),
    tipo: text().notNull().default('nomina'),
    titulo: text().notNull(),
    anio: integer().notNull(),
    mes: integer(),
    archivoId: uuid()
      .notNull()
      .references(() => archivos.id),
    /** Archivo del que se extrajo (PDF combinado) y páginas. */
    origenArchivoId: uuid(),
    paginas: text(),
    dniDetectado: text(),
    bruto: money(),
    neto: money(),
    publicadoPor: uuid(),
    publicadoEn: createdAt(),
    leidoEn: ts(),
  },
  (t) => [index().on(t.personaId, t.anio), index().on(t.periodoId)],
);

export const nomAnticipos = pgTable(
  'nom_anticipos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    importe: money().notNull(),
    motivo: text(),
    fechaDeseada: day(),
    estado: text().notNull().default('pendiente'),
    periodoId: uuid(),
    revisadoPor: uuid(),
    revisadoEn: ts(),
    motivoRechazo: text(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.estado), index().on(t.personaId)],
);
