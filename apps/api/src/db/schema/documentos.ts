import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, flag, money, pct, pk, price, qty, ts, updatedAt } from '../helpers';
import { articulos, contactos, empresas, formasPago, personas, series, tarifas, terceros, usuarios } from './core';

/**
 * Motor común de documentos comerciales.
 * Presupuestos, pedidos, albaranes y facturas (venta) y pedidos, recepciones y facturas de proveedor (compra)
 * comparten estructura: una cabecera y sus líneas. Cada línea recuerda de qué línea viene
 * (presupuesto → pedido → albarán → factura), lo que permite entregas y facturación parciales sin duplicar datos.
 */
export const documentos = pgTable(
  'documentos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    circuito: text().notNull(), // venta | compra
    tipo: text().notNull(),
    serieId: uuid().references(() => series.id),
    numero: integer(),
    codigo: text(),
    estado: text().notNull().default('borrador'),
    fecha: day().notNull(),
    fechaValidez: day(),
    fechaEntrega: day(),
    fechaOperacion: day(),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    contactoId: uuid().references(() => contactos.id),
    comercialId: uuid().references(() => personas.id),
    /** Copia de los datos fiscales del tercero en el momento de emitir (la factura no cambia aunque cambie la ficha). */
    datosTercero: jsonb().$type<Record<string, unknown>>(),
    direccionEnvio: jsonb().$type<Record<string, unknown>>(),
    formaPagoId: uuid().references(() => formasPago.id),
    tarifaId: uuid().references(() => tarifas.id),
    almacenId: uuid(),
    proyectoId: uuid(),
    origenTipo: text(), // sat_orden, oportunidad, recurrente…
    origenId: uuid(),
    documentoOrigenId: uuid().references((): AnyPgColumn => documentos.id),
    rectificaId: uuid().references((): AnyPgColumn => documentos.id),
    tipoRectificativa: text(), // R1..R5
    motivoRectificacion: text(),
    regimenIva: text().notNull().default('general'),
    recargoEquivalencia: flag(false),
    descuentoGlobal: pct().notNull().default(0),
    sumaLineas: money().notNull().default(0),
    baseImponible: money().notNull().default(0),
    totalIva: money().notNull().default(0),
    totalRecargo: money().notNull().default(0),
    totalRetencion: money().notNull().default(0),
    total: money().notNull().default(0),
    coste: money().notNull().default(0),
    margen: money().notNull().default(0),
    moneda: text().notNull().default('EUR'),
    tipoCambio: price().notNull().default(1),
    referenciaExterna: text(), // su nº de pedido / nº de factura del proveedor
    titulo: text(),
    observaciones: text(),
    notasInternas: text(),
    condiciones: text(),
    version: integer().notNull().default(1),
    grupoId: uuid(),
    tokenPublico: text(),
    enviadoEn: ts(),
    vistoEn: ts(),
    aceptadoEn: ts(),
    aceptadoPor: text(),
    firmaImagen: text(),
    rechazoMotivo: text(),
    aprobadoPor: uuid(),
    emitidoEn: ts(),
    bloqueado: flag(false),
    estadoPago: text(),
    archivoId: uuid(),
    creadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.empresaId, t.tipo, t.fecha),
    index().on(t.empresaId, t.tipo, t.estado),
    index().on(t.terceroId, t.fecha),
    index().on(t.comercialId),
    index().on(t.documentoOrigenId),
    index().on(t.origenTipo, t.origenId),
    index().on(t.proyectoId),
    uniqueIndex('documentos_serie_numero_uq').on(t.serieId, t.numero),
    uniqueIndex('documentos_token_uq').on(t.tokenPublico),
    index('documentos_codigo_trgm').using('gin', sql`(coalesce(${t.codigo},'') || ' ' || coalesce(${t.titulo},'') || ' ' || coalesce(${t.referenciaExterna},'')) gin_trgm_ops`),
  ],
);

export const documentoLineas = pgTable(
  'documento_lineas',
  {
    id: pk(),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id, { onDelete: 'cascade' }),
    orden: integer().notNull().default(0),
    tipoLinea: text().notNull().default('articulo'), // articulo | texto | capitulo
    articuloId: uuid().references(() => articulos.id),
    referencia: text(),
    descripcion: text().notNull().default(''),
    cantidad: qty().notNull().default(1),
    unidad: text(),
    precio: price().notNull().default(0),
    descuento: pct().notNull().default(0),
    ivaTipo: pct().notNull().default(21),
    retencion: pct().notNull().default(0),
    coste: price().notNull().default(0),
    subtotal: money().notNull().default(0),
    almacenId: uuid(),
    lote: text(),
    caducidad: day(),
    series: text().array(),
    lineaOrigenId: uuid().references((): AnyPgColumn => documentoLineas.id, { onDelete: 'set null' }),
  },
  (t) => [index().on(t.documentoId, t.orden), index().on(t.lineaOrigenId), index().on(t.articuloId)],
);

export const documentoImpuestos = pgTable(
  'documento_impuestos',
  {
    id: pk(),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id, { onDelete: 'cascade' }),
    ivaTipo: pct().notNull(),
    base: money().notNull(),
    cuota: money().notNull(),
    recargoPct: pct().notNull().default(0),
    cuotaRecargo: money().notNull().default(0),
  },
  (t) => [index().on(t.documentoId)],
);

/** Facturación recurrente (cuotas, contratos de mantenimiento…). */
export const documentosRecurrentes = pgTable(
  'documentos_recurrentes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    serieId: uuid().references(() => series.id),
    formaPagoId: uuid().references(() => formasPago.id),
    periodicidad: text().notNull().default('mensual'), // mensual | trimestral | semestral | anual
    proximaFecha: day().notNull(),
    finFecha: day(),
    lineas: jsonb()
      .$type<{ articuloId?: string | null; descripcion: string; cantidad: number; precio: number; descuento?: number; ivaTipo: number; retencion?: number }[]>()
      .notNull(),
    emitirAutomaticamente: flag(false),
    activo: flag(true),
    origenTipo: text(),
    origenId: uuid(),
    ultimoDocumentoId: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.activo, t.proximaFecha)],
);

/**
 * Registros Verifactu (RD 1007/2023): cadena de huellas SHA-256 por emisor.
 * Un disparador impide modificar o borrar registros.
 */
export const facVerifactu = pgTable(
  'fac_verifactu',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    secuencia: bigint({ mode: 'number' }).notNull(),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id),
    tipoRegistro: text().notNull(), // alta | anulacion
    nifEmisor: text().notNull(),
    numSerie: text().notNull(),
    fechaExpedicion: text().notNull(), // dd-mm-aaaa
    tipoFactura: text().notNull(), // F1, F2, R1…
    cuotaTotal: money().notNull(),
    importeTotal: money().notNull(),
    huella: text().notNull(),
    huellaAnterior: text(),
    fechaHoraGen: text().notNull(),
    urlQr: text().notNull(),
    xml: text().notNull(),
    estadoEnvio: text().notNull().default('pendiente'),
    respuesta: text(),
    enviadoEn: ts(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.secuencia), index().on(t.documentoId), index().on(t.estadoEnvio)],
);
