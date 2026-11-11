import { enumOptions, type EnumOption } from '../resource';

export const TERCERO_ESTADOS = enumOptions([
  { value: 'potencial', label: 'Potencial', tone: 'yellow' },
  { value: 'cliente', label: 'Activo', tone: 'green' },
  { value: 'inactivo', label: 'Inactivo', tone: 'gray' },
] as const);

export const REGIMENES_IVA = enumOptions([
  { value: 'general', label: 'General' },
  { value: 'recargo', label: 'Recargo de equivalencia' },
  { value: 'exento', label: 'Exento' },
  { value: 'intracomunitario', label: 'Intracomunitario (UE)' },
  { value: 'exportacion', label: 'Exportación (fuera de la UE)' },
  { value: 'isp', label: 'Inversión del sujeto pasivo' },
] as const);

export const FORMA_PAGO_TIPOS = enumOptions([
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'domiciliacion', label: 'Recibo domiciliado (SEPA)' },
  { value: 'contado', label: 'Contado' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'pagare', label: 'Pagaré' },
  { value: 'confirming', label: 'Confirming' },
] as const);

export const ARTICULO_TIPOS = enumOptions([
  { value: 'producto', label: 'Producto', tone: 'green' },
  { value: 'servicio', label: 'Servicio', tone: 'violet' },
  { value: 'kit', label: 'Kit / escandallo', tone: 'brown' },
] as const);

export const UNIDADES = enumOptions([
  { value: 'ud', label: 'Unidad' },
  { value: 'h', label: 'Hora' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'm', label: 'Metro' },
  { value: 'm2', label: 'Metro cuadrado' },
  { value: 'm3', label: 'Metro cúbico' },
  { value: 'l', label: 'Litro' },
  { value: 'caja', label: 'Caja' },
  { value: 'servicio', label: 'Servicio' },
] as const);

export const CONTACTO_ROLES = enumOptions([
  { value: 'general', label: 'General' },
  { value: 'facturacion', label: 'Facturación' },
  { value: 'compras', label: 'Compras' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'direccion', label: 'Dirección' },
] as const);

/* ── Documentos comerciales (motor común de ventas y compras) ── */

export const DOC_TIPOS = enumOptions([
  { value: 'presupuesto', label: 'Presupuesto' },
  { value: 'pedido', label: 'Pedido' },
  { value: 'albaran', label: 'Albarán' },
  { value: 'factura', label: 'Factura' },
  { value: 'factura_rectificativa', label: 'Factura rectificativa' },
  { value: 'factura_simplificada', label: 'Factura simplificada' },
  { value: 'proforma', label: 'Proforma' },
  { value: 'pedido_compra', label: 'Pedido a proveedor' },
  { value: 'recepcion', label: 'Recepción' },
  { value: 'factura_proveedor', label: 'Factura de proveedor' },
] as const);
export type DocTipo = (typeof DOC_TIPOS)[number]['value'];

export const DOC_VENTA: DocTipo[] = ['presupuesto', 'pedido', 'albaran', 'factura', 'factura_rectificativa', 'factura_simplificada', 'proforma'];
export const DOC_COMPRA: DocTipo[] = ['pedido_compra', 'recepcion', 'factura_proveedor'];
export const DOC_FACTURAS: DocTipo[] = ['factura', 'factura_rectificativa', 'factura_simplificada'];

/** Módulo propietario de cada tipo de documento (para permisos y activación). */
export const DOC_MODULO: Record<DocTipo, string> = {
  presupuesto: 'pre',
  pedido: 'ped',
  albaran: 'ped',
  factura: 'fac',
  factura_rectificativa: 'fac',
  factura_simplificada: 'fac',
  proforma: 'fac',
  pedido_compra: 'cpr',
  recepcion: 'cpr',
  factura_proveedor: 'cpr',
};

export const DOC_ESTADOS: Record<DocTipo, readonly EnumOption[]> = {
  presupuesto: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'pendiente_aprobacion', label: 'Pendiente de aprobar', tone: 'orange' },
    { value: 'enviado', label: 'Enviado', tone: 'blue' },
    { value: 'visto', label: 'Visto', tone: 'violet' },
    { value: 'aceptado', label: 'Aceptado', tone: 'green' },
    { value: 'rechazado', label: 'Rechazado', tone: 'red' },
    { value: 'caducado', label: 'Caducado', tone: 'brown' },
  ],
  pedido: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'confirmado', label: 'Confirmado', tone: 'blue' },
    { value: 'en_preparacion', label: 'En preparación', tone: 'yellow' },
    { value: 'parcial', label: 'Servido en parte', tone: 'orange' },
    { value: 'servido', label: 'Servido', tone: 'green' },
    { value: 'cancelado', label: 'Cancelado', tone: 'red' },
  ],
  albaran: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'entregado', label: 'Entregado', tone: 'blue' },
    { value: 'facturado', label: 'Facturado', tone: 'green' },
  ],
  factura: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'emitida', label: 'Emitida', tone: 'violet' },
    { value: 'rectificada', label: 'Rectificada', tone: 'brown' },
  ],
  factura_rectificativa: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'emitida', label: 'Emitida', tone: 'violet' },
  ],
  factura_simplificada: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'emitida', label: 'Emitida', tone: 'violet' },
  ],
  proforma: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'enviada', label: 'Enviada', tone: 'blue' },
  ],
  pedido_compra: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'pendiente_aprobacion', label: 'Pendiente de aprobar', tone: 'orange' },
    { value: 'aprobado', label: 'Aprobado', tone: 'violet' },
    { value: 'enviado', label: 'Enviado', tone: 'blue' },
    { value: 'parcial', label: 'Recibido en parte', tone: 'yellow' },
    { value: 'recibido', label: 'Recibido', tone: 'green' },
    { value: 'cancelado', label: 'Cancelado', tone: 'red' },
  ],
  recepcion: [
    { value: 'borrador', label: 'Borrador', tone: 'gray' },
    { value: 'confirmada', label: 'Confirmada', tone: 'green' },
  ],
  factura_proveedor: [
    { value: 'borrador', label: 'Pendiente de revisar', tone: 'gray' },
    { value: 'discrepancia', label: 'Con discrepancias', tone: 'red' },
    { value: 'registrada', label: 'Registrada', tone: 'green' },
  ],
};

export const ESTADO_PAGO = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'orange' },
  { value: 'parcial', label: 'Parcial', tone: 'yellow' },
  { value: 'pagado', label: 'Pagado', tone: 'green' },
  { value: 'impagado', label: 'Impagado', tone: 'red' },
] as const);

export const TAREA_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'gray' },
  { value: 'en_curso', label: 'En curso', tone: 'blue' },
  { value: 'hecha', label: 'Hecha', tone: 'green' },
] as const);
