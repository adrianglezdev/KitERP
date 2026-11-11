// Tablas del módulo ALT (prefijo alt_)
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, flag, money, pk, ts } from '../../db/helpers';
import { archivos, centros, departamentos, empresas, personas, tareas } from '../../db/schema/core';
import type { altShared } from '@kite/shared';

export const altOfertas = pgTable(
  'alt_ofertas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    titulo: text().notNull(),
    estado: text().notNull().default('abierta'),
    plazas: integer().notNull().default(1),
    departamentoId: uuid().references(() => departamentos.id),
    centroId: uuid().references(() => centros.id),
    responsableId: uuid().references(() => personas.id),
    tipoContrato: text(),
    jornadaHoras: numeric({ precision: 5, scale: 1, mode: 'number' }),
    salarioDesde: money(),
    salarioHasta: money(),
    fechaCierre: day(),
    descripcion: text(),
    requisitos: text(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId, t.estado)],
);

export const altCandidatos = pgTable(
  'alt_candidatos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    ofertaId: uuid()
      .notNull()
      .references(() => altOfertas.id),
    nombre: text().notNull(),
    apellidos: text(),
    email: text(),
    telefono: text(),
    localidad: text(),
    fuente: text(),
    estado: text().notNull().default('nuevo'),
    valoracion: integer(),
    pretension: money(),
    disponibilidad: text(),
    cvArchivoId: uuid().references(() => archivos.id),
    notas: text(),
    consentimiento: flag(false),
    personaId: uuid().references(() => personas.id),
    orden: integer().notNull().default(0),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.ofertaId, t.estado)],
);

/** Plantillas de incorporación y salida (listas de tareas). */
export const altPlantillas = pgTable('alt_plantillas', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  nombre: text().notNull(),
  tipo: text().notNull(), // alta | baja
  tareas: jsonb().$type<altShared.PlantillaTarea[]>().notNull().default([]),
  activo: flag(true),
  creadoEn: createdAt(),
});

export const altProcesos = pgTable(
  'alt_procesos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    tipo: text().notNull(),
    plantillaId: uuid().references(() => altPlantillas.id),
    fecha: day().notNull(),
    estado: text().notNull().default('en_curso'),
    motivo: text(),
    notas: text(),
    candidatoId: uuid(),
    /** Baja: el acceso se bloquea en la fecha indicada. */
    bloquearAcceso: flag(true),
    accesoBloqueadoEn: ts(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    completadoEn: ts(),
  },
  (t) => [index().on(t.empresaId, t.estado), index().on(t.personaId)],
);

/** Tareas del proceso: cada una crea una tarea del núcleo asignada a su responsable. */
export const altProcesoTareas = pgTable(
  'alt_proceso_tareas',
  {
    id: pk(),
    procesoId: uuid()
      .notNull()
      .references(() => altProcesos.id),
    tareaId: uuid().references(() => tareas.id),
    titulo: text().notNull(),
    orden: integer().notNull().default(0),
  },
  (t) => [index().on(t.procesoId)],
);

export const altEvaluaciones = pgTable(
  'alt_evaluaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    evaluadorId: uuid()
      .notNull()
      .references(() => personas.id),
    periodo: text().notNull(),
    fecha: day().notNull(),
    objetivos: jsonb().$type<altShared.ObjetivoEvaluacion[]>().notNull().default([]),
    puntuacion: numeric({ precision: 4, scale: 2, mode: 'number' }),
    fortalezas: text(),
    mejoras: text(),
    comentarios: text(),
    comentariosEvaluado: text(),
    estado: text().notNull().default('borrador'),
    compartidaEn: ts(),
    firmadaEn: ts(),
    firmaImagen: text(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.personaId), index().on(t.evaluadorId)],
);

export const altPlanFormacion = pgTable(
  'alt_plan_formacion',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    anio: integer().notNull(),
    accion: text().notNull(),
    objetivo: text(),
    departamentoId: uuid().references(() => departamentos.id),
    personas: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    trimestre: text(),
    modalidad: text(),
    proveedor: text(),
    horas: numeric({ precision: 6, scale: 1, mode: 'number' }),
    costeEstimado: money(),
    bonificable: flag(false),
    estado: text().notNull().default('planificada'),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId, t.anio)],
);
