// Recursos y enumeraciones del módulo STK (artículos y stock)
import { defineResource, enumOptions } from '../resource';

export const ALMACEN_TIPOS = enumOptions([
  { value: 'almacen', label: 'Almacén', tone: 'green' },
  { value: 'furgoneta', label: 'Furgoneta', tone: 'blue' },
] as const);

/** Tipos de movimiento. Las cantidades se guardan con signo: + entra, − sale. */
export const MOVIMIENTO_TIPOS = enumOptions([
  { value: 'entrada_compra', label: 'Entrada por compra', tone: 'green' },
  { value: 'salida_venta', label: 'Salida por venta', tone: 'violet' },
  { value: 'ajuste', label: 'Ajuste manual', tone: 'yellow' },
  { value: 'traspaso_salida', label: 'Traspaso (salida)', tone: 'blue' },
  { value: 'traspaso_entrada', label: 'Traspaso (entrada)', tone: 'blue' },
  { value: 'inventario', label: 'Regularización de inventario', tone: 'brown' },
  { value: 'consumo_proyecto', label: 'Consumo en proyecto', tone: 'orange' },
  { value: 'consumo_sat', label: 'Consumo en servicio técnico', tone: 'orange' },
  { value: 'devolucion', label: 'Devolución', tone: 'gray' },
] as const);
export type MovimientoTipo = (typeof MOVIMIENTO_TIPOS)[number]['value'];

export const SERIE_ESTADOS = enumOptions([
  { value: 'en_stock', label: 'En stock', tone: 'green' },
  { value: 'vendido', label: 'Vendido', tone: 'violet' },
  { value: 'instalado', label: 'Instalado', tone: 'blue' },
  { value: 'baja', label: 'Baja', tone: 'gray' },
] as const);

export const INVENTARIO_TIPOS = enumOptions([
  { value: 'total', label: 'Inventario total' },
  { value: 'ciclico', label: 'Recuento cíclico' },
] as const);

export const INVENTARIO_ESTADOS = enumOptions([
  { value: 'abierto', label: 'En recuento', tone: 'yellow' },
  { value: 'confirmado', label: 'Confirmado', tone: 'green' },
  { value: 'cancelado', label: 'Cancelado', tone: 'gray' },
] as const);

export const almacenResource = defineResource({
  key: 'stk.almacenes',
  module: 'stk',
  label: 'Almacén',
  plural: 'Almacenes',
  icon: 'Warehouse',
  titleField: 'nombre',
  subtitleField: 'tipo',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true, max: 120 },
    tipo: { type: 'enum', label: 'Tipo', options: ALMACEN_TIPOS, default: 'almacen', required: true },
    centroId: { type: 'ref', ref: 'centros', label: 'Centro de trabajo' },
    personaId: { type: 'ref', ref: 'personas', label: 'Responsable', help: 'En una furgoneta, el técnico que la lleva' },
    porDefecto: { type: 'bool', label: 'Almacén principal', help: 'Se usa cuando un documento no indica almacén' },
    activo: { type: 'bool', label: 'Activo', default: true },
    notas: { type: 'textarea', label: 'Notas', colSpan: 2 },
  },
  list: ['nombre', 'tipo', 'centroId', 'personaId', 'porDefecto', 'activo'],
  searchable: ['nombre'],
  filters: ['tipo', 'centroId', 'activo'],
  defaultSort: { field: 'nombre', dir: 'asc' },
});

export const ubicacionResource = defineResource({
  key: 'stk.ubicaciones',
  module: 'stk',
  label: 'Ubicación',
  plural: 'Ubicaciones',
  icon: 'MapPin',
  titleField: 'codigo',
  subtitleField: 'descripcion',
  fields: {
    almacenId: { type: 'ref', ref: 'almacenes', label: 'Almacén', required: true },
    codigo: { type: 'text', label: 'Código', required: true, max: 40, help: 'Pasillo-estantería-hueco, p. ej. A-02-3' },
    descripcion: { type: 'text', label: 'Descripción' },
  },
  list: ['codigo', 'almacenId', 'descripcion'],
  searchable: ['codigo', 'descripcion'],
  filters: ['almacenId'],
  defaultSort: { field: 'codigo', dir: 'asc' },
});

/** Configuración de stock de un artículo (mínimos, lotes, series). */
export const articuloConfigResource = defineResource({
  key: 'stk.articulo_config',
  module: 'stk',
  label: 'Configuración de stock',
  plural: 'Configuración de stock',
  titleField: 'stockMin',
  fields: {
    stockMin: { type: 'number', label: 'Stock mínimo', min: 0, decimals: 3, help: 'Por debajo se avisa al almacén' },
    puntoPedido: { type: 'number', label: 'Punto de pedido', min: 0, decimals: 3, help: 'Por debajo aparece en la propuesta de compra' },
    cantidadPedido: { type: 'number', label: 'Cantidad a pedir', min: 0, decimals: 3, help: 'Lote habitual de compra' },
    controlaLotes: { type: 'bool', label: 'Controla lotes y caducidad' },
    controlaSeries: { type: 'bool', label: 'Controla números de serie' },
    ubicacionId: { type: 'ref', ref: 'ubicaciones', label: 'Ubicación habitual' },
  },
  list: ['stockMin', 'puntoPedido', 'cantidadPedido', 'controlaLotes', 'controlaSeries'],
});

export interface StockFila {
  articuloId: string;
  referencia: string;
  nombre: string;
  unidad: string;
  familiaId: string | null;
  ean: string | null;
  fisico: number;
  reservado: number;
  disponible: number;
  valor: number;
  costeMedio: number;
  stockMin: number | null;
  puntoPedido: number | null;
  bajoMinimo: boolean;
}

export interface Disponibilidad {
  fisico: number;
  reservado: number;
  disponible: number;
}
