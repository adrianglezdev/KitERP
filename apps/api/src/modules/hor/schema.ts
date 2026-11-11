// Tablas del módulo HOR (prefijo hor_)
import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, flag, pk, price, ts, updatedAt } from '../../db/helpers';
import { centros, empresas, personas } from '../../db/schema/core';

/**
 * Fichajes. Son inalterables: un disparador impide modificarlos o borrarlos.
 * `momento` es la hora del servidor al fichar (o la hora aprobada en una corrección);
 * `registradoEn` es siempre la hora real en que se guardó la fila.
 */
export const horFichajes = pgTable(
  'hor_fichajes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    tipo: text().notNull(),
    momento: ts().notNull().defaultNow(),
    origen: text().notNull().default('web'),
    lat: price(),
    lng: price(),
    precision: integer(),
    dentroGeovalla: boolean(),
    centroId: uuid().references(() => centros.id),
    kioscoId: uuid(),
    correccionId: uuid(),
    ip: text(),
    userAgent: text(),
    nota: text(),
    registradoPor: uuid(),
    registradoEn: createdAt(),
  },
  (t) => [index().on(t.personaId, t.momento), index('hor_fichajes_momento_brin').using('brin', t.momento), index().on(t.empresaId, t.momento)],
);

/** Anulaciones de fichajes (por corrección aprobada). El original se conserva siempre. */
export const horAnulaciones = pgTable(
  'hor_anulaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    fichajeId: uuid()
      .notNull()
      .references(() => horFichajes.id),
    correccionId: uuid(),
    motivo: text().notNull(),
    anuladoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex('hor_anulaciones_fichaje_uq').on(t.fichajeId)],
);

/** Solicitudes de corrección de fichajes. */
export const horCorrecciones = pgTable(
  'hor_correcciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    tipo: text().notNull(), // anadir | modificar | anular
    fecha: day().notNull(),
    fichajeId: uuid().references(() => horFichajes.id),
    nuevoTipo: text(),
    nuevoMomento: ts(),
    motivo: text().notNull(),
    estado: text().notNull().default('pendiente'),
    solicitadoPor: uuid(),
    revisadoPor: uuid(),
    revisadoEn: ts(),
    motivoRechazo: text(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.estado), index().on(t.personaId, t.fecha)],
);

export const horTurnos = pgTable(
  'hor_turnos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    horaInicio: text().notNull(),
    horaFin: text().notNull(),
    pausaMinutos: integer().notNull().default(60),
    dias: jsonb().$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
    color: text().notNull().default('#7D2CDD'),
    activo: flag(true),
    creadoEn: createdAt(),
    archivadoEn: ts(),
  },
  (t) => [index().on(t.empresaId)],
);

/** Turno habitual de cada persona por rango de fechas. */
export const horAsignaciones = pgTable(
  'hor_asignaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    turnoId: uuid()
      .notNull()
      .references(() => horTurnos.id),
    desde: day().notNull(),
    hasta: day(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.personaId, t.desde)],
);

/** Excepciones del cuadrante semanal (un día concreto con otro turno o libre). */
export const horCuadrante = pgTable(
  'hor_cuadrante',
  {
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    fecha: day().notNull(),
    turnoId: uuid().references(() => horTurnos.id),
    libre: flag(false),
    nota: text(),
    actualizadoPor: uuid(),
    actualizadoEn: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.personaId, t.fecha] }), index().on(t.empresaId, t.fecha)],
);

/** Quioscos de fichaje (tableta en la entrada). Se identifican con un token secreto. */
export const horKioscos = pgTable('hor_kioscos', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  nombre: text().notNull(),
  centroId: uuid()
    .notNull()
    .references(() => centros.id),
  tokenHash: text().notNull(),
  activo: flag(true),
  ultimoUso: ts(),
  creadoEn: createdAt(),
});

/** PIN personal para fichar en el quiosco (guardado con scrypt). */
export const horPines = pgTable('hor_pines', {
  personaId: uuid()
    .primaryKey()
    .references(() => personas.id),
  empresaId: uuid().notNull().references(() => empresas.id),
  pinHash: text().notNull(),
  intentos: integer().notNull().default(0),
  bloqueadoHasta: ts(),
  actualizadoEn: updatedAt(),
});

/** Resumen mensual firmado por la persona trabajadora. */
export const horFirmasMes = pgTable(
  'hor_firmas_mes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    anio: integer().notNull(),
    mes: integer().notNull(),
    hash: text().notNull(),
    resumen: jsonb().$type<{ trabajadas: number; extra: number; nocturnas: number; dias: number }>().notNull(),
    firmaImagen: text().notNull(),
    firmadoEn: createdAt(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [uniqueIndex('hor_firmas_mes_uq').on(t.personaId, t.anio, t.mes)],
);

/** Bolsa de horas: movimientos a favor (+) o en contra (-) de cada persona. */
export const horBolsa = pgTable(
  'hor_bolsa',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    fecha: day().notNull(),
    horas: numeric({ precision: 7, scale: 2, mode: 'number' }).notNull(),
    concepto: text().notNull(),
    origen: text().notNull().default('manual'), // manual | mes
    periodo: text(), // AAAA-MM cuando viene del cierre de un mes
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.personaId, t.fecha), uniqueIndex('hor_bolsa_mes_uq').on(t.personaId, t.periodo, t.origen)],
);
