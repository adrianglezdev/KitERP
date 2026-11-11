// Tablas del módulo ACT (prefijo act_)
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, money, pk, qty, ts, updatedAt } from '../../db/helpers';
import { archivos, centros, empresas, personas, terceros, usuarios } from '../../db/schema/core';

export const actActivos = pgTable(
  'act_activos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    nombre: text().notNull(),
    tipo: text().notNull().default('vehiculo'),
    estado: text().notNull().default('activo'),
    marca: text(),
    modelo: text(),
    numeroSerie: text(),
    matricula: text(),
    km: integer(),
    asignadoId: uuid().references(() => personas.id),
    centroId: uuid().references(() => centros.id),
    proyectoId: uuid(),
    proveedorId: uuid().references(() => terceros.id),
    fechaCompra: day(),
    valorCompra: money(),
    vidaUtilMeses: integer(),
    valorResidual: money().default(0),
    cuentaActivo: text(),
    cuentaAmortizacion: text().default('281'),
    cuentaGasto: text().default('681'),
    notas: text(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    uniqueIndex('act_activos_codigo_uq').on(t.empresaId, t.codigo),
    index().on(t.empresaId, t.tipo),
    index().on(t.asignadoId),
    index('act_activos_busqueda_trgm').using('gin', sql`(coalesce(${t.codigo},'') || ' ' || coalesce(${t.nombre},'') || ' ' || coalesce(${t.matricula},'') || ' ' || coalesce(${t.numeroSerie},'')) gin_trgm_ops`),
  ],
);

/** ITV, seguros, revisiones… Al completarse, si se repite, se crea el siguiente. */
export const actVencimientos = pgTable(
  'act_vencimientos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    activoId: uuid()
      .notNull()
      .references(() => actActivos.id),
    tipo: text().notNull().default('itv'),
    descripcion: text(),
    fecha: day().notNull(),
    avisoDias: integer().notNull().default(15),
    periodicidadMeses: integer(),
    costeEstimado: money(),
    estado: text().notNull().default('pendiente'),
    avisadoEn: ts(),
    completadoEn: day(),
    registroId: uuid(),
    anteriorId: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.estado, t.fecha), index().on(t.activoId)],
);

/** Mantenimientos, reparaciones, repostajes, lecturas de km y multas (con su coste). */
export const actRegistros = pgTable(
  'act_registros',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    activoId: uuid()
      .notNull()
      .references(() => actActivos.id),
    tipo: text().notNull(),
    fecha: day().notNull(),
    descripcion: text(),
    coste: money(),
    proveedorId: uuid().references(() => terceros.id),
    km: integer(),
    litros: qty(),
    archivoId: uuid().references(() => archivos.id),
    vencimientoId: uuid(),
    personaId: uuid().references(() => personas.id),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.activoId, t.fecha), index().on(t.empresaId, t.tipo)],
);

/** Quién tuvo cada activo y cuándo (entrega y devolución firmadas). */
export const actAsignaciones = pgTable(
  'act_asignaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    activoId: uuid()
      .notNull()
      .references(() => actActivos.id),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    desde: day().notNull(),
    hasta: day(),
    kmEntrega: integer(),
    kmDevolucion: integer(),
    notasEntrega: text(),
    notasDevolucion: text(),
    firmaEntrega: text(),
    firmaDevolucion: text(),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.activoId, t.desde), index().on(t.personaId)],
);

/** Cuotas de amortización lineal mensual (una por activo y mes: idempotente). */
export const actAmortizaciones = pgTable(
  'act_amortizaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    activoId: uuid()
      .notNull()
      .references(() => actActivos.id),
    periodo: text().notNull(), // AAAA-MM
    fecha: day().notNull(),
    importe: money().notNull(),
    acumulado: money().notNull(),
    contabilizada: text().notNull().default('evento'), // evento | historico
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.activoId, t.periodo), index().on(t.empresaId, t.periodo)],
);
