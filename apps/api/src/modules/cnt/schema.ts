// Tablas del módulo CNT (prefijo cnt_)
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, flag, money, pk, ts } from '../../db/helpers';
import { empresas, terceros, usuarios } from '../../db/schema/core';

/** Plan de cuentas (PGC PYMES) por empresa: cuentas de 3-4 dígitos y subcuentas de 7 o más. */
export const cntCuentas = pgTable(
  'cnt_cuentas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    nombre: text().notNull(),
    grupo: text().notNull(),
    naturaleza: text().notNull().default('mixta'),
    subcuenta: flag(false),
    sistema: flag(false),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo), index('cnt_cuentas_nombre_trgm').using('gin', sql`(${t.codigo} || ' ' || ${t.nombre}) gin_trgm_ops`)],
);

/** Subcuenta 430/400/410 de cada cliente, proveedor o acreedor (no se guarda en la ficha del núcleo). */
export const cntSubcuentasTerceros = pgTable(
  'cnt_subcuentas_terceros',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    tipo: text().notNull(), // cliente | proveedor | acreedor
    cuentaId: uuid()
      .notNull()
      .references(() => cntCuentas.id),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.terceroId, t.tipo)],
);

export const cntEjercicios = pgTable(
  'cnt_ejercicios',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    anio: integer().notNull(),
    estado: text().notNull().default('abierto'),
    siguienteNumero: integer().notNull().default(1),
    cerradoEn: ts(),
    cerradoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.anio)],
);

export const cntCentrosCoste = pgTable(
  'cnt_centros_coste',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    nombre: text().notNull(),
    activo: flag(true),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo)],
);

export const cntAsientos = pgTable(
  'cnt_asientos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    ejercicioId: uuid()
      .notNull()
      .references(() => cntEjercicios.id),
    numero: integer().notNull(),
    fecha: day().notNull(),
    concepto: text().notNull(),
    origen: text().notNull().default('manual'),
    /** Clave de idempotencia para asientos automáticos (p. ej. id del documento o del cobro). */
    refClave: text(),
    refTipo: text(),
    refId: uuid(),
    documentoId: uuid(),
    total: money().notNull().default(0),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
  },
  (t) => [
    index().on(t.empresaId, t.fecha),
    uniqueIndex().on(t.ejercicioId, t.numero),
    uniqueIndex('cnt_asientos_ref_uq').on(t.empresaId, t.origen, t.refClave).where(sql`${t.refClave} IS NOT NULL`),
    index().on(t.documentoId),
  ],
);

export const cntApuntes = pgTable(
  'cnt_apuntes',
  {
    id: pk(),
    asientoId: uuid()
      .notNull()
      .references(() => cntAsientos.id, { onDelete: 'cascade' }),
    empresaId: uuid().notNull().references(() => empresas.id),
    orden: integer().notNull().default(0),
    cuentaId: uuid()
      .notNull()
      .references(() => cntCuentas.id),
    cuenta: text().notNull(),
    concepto: text(),
    debe: money().notNull().default(0),
    haber: money().notNull().default(0),
    terceroId: uuid().references(() => terceros.id),
    centroCosteId: uuid().references(() => cntCentrosCoste.id),
  },
  (t) => [index().on(t.asientoId), index().on(t.empresaId, t.cuenta), index().on(t.cuentaId)],
);

/** Datos fiscales propios de contabilidad por tercero (tipo de retención, exclusión del 347…). */
export const cntTercerosFiscal = pgTable(
  'cnt_terceros_fiscal',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    tipoRetencion: text().notNull().default('ninguna'),
    excluir347: flag(false),
    cuentaGasto: text(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.terceroId)],
);
