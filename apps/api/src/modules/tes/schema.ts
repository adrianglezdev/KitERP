// Tablas del módulo TES (prefijo tes_)
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, flag, money, pk, ts } from '../../db/helpers';
import { archivos, empresas, terceros, usuarios } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';

/** Bancos y cajas. */
export const tesCuentas = pgTable(
  'tes_cuentas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    tipo: text().notNull().default('banco'), // banco | caja
    iban: text(),
    bic: text(),
    cuentaContable: text().notNull(),
    saldoInicial: money().notNull().default(0),
    fechaSaldo: day(),
    sufijoSepa: text().notNull().default('000'),
    porDefecto: flag(false),
    activo: flag(true),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId)],
);

/** Remesas SEPA: recibos (pain.008) o transferencias (pain.001). */
export const tesRemesas = pgTable(
  'tes_remesas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    tipo: text().notNull(), // cobro | pago
    cuentaId: uuid()
      .notNull()
      .references(() => tesCuentas.id),
    fechaCargo: day().notNull(),
    total: money().notNull().default(0),
    numOperaciones: integer().notNull().default(0),
    estado: text().notNull().default('generada'), // generada | enviada | cobrada
    msgId: text().notNull(),
    archivoId: uuid().references(() => archivos.id),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
    cerradaEn: ts(),
  },
  (t) => [index().on(t.empresaId, t.estado), uniqueIndex().on(t.empresaId, t.codigo)],
);

/** Cartera: lo que hay que cobrar y pagar, con su estado. */
export const tesVencimientos = pgTable(
  'tes_vencimientos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    circuito: text().notNull(), // cobro | pago
    documentoId: uuid().references(() => documentos.id),
    terceroId: uuid().references(() => terceros.id),
    plazo: integer().notNull().default(1),
    concepto: text(),
    fecha: day().notNull(),
    importe: money().notNull(),
    importePagado: money().notNull().default(0),
    estado: text().notNull().default('pendiente'),
    formaPagoTipo: text(),
    remesaId: uuid().references((): AnyPgColumn => tesRemesas.id),
    cuentaContrapartida: text(),
    recordatorios: integer().notNull().default(0),
    ultimoRecordatorio: day(),
    motivoDevolucion: text(),
    notas: text(),
    creadoEn: createdAt(),
  },
  (t) => [
    index().on(t.empresaId, t.circuito, t.estado, t.fecha),
    index().on(t.terceroId),
    index().on(t.remesaId),
    uniqueIndex('tes_vencimientos_doc_plazo_uq').on(t.documentoId, t.plazo).where(sql`${t.documentoId} IS NOT NULL`),
  ],
);

/** Cobros y pagos registrados contra un vencimiento (negativos = devoluciones). */
export const tesPagos = pgTable(
  'tes_pagos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    vencimientoId: uuid()
      .notNull()
      .references(() => tesVencimientos.id),
    cuentaId: uuid().references(() => tesCuentas.id),
    fecha: day().notNull(),
    importe: money().notNull(),
    medio: text().notNull().default('transferencia'),
    remesaId: uuid().references(() => tesRemesas.id),
    notas: text(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.vencimientoId), index().on(t.empresaId, t.fecha), index().on(t.cuentaId, t.fecha)],
);

/** Extracto bancario importado (Norma 43, CSV) o anotado a mano. */
export const tesMovimientos = pgTable(
  'tes_movimientos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    cuentaId: uuid()
      .notNull()
      .references(() => tesCuentas.id),
    fecha: day().notNull(),
    fechaValor: day(),
    importe: money().notNull(),
    concepto: text().notNull().default(''),
    referencia: text(),
    conceptoComun: text(),
    origen: text().notNull().default('manual'),
    estado: text().notNull().default('pendiente'), // pendiente | conciliado | ignorado
    nota: text(),
    hash: text().notNull(),
    importacionId: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.cuentaId, t.fecha), index().on(t.empresaId, t.estado), uniqueIndex().on(t.empresaId, t.hash)],
);

/** Pareja movimiento del banco ↔ cobro/pago registrado. */
export const tesConciliaciones = pgTable(
  'tes_conciliaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    movimientoId: uuid()
      .notNull()
      .references(() => tesMovimientos.id, { onDelete: 'cascade' }),
    pagoId: uuid().references(() => tesPagos.id),
    vencimientoId: uuid().references(() => tesVencimientos.id),
    importe: money().notNull(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.movimientoId), index().on(t.pagoId)],
);
