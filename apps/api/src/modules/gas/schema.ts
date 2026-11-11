// Tablas del módulo GAS (prefijo gas_)
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, flag, money, pct, pk, price, ts, updatedAt } from '../../db/helpers';
import { archivos, empresas, personas, terceros, usuarios } from '../../db/schema/core';

export const gasTarjetas = pgTable(
  'gas_tarjetas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    ultimos4: text().notNull(),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    cuentaContable: text().notNull().default('5720001'),
    limiteMensual: money(),
    activo: flag(true),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId), index().on(t.personaId)],
);

/** Liquidación por lotes (Administración): cada gasto se paga en nómina o por transferencia. */
export const gasLiquidaciones = pgTable(
  'gas_liquidaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    fecha: day().notNull(),
    via: text().notNull(),
    total: money().notNull().default(0),
    numGastos: integer().notNull().default(0),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.fecha)],
);

export const gasGastos = pgTable(
  'gas_gastos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    tipo: text().notNull().default('ticket'), // ticket | kilometraje | dieta | tarjeta
    categoria: text(),
    fecha: day().notNull(),
    comercio: text(),
    nifComercio: text(),
    concepto: text().notNull().default(''),
    base: money().notNull().default(0),
    ivaTipo: pct(),
    iva: money().notNull().default(0),
    total: money().notNull().default(0),
    km: price(),
    precioKm: price(),
    origen: text(),
    destino: text(),
    pais: text().notNull().default('ES'),
    proyectoId: uuid(),
    activoId: uuid(),
    terceroId: uuid().references(() => terceros.id),
    archivoId: uuid().references(() => archivos.id),
    tarjetaId: uuid().references(() => gasTarjetas.id),
    estado: text().notNull().default('borrador'),
    enviadoEn: ts(),
    aprobadoPor: uuid().references(() => personas.id),
    aprobadoEn: ts(),
    motivoRechazo: text(),
    liquidacionId: uuid().references(() => gasLiquidaciones.id),
    liquidacionVia: text(),
    fechaLiquidacion: day(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
  },
  (t) => [index().on(t.empresaId, t.estado), index().on(t.personaId, t.fecha), index().on(t.proyectoId), index().on(t.tarjetaId)],
);

/** Cargos del extracto de la tarjeta de empresa, para casarlos con los tickets. */
export const gasTarjetaMovimientos = pgTable(
  'gas_tarjeta_movimientos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    tarjetaId: uuid()
      .notNull()
      .references(() => gasTarjetas.id),
    fecha: day().notNull(),
    comercio: text().notNull().default(''),
    importe: money().notNull(),
    gastoId: uuid().references(() => gasGastos.id),
    hash: text().notNull(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.tarjetaId, t.fecha), uniqueIndex().on(t.empresaId, t.hash)],
);
