// Recursos y enumeraciones del módulo TES (Tesorería)
import { defineResource, enumOptions } from '../resource';

export const CUENTA_TIPOS = enumOptions([
  { value: 'banco', label: 'Cuenta bancaria', tone: 'violet' },
  { value: 'caja', label: 'Caja (efectivo)', tone: 'brown' },
] as const);

export const CIRCUITOS = enumOptions([
  { value: 'cobro', label: 'Cobro', tone: 'green' },
  { value: 'pago', label: 'Pago', tone: 'brown' },
] as const);

export const VENC_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'orange' },
  { value: 'remesado', label: 'En remesa', tone: 'blue' },
  { value: 'parcial', label: 'Parcial', tone: 'yellow' },
  { value: 'pagado', label: 'Pagado', tone: 'green' },
  { value: 'devuelto', label: 'Devuelto', tone: 'red' },
  { value: 'impagado', label: 'Impagado', tone: 'red' },
] as const);
export type VencEstado = (typeof VENC_ESTADOS)[number]['value'];

export const MEDIOS_PAGO = enumOptions([
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'recibo', label: 'Recibo domiciliado' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'pagare', label: 'Pagaré' },
  { value: 'compensacion', label: 'Compensación' },
  { value: 'devolucion', label: 'Devolución' },
] as const);

export const REMESA_TIPOS = enumOptions([
  { value: 'cobro', label: 'Recibos SEPA (adeudos directos)', tone: 'green' },
  { value: 'pago', label: 'Transferencias SEPA', tone: 'brown' },
] as const);

export const REMESA_ESTADOS = enumOptions([
  { value: 'generada', label: 'Generada', tone: 'gray' },
  { value: 'enviada', label: 'Enviada al banco', tone: 'blue' },
  { value: 'cobrada', label: 'Cerrada', tone: 'green' },
] as const);

export const MOV_ORIGENES = enumOptions([
  { value: 'n43', label: 'Norma 43' },
  { value: 'csv', label: 'CSV' },
  { value: 'manual', label: 'Manual' },
] as const);

export const MOV_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Sin conciliar', tone: 'orange' },
  { value: 'conciliado', label: 'Conciliado', tone: 'green' },
  { value: 'ignorado', label: 'Sin pareja', tone: 'gray' },
] as const);

export const cuentaBancariaResource = defineResource({
  key: 'tes.cuentas',
  module: 'tes',
  label: 'Cuenta de tesorería',
  plural: 'Bancos y cajas',
  icon: 'Landmark',
  titleField: 'nombre',
  subtitleField: 'iban',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true, placeholder: 'p. ej. CaixaBank principal' },
    tipo: { type: 'enum', label: 'Tipo', options: CUENTA_TIPOS, default: 'banco', required: true },
    iban: { type: 'iban', label: 'IBAN' },
    bic: { type: 'text', label: 'BIC', max: 11 },
    cuentaContable: { type: 'text', label: 'Cuenta contable', max: 12, help: 'Subcuenta 572 (bancos) o 570 (caja). Si la dejas vacía se asigna sola.' },
    saldoInicial: { type: 'money', label: 'Saldo inicial', default: 0 },
    fechaSaldo: { type: 'date', label: 'Fecha del saldo inicial' },
    sufijoSepa: { type: 'text', label: 'Sufijo acreedor SEPA', max: 3, help: 'Normalmente 000. Lo facilita el banco.', default: '000' },
    porDefecto: { type: 'bool', label: 'Cuenta por defecto para cobros y pagos' },
    activo: { type: 'bool', label: 'Activa', default: true },
  },
  sections: [
    { title: 'Datos de la cuenta', fields: ['nombre', 'tipo', 'iban', 'bic', 'porDefecto', 'activo'] },
    { title: 'Saldo y contabilidad', fields: ['saldoInicial', 'fechaSaldo', 'cuentaContable', 'sufijoSepa'] },
  ],
  list: ['nombre', 'tipo', 'iban', 'cuentaContable', 'activo'],
  searchable: ['nombre', 'iban'],
  filters: ['tipo', 'activo'],
  defaultSort: { field: 'nombre', dir: 'asc' },
});

/** Vencimiento manual (alquiler, préstamo, impuestos…) para la previsión de tesorería. */
export const vencimientoManualResource = defineResource({
  key: 'tes.vencimientos',
  module: 'tes',
  label: 'Vencimiento',
  plural: 'Vencimientos',
  icon: 'CalendarDays',
  titleField: 'concepto',
  fields: {
    circuito: { type: 'enum', label: 'Tipo', options: CIRCUITOS, default: 'pago', required: true },
    terceroId: { type: 'ref', ref: 'terceros', label: 'Cliente o proveedor' },
    concepto: { type: 'text', label: 'Concepto', required: true, max: 200 },
    fecha: { type: 'date', label: 'Vencimiento', required: true },
    importe: { type: 'money', label: 'Importe', required: true },
    cuentaContrapartida: { type: 'text', label: 'Cuenta contable de contrapartida', max: 12, help: 'Opcional: p. ej. 6210000 (alquiler) o 4750000 (Hacienda)' },
    notas: { type: 'textarea', label: 'Notas', colSpan: 2 },
  },
  list: ['fecha', 'concepto', 'terceroId', 'importe'],
  searchable: ['concepto'],
});
