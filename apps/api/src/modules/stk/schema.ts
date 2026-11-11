// Tablas del módulo STK (prefijo stk_)
import { sql } from 'drizzle-orm';
import { bigserial, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, flag, pk, price, qty, ts, updatedAt } from '../../db/helpers';
import { articulos, centros, empresas, personas, terceros, usuarios } from '../../db/schema/core';

/** Almacenes y furgonetas (una furgoneta es un almacén con técnico responsable). */
export const stkAlmacenes = pgTable(
  'stk_almacenes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    tipo: text().notNull().default('almacen'), // almacen | furgoneta
    centroId: uuid().references(() => centros.id),
    personaId: uuid().references(() => personas.id),
    porDefecto: flag(false),
    activo: flag(true),
    notas: text(),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId, t.tipo), index().on(t.personaId)],
);

export const stkUbicaciones = pgTable(
  'stk_ubicaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    almacenId: uuid()
      .notNull()
      .references(() => stkAlmacenes.id),
    codigo: text().notNull(),
    descripcion: text(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.almacenId, t.codigo)],
);

/** Configuración de stock por artículo (el artículo vive en el núcleo). */
export const stkArticuloConfig = pgTable('stk_articulo_config', {
  articuloId: uuid()
    .primaryKey()
    .references(() => articulos.id),
  empresaId: uuid().notNull().references(() => empresas.id),
  stockMin: qty(),
  puntoPedido: qty(),
  cantidadPedido: qty(),
  controlaLotes: flag(false),
  controlaSeries: flag(false),
  ubicacionId: uuid().references(() => stkUbicaciones.id),
  ultimoRecuento: day(),
  actualizadoEn: updatedAt(),
});

export const stkLotes = pgTable(
  'stk_lotes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    lote: text().notNull(),
    caducidad: day(),
    proveedorId: uuid().references(() => terceros.id),
    documentoId: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.articuloId, t.lote), index().on(t.empresaId, t.caducidad)],
);

export const stkSeries = pgTable(
  'stk_series',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    numeroSerie: text().notNull(),
    estado: text().notNull().default('en_stock'),
    almacenId: uuid().references(() => stkAlmacenes.id),
    lote: text(),
    terceroId: uuid().references(() => terceros.id),
    documentoEntradaId: uuid(),
    documentoSalidaId: uuid(),
    fechaEntrada: day(),
    fechaSalida: day(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.articuloId, t.numeroSerie), index('stk_series_numero_trgm').using('gin', sql`${t.numeroSerie} gin_trgm_ops`)],
);

/**
 * Movimientos de stock: solo se insertan (un disparador impide modificarlos o borrarlos).
 * La cantidad lleva signo (+ entra, − sale). El disparador mantiene stk_saldos y el coste medio (PMP).
 */
export const stkMovimientos = pgTable(
  'stk_movimientos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    momento: ts().notNull().defaultNow(),
    tipo: text().notNull(),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    almacenId: uuid()
      .notNull()
      .references(() => stkAlmacenes.id),
    lote: text().notNull().default(''),
    cantidad: qty().notNull(),
    /** Coste unitario: en entradas el de compra; en salidas lo fija el disparador con el coste medio vigente. */
    costeUnitario: price(),
    /** Saldo del artículo en ese almacén y lote tras el movimiento (lo calcula el disparador). */
    saldo: qty(),
    documentoId: uuid(),
    lineaId: uuid(),
    origenTipo: text(), // documento | traspaso | inventario | ajuste | pry_proyecto
    origenId: uuid(),
    series: text().array(),
    motivo: text(),
    usuarioId: uuid().references(() => usuarios.id),
    personaId: uuid().references(() => personas.id),
  },
  (t) => [
    index('stk_movimientos_momento_brin').using('brin', t.momento),
    index().on(t.articuloId, t.momento),
    index().on(t.almacenId, t.momento),
    index().on(t.documentoId),
    index().on(t.origenTipo, t.origenId),
    index().on(t.empresaId, t.lote),
  ],
);

/** Saldo por artículo, almacén y lote (lo mantiene el disparador de stk_movimientos y stk_reservas). */
export const stkSaldos = pgTable(
  'stk_saldos',
  {
    empresaId: uuid().notNull().references(() => empresas.id),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    almacenId: uuid()
      .notNull()
      .references(() => stkAlmacenes.id),
    lote: text().notNull().default(''),
    cantidad: qty().notNull().default(0),
    reservado: qty().notNull().default(0),
    costeMedio: price().notNull().default(0),
    actualizadoEn: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.articuloId, t.almacenId, t.lote] }), index().on(t.empresaId, t.almacenId)],
);

/** Reservas de pedidos de venta confirmados (una por línea de pedido y artículo; los kits reservan componentes). */
export const stkReservas = pgTable(
  'stk_reservas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    documentoId: uuid().notNull(),
    lineaId: uuid().notNull(),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    almacenId: uuid()
      .notNull()
      .references(() => stkAlmacenes.id),
    cantidad: qty().notNull(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.lineaId, t.articuloId), index().on(t.documentoId), index().on(t.articuloId)],
);

export const stkTraspasos = pgTable(
  'stk_traspasos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    fecha: day().notNull(),
    origenId: uuid()
      .notNull()
      .references(() => stkAlmacenes.id),
    destinoId: uuid()
      .notNull()
      .references(() => stkAlmacenes.id),
    notas: text(),
    lineas: integer().notNull().default(0),
    usuarioId: uuid().references(() => usuarios.id),
    personaId: uuid().references(() => personas.id),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.fecha), index().on(t.origenId), index().on(t.destinoId)],
);

export const stkInventarios = pgTable(
  'stk_inventarios',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    almacenId: uuid()
      .notNull()
      .references(() => stkAlmacenes.id),
    tipo: text().notNull().default('total'),
    estado: text().notNull().default('abierto'),
    fecha: day().notNull(),
    notas: text(),
    creadoPor: uuid().references(() => usuarios.id),
    confirmadoEn: ts(),
    confirmadoPor: uuid().references(() => usuarios.id),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.estado)],
);

export const stkInventarioLineas = pgTable(
  'stk_inventario_lineas',
  {
    id: pk(),
    inventarioId: uuid()
      .notNull()
      .references(() => stkInventarios.id, { onDelete: 'cascade' }),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    lote: text().notNull().default(''),
    teorico: qty().notNull().default(0),
    contado: qty(),
    diferencia: qty(),
    contadoPor: uuid().references(() => usuarios.id),
    contadoEn: ts(),
  },
  (t) => [uniqueIndex().on(t.inventarioId, t.articuloId, t.lote)],
);

/** Escandallos: componentes de un artículo de tipo kit. Vender un kit descuenta sus componentes. */
export const stkKitComponentes = pgTable(
  'stk_kit_componentes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    kitId: uuid()
      .notNull()
      .references(() => articulos.id),
    componenteId: uuid()
      .notNull()
      .references((): AnyPgColumn => articulos.id),
    cantidad: qty().notNull(),
  },
  (t) => [uniqueIndex().on(t.kitId, t.componenteId), index().on(t.componenteId)],
);

/** Avisos de stock negativo ya enviados (para no repetirlos en cada movimiento). */
export const stkAvisos = pgTable(
  'stk_avisos',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    empresaId: uuid().notNull().references(() => empresas.id),
    articuloId: uuid().notNull(),
    almacenId: uuid().notNull(),
    tipo: text().notNull(), // negativo | minimo
    fecha: day().notNull(),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.articuloId, t.almacenId, t.tipo, t.fecha)],
);


