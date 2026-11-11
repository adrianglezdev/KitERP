// Tablas del módulo FIC (prefijo fic_)
import { index, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, flag, money, pct, pk, ts, updatedAt } from '../../db/helpers';
import { archivos, empresas, personas } from '../../db/schema/core';
import type { ficShared } from '@kite/shared';

/** Ficha laboral: 1:1 con la persona del núcleo. */
export const ficTrabajadores = pgTable(
  'fic_trabajadores',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    dni: text(),
    nss: text(),
    fechaNacimiento: day(),
    sexo: text(),
    nacionalidad: text(),
    direccion: text(),
    codigoPostal: text(),
    localidad: text(),
    provincia: text(),
    telefonoPersonal: text(),
    emailPersonal: text(),
    iban: text(),
    contactoEmergencia: text(),
    telefonoEmergencia: text(),
    convenio: text(),
    categoria: text(),
    grupoCotizacion: text(),
    tipoContrato: text().default('indefinido'),
    jornadaHoras: numeric({ precision: 5, scale: 2, mode: 'number' }).default(40),
    salarioBruto: money(),
    fechaAlta: day(),
    finPeriodoPrueba: day(),
    finContrato: day(),
    fechaBaja: day(),
    motivoBaja: text(),
    discapacidad: pct(),
    datosSalud: text(),
    notas: text(),
    validado: flag(false),
    validadoPor: uuid(),
    validadoEn: ts(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
  },
  (t) => [uniqueIndex('fic_trabajadores_persona_uq').on(t.personaId), index().on(t.empresaId, t.dni), index().on(t.empresaId, t.finContrato)],
);

/** Historial laboral: ascensos, revisiones salariales, cambios de jornada o centro. */
export const ficHistorial = pgTable(
  'fic_historial',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    fecha: day().notNull(),
    tipo: text().notNull(),
    descripcion: text().notNull(),
    valorAnterior: text(),
    valorNuevo: text(),
    /** auto (cambio detectado) o manual */
    origen: text().notNull().default('manual'),
    campo: text(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.personaId, t.fecha)],
);

export const ficFormacion = pgTable(
  'fic_formacion',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    curso: text().notNull(),
    tipo: text().notNull().default('tecnica'),
    entidad: text(),
    fecha: day().notNull(),
    horas: numeric({ precision: 6, scale: 1, mode: 'number' }),
    caduca: day(),
    coste: money(),
    bonificada: flag(false),
    archivoId: uuid().references(() => archivos.id),
    notas: text(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.personaId), index().on(t.empresaId, t.caduca)],
);

/** Prevención de riesgos: reconocimientos médicos, cursos de PRL y entregas de EPI firmadas. */
export const ficPrl = pgTable(
  'fic_prl',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    tipo: text().notNull(),
    descripcion: text().notNull(),
    fecha: day().notNull(),
    caduca: day(),
    resultado: text(),
    entidad: text(),
    horas: numeric({ precision: 6, scale: 1, mode: 'number' }),
    epis: jsonb().$type<ficShared.EpiItem[]>(),
    archivoId: uuid().references(() => archivos.id),
    notas: text(),
    /** Firma del trabajador (entregas de EPI, información de riesgos). */
    firmaImagen: text(),
    firmadoEn: ts(),
    firmaIp: text(),
    firmaHash: text(),
    evidenciaArchivoId: uuid().references(() => archivos.id),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.personaId), index().on(t.empresaId, t.caduca)],
);

/** Datos que propone el propio trabajador y RRHH valida. */
export const ficCambios = pgTable(
  'fic_cambios',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    datos: jsonb().$type<Record<string, unknown>>().notNull(),
    estado: text().notNull().default('pendiente'),
    comentario: text(),
    revisadoPor: uuid(),
    revisadoEn: ts(),
    motivoRechazo: text(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.estado)],
);
