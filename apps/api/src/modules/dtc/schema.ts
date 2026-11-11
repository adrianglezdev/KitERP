// Tablas del módulo DTC (prefijo dtc_)
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, pk, ts, updatedAt } from '../../db/helpers';
import { archivos, departamentos, empresas, personas } from '../../db/schema/core';

/** Documento técnico controlado (manual, plano, procedimiento…). Sus archivos están en dtc_versiones. */
export const dtcDocumentos = pgTable(
  'dtc_documentos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    titulo: text().notNull(),
    tipo: text().notNull().default('manual'),
    estado: text().notNull().default('borrador'),
    confidencialidad: text().notNull().default('interno'),
    descripcion: text(),
    departamentoId: uuid().references(() => departamentos.id),
    responsableId: uuid().references(() => personas.id),
    revisorId: uuid().references(() => personas.id),
    /** Versión aprobada en vigor (solo una). */
    versionVigenteId: uuid(),
    versionVigente: text(),
    revisionMeses: integer().notNull().default(12),
    proximaRevision: day(),
    avisoRevisionEn: day(),
    etiquetas: text().array().notNull().default(sql`'{}'::text[]`),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.codigo),
    index().on(t.empresaId, t.estado),
    index().on(t.empresaId, t.proximaRevision),
    index('dtc_documentos_busqueda_trgm').using('gin', sql`(coalesce(${t.codigo},'') || ' ' || coalesce(${t.titulo},'')) gin_trgm_ops`),
  ],
);

export const dtcVersiones = pgTable(
  'dtc_versiones',
  {
    id: pk(),
    documentoId: uuid()
      .notNull()
      .references(() => dtcDocumentos.id, { onDelete: 'cascade' }),
    numero: text().notNull(),
    archivoId: uuid()
      .notNull()
      .references(() => archivos.id),
    resumenCambios: text(),
    estado: text().notNull().default('borrador'), // borrador | en_revision | aprobada | rechazada | obsoleta
    autorId: uuid().references(() => personas.id),
    autorUsuarioId: uuid(),
    enviadoEn: ts(),
    aprobadoPor: uuid().references(() => personas.id),
    aprobadoEn: ts(),
    rechazoMotivo: text(),
    obsoletaEn: ts(),
    creadoEn: createdAt(),
  },
  (t) => [
    index().on(t.documentoId, t.creadoEn),
    uniqueIndex().on(t.documentoId, t.numero),
    // Solo una versión vigente por documento
    uniqueIndex('dtc_versiones_vigente_uq').on(t.documentoId).where(sql`estado = 'aprobada'`),
  ],
);

/** Vínculos con artículos, equipos instalados (SAT), activos (ACT), proyectos (PRY) y terceros. */
export const dtcVinculos = pgTable(
  'dtc_vinculos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    documentoId: uuid()
      .notNull()
      .references(() => dtcDocumentos.id, { onDelete: 'cascade' }),
    entidad: text().notNull(),
    entidadId: uuid().notNull(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.documentoId, t.entidad, t.entidadId), index().on(t.entidad, t.entidadId)],
);

/** Departamentos que deben leer el documento. */
export const dtcDistribucion = pgTable(
  'dtc_distribucion',
  {
    documentoId: uuid()
      .notNull()
      .references(() => dtcDocumentos.id, { onDelete: 'cascade' }),
    departamentoId: uuid()
      .notNull()
      .references(() => departamentos.id),
  },
  (t) => [primaryKey({ columns: [t.documentoId, t.departamentoId] })],
);

/** Acuse de lectura de una versión por una persona. */
export const dtcLecturas = pgTable(
  'dtc_lecturas',
  {
    id: pk(),
    documentoId: uuid()
      .notNull()
      .references(() => dtcDocumentos.id, { onDelete: 'cascade' }),
    versionId: uuid()
      .notNull()
      .references(() => dtcVersiones.id, { onDelete: 'cascade' }),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    leidoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.versionId, t.personaId), index().on(t.personaId)],
);
