// Tablas del módulo AUS (prefijo aus_)
import { index, integer, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, flag, pk, ts } from '../../db/helpers';
import { archivos, departamentos, empresas, personas } from '../../db/schema/core';

const dias = () => numeric({ precision: 6, scale: 1, mode: 'number' });

export const ausTipos = pgTable(
  'aus_tipos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    codigo: text(),
    clave: text(), // vacaciones, asuntos_propios, baja_medica… (para reglas internas)
    color: text().notNull().default('#35AE29'),
    retribuido: flag(true),
    descuentaSaldo: flag(false),
    diasAnuales: dias(),
    unidad: text().notNull().default('laborables'),
    requiereJustificante: flag(false),
    permiteMedioDia: flag(true),
    dosNiveles: flag(false),
    soloRrhh: flag(false),
    maxArrastre: dias().default(0),
    activo: flag(true),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId)],
);

export const ausSaldos = pgTable(
  'aus_saldos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    tipoId: uuid()
      .notNull()
      .references(() => ausTipos.id),
    anio: integer().notNull(),
    dias: dias().notNull(),
    arrastre: dias().notNull().default(0),
    ajuste: dias().notNull().default(0),
    notas: text(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex('aus_saldos_uq').on(t.personaId, t.tipoId, t.anio)],
);

export const ausSolicitudes = pgTable(
  'aus_solicitudes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    tipoId: uuid()
      .notNull()
      .references(() => ausTipos.id),
    desde: day().notNull(),
    hasta: day().notNull(),
    medioDia: text(), // manana | tarde | null
    dias: dias().notNull(),
    motivo: text(),
    justificanteArchivoId: uuid().references(() => archivos.id),
    estado: text().notNull().default('pendiente'),
    aprobadoResponsablePor: uuid(),
    aprobadoResponsableEn: ts(),
    revisadoPor: uuid(),
    revisadoEn: ts(),
    motivoRechazo: text(),
    registradaPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.estado), index().on(t.personaId, t.desde), index().on(t.empresaId, t.desde, t.hasta)],
);

export const ausMinimos = pgTable(
  'aus_minimos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    departamentoId: uuid()
      .notNull()
      .references(() => departamentos.id),
    minimo: integer().notNull(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex('aus_minimos_dep_uq').on(t.departamentoId)],
);
