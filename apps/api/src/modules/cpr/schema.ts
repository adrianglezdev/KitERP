// Tablas del módulo CPR (prefijo cpr_)
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, flag, money, pct, pk, price, qty, ts, updatedAt } from '../../db/helpers';
import { archivos, articulos, empresas, personas, terceros, usuarios } from '../../db/schema/core';
import { documentoLineas, documentos } from '../../db/schema/documentos';

/** Solicitudes internas de compra: cualquier trabajador pide, su responsable aprueba y compras lo agrupa en pedidos. */
export const cprSolicitudes = pgTable(
  'cpr_solicitudes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    solicitanteId: uuid()
      .notNull()
      .references(() => personas.id),
    descripcion: text().notNull(),
    articuloId: uuid().references(() => articulos.id),
    cantidad: qty().notNull().default(1),
    importeEstimado: money(),
    proveedorId: uuid().references(() => terceros.id),
    proyectoId: uuid(),
    fechaNecesaria: day(),
    motivo: text(),
    estado: text().notNull().default('pendiente'), // pendiente | aprobada | rechazada | pedida
    aprobadorId: uuid().references(() => personas.id),
    resueltoEn: ts(),
    motivoRechazo: text(),
    documentoId: uuid().references(() => documentos.id),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
  },
  (t) => [index().on(t.empresaId, t.estado), index().on(t.solicitanteId), index().on(t.documentoId)],
);

/** Precios y condiciones de cada proveedor para cada artículo. */
export const cprArticuloProveedor = pgTable(
  'cpr_articulo_proveedor',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    proveedorId: uuid()
      .notNull()
      .references(() => terceros.id),
    referenciaProveedor: text(),
    precio: price().notNull().default(0),
    descuento: pct(),
    plazoDias: integer().default(3),
    cantidadMinima: qty(),
    preferente: flag(false),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.articuloId, t.proveedorId), index().on(t.proveedorId)],
);

/** Incidencias detectadas al recibir mercancía (con foto). */
export const cprIncidencias = pgTable(
  'cpr_incidencias',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id),
    lineaId: uuid().references(() => documentoLineas.id, { onDelete: 'set null' }),
    terceroId: uuid().references(() => terceros.id),
    articuloId: uuid().references(() => articulos.id),
    tipo: text().notNull().default('danado'),
    cantidad: qty(),
    descripcion: text().notNull(),
    archivoId: uuid().references(() => archivos.id),
    estado: text().notNull().default('abierta'),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
    resueltaEn: ts(),
  },
  (t) => [index().on(t.documentoId), index().on(t.terceroId, t.creadoEn)],
);
