// Recursos y enumeraciones del módulo CPR (compras y proveedores)
import { defineResource, enumOptions } from '../resource';

export const SOLICITUD_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente de aprobar', tone: 'orange' },
  { value: 'aprobada', label: 'Aprobada', tone: 'violet' },
  { value: 'rechazada', label: 'Rechazada', tone: 'red' },
  { value: 'pedida', label: 'Pedida', tone: 'green' },
] as const);

export const INCIDENCIA_TIPOS = enumOptions([
  { value: 'faltante', label: 'Falta mercancía', tone: 'orange' },
  { value: 'danado', label: 'Llega dañado', tone: 'red' },
  { value: 'erroneo', label: 'Artículo equivocado', tone: 'yellow' },
  { value: 'retraso', label: 'Retraso en la entrega', tone: 'brown' },
  { value: 'otro', label: 'Otra incidencia', tone: 'gray' },
] as const);

export const INCIDENCIA_ESTADOS = enumOptions([
  { value: 'abierta', label: 'Abierta', tone: 'orange' },
  { value: 'resuelta', label: 'Resuelta', tone: 'green' },
] as const);

export const solicitudResource = defineResource({
  key: 'cpr.solicitudes',
  module: 'cpr',
  label: 'Solicitud de compra',
  plural: 'Solicitudes de compra',
  icon: 'ShoppingCart',
  titleField: 'descripcion',
  subtitleField: 'estado',
  fields: {
    descripcion: { type: 'text', label: '¿Qué necesitas?', required: true, max: 300, colSpan: 2 },
    articuloId: { type: 'ref', ref: 'articulos', label: 'Artículo del catálogo', help: 'Opcional: si está en el catálogo, elígelo' },
    cantidad: { type: 'number', label: 'Cantidad', min: 0.001, decimals: 3, default: 1, required: true },
    importeEstimado: { type: 'money', label: 'Importe estimado (sin IVA)', min: 0 },
    proveedorId: { type: 'ref', ref: 'proveedores', label: 'Proveedor sugerido' },
    proyectoId: { type: 'ref', ref: 'proyectos', label: 'Proyecto' },
    fechaNecesaria: { type: 'date', label: 'Lo necesito antes del' },
    motivo: { type: 'textarea', label: 'Motivo', colSpan: 2 },
    estado: { type: 'enum', label: 'Estado', options: SOLICITUD_ESTADOS, readOnly: true },
    solicitanteId: { type: 'ref', ref: 'personas', label: 'Solicitante', readOnly: true },
  },
  list: ['descripcion', 'solicitanteId', 'cantidad', 'importeEstimado', 'fechaNecesaria', 'estado'],
  searchable: ['descripcion', 'motivo'],
  filters: ['estado', 'solicitanteId', 'proveedorId'],
  defaultSort: { field: 'creadoEn', dir: 'desc' },
});

export const articuloProveedorResource = defineResource({
  key: 'cpr.articulo_proveedor',
  module: 'cpr',
  label: 'Precio de proveedor',
  plural: 'Precios de proveedor',
  icon: 'Tags',
  titleField: 'proveedorId',
  fields: {
    articuloId: { type: 'ref', ref: 'articulos', label: 'Artículo', required: true },
    proveedorId: { type: 'ref', ref: 'proveedores', label: 'Proveedor', required: true },
    referenciaProveedor: { type: 'text', label: 'Referencia del proveedor', max: 80 },
    precio: { type: 'money', label: 'Precio de compra', min: 0, decimals: 4, required: true },
    descuento: { type: 'percent', label: 'Descuento %', min: 0, max: 100 },
    plazoDias: { type: 'int', label: 'Plazo de entrega (días)', min: 0, default: 3 },
    cantidadMinima: { type: 'number', label: 'Cantidad mínima', min: 0, decimals: 3 },
    preferente: { type: 'bool', label: 'Proveedor preferente' },
  },
  list: ['proveedorId', 'articuloId', 'referenciaProveedor', 'precio', 'plazoDias', 'preferente'],
  searchable: ['referenciaProveedor'],
  filters: ['articuloId', 'proveedorId', 'preferente'],
  defaultSort: { field: 'precio', dir: 'asc' },
});

export const incidenciaResource = defineResource({
  key: 'cpr.incidencias',
  module: 'cpr',
  label: 'Incidencia de recepción',
  plural: 'Incidencias de recepción',
  icon: 'AlertTriangle',
  titleField: 'descripcion',
  fields: {
    documentoId: { type: 'ref', ref: 'documentos', label: 'Recepción', required: true },
    articuloId: { type: 'ref', ref: 'articulos', label: 'Artículo' },
    tipo: { type: 'enum', label: 'Tipo', options: INCIDENCIA_TIPOS, default: 'danado', required: true },
    cantidad: { type: 'number', label: 'Cantidad afectada', min: 0, decimals: 3 },
    descripcion: { type: 'textarea', label: 'Descripción', required: true, colSpan: 2 },
    archivoId: { type: 'file', label: 'Foto' },
    estado: { type: 'enum', label: 'Estado', options: INCIDENCIA_ESTADOS, default: 'abierta' },
  },
  list: ['descripcion', 'tipo', 'articuloId', 'cantidad', 'estado'],
  filters: ['tipo', 'estado'],
});

/** Campos detectados en una factura de proveedor en PDF. */
export interface FacturaDetectada {
  nif: string | null;
  numero: string | null;
  fecha: string | null;
  base: number | null;
  iva: number | null;
  ivaTipo: number | null;
  total: number | null;
  proveedorId: string | null;
  proveedor: string | null;
}
