// Tablas del módulo PRY (prefijo pry_)
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, money, pct, pk, price, qty, ts, updatedAt } from '../../db/helpers';
import { articulos, empresas, personas, terceros, usuarios } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';

export const pryProyectos = pgTable(
  'pry_proyectos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    nombre: text().notNull(),
    clienteId: uuid().references(() => terceros.id),
    responsableId: uuid().references(() => personas.id),
    estado: text().notNull().default('planificado'),
    tipoFacturacion: text().notNull().default('hitos'),
    fechaInicio: day(),
    fechaFin: day(),
    presupuestoId: uuid().references(() => documentos.id),
    presupuestoVenta: money(),
    presupuestoCoste: money(),
    miembros: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    color: text().notNull().default('#35AE29'),
    descripcion: text(),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    index().on(t.responsableId),
    index().on(t.clienteId),
    index().using('gin', t.miembros),
    index('pry_proyectos_busqueda_trgm').using('gin', sql`(coalesce(${t.codigo},'') || ' ' || coalesce(${t.nombre},'')) gin_trgm_ops`),
  ],
);

export const pryFases = pgTable(
  'pry_fases',
  {
    id: pk(),
    proyectoId: uuid()
      .notNull()
      .references(() => pryProyectos.id, { onDelete: 'cascade' }),
    nombre: text().notNull(),
    orden: integer().notNull().default(0),
    fechaInicio: day(),
    fechaFin: day(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.proyectoId, t.orden)],
);

/** Partidas del presupuesto de coste del proyecto. */
export const pryPartidas = pgTable(
  'pry_partidas',
  {
    id: pk(),
    proyectoId: uuid()
      .notNull()
      .references(() => pryProyectos.id, { onDelete: 'cascade' }),
    nombre: text().notNull(),
    tipo: text().notNull().default('mano_obra'),
    horasPrevistas: qty(),
    costePrevisto: money().notNull().default(0),
    ventaPrevista: money().notNull().default(0),
    orden: integer().notNull().default(0),
    lineaPresupuestoId: uuid(),
    alertadaEn: ts(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.proyectoId, t.orden)],
);

export const pryTareas = pgTable(
  'pry_tareas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    proyectoId: uuid()
      .notNull()
      .references(() => pryProyectos.id, { onDelete: 'cascade' }),
    faseId: uuid().references(() => pryFases.id, { onDelete: 'set null' }),
    partidaId: uuid().references(() => pryPartidas.id, { onDelete: 'set null' }),
    titulo: text().notNull(),
    descripcion: text(),
    asignadoId: uuid().references(() => personas.id),
    estado: text().notNull().default('pendiente'),
    prioridad: text().notNull().default('normal'),
    fechaInicio: day(),
    fechaFin: day(),
    estimacionHoras: qty(),
    dependeDeId: uuid().references((): AnyPgColumn => pryTareas.id, { onDelete: 'set null' }),
    orden: integer().notNull().default(0),
    completadaEn: ts(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.proyectoId, t.estado, t.orden), index().on(t.asignadoId, t.estado)],
);

/** Horas trabajadas en un proyecto (parte de horas) con el coste/hora del momento. */
export const pryImputaciones = pgTable(
  'pry_imputaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    proyectoId: uuid()
      .notNull()
      .references(() => pryProyectos.id),
    tareaId: uuid().references(() => pryTareas.id, { onDelete: 'set null' }),
    partidaId: uuid().references(() => pryPartidas.id, { onDelete: 'set null' }),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    fecha: day().notNull(),
    horas: qty().notNull(),
    costeHora: price().notNull().default(0),
    descripcion: text(),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.proyectoId, t.fecha), index().on(t.personaId, t.fecha), index().on(t.partidaId)],
);

/** Material consumido en un proyecto (si STK está activo, además descuenta stock). */
export const pryConsumos = pgTable(
  'pry_consumos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    proyectoId: uuid()
      .notNull()
      .references(() => pryProyectos.id),
    partidaId: uuid().references(() => pryPartidas.id, { onDelete: 'set null' }),
    articuloId: uuid().references(() => articulos.id),
    descripcion: text().notNull(),
    cantidad: qty().notNull(),
    costeUnitario: price().notNull().default(0),
    almacenId: uuid(),
    lote: text(),
    fecha: day().notNull(),
    personaId: uuid().references(() => personas.id),
    devueltoDeId: uuid(),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.proyectoId, t.fecha), index().on(t.partidaId)],
);

export const pryHitos = pgTable(
  'pry_hitos',
  {
    id: pk(),
    proyectoId: uuid()
      .notNull()
      .references(() => pryProyectos.id, { onDelete: 'cascade' }),
    nombre: text().notNull(),
    fecha: day(),
    porcentaje: pct(),
    importe: money().notNull().default(0),
    ivaTipo: pct().notNull().default(21),
    estado: text().notNull().default('pendiente'),
    documentoId: uuid().references(() => documentos.id),
    orden: integer().notNull().default(0),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.proyectoId)],
);

/** Coste por hora de cada persona para valorar las horas imputadas. */
export const pryCostesPersona = pgTable('pry_costes_persona', {
  personaId: uuid()
    .primaryKey()
    .references(() => personas.id),
  empresaId: uuid().notNull().references(() => empresas.id),
  costeHora: price().notNull(),
  actualizadoEn: updatedAt(),
});
