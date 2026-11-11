// Recursos y enumeraciones del módulo GAS (Gastos y dietas)
import { defineResource, enumOptions } from '../resource';

export const GASTO_TIPOS = enumOptions([
  { value: 'ticket', label: 'Ticket o factura', tone: 'violet' },
  { value: 'kilometraje', label: 'Kilometraje', tone: 'green' },
  { value: 'dieta', label: 'Dieta', tone: 'yellow' },
  { value: 'tarjeta', label: 'Tarjeta de empresa', tone: 'brown' },
] as const);
export type GastoTipo = (typeof GASTO_TIPOS)[number]['value'];

export const GASTO_CATEGORIAS = enumOptions([
  { value: 'comida', label: 'Comida' },
  { value: 'alojamiento', label: 'Alojamiento' },
  { value: 'combustible', label: 'Combustible' },
  { value: 'transporte', label: 'Transporte y peajes' },
  { value: 'parking', label: 'Aparcamiento' },
  { value: 'material', label: 'Material' },
  { value: 'otros', label: 'Otros' },
] as const);

export const GASTO_ESTADOS = enumOptions([
  { value: 'borrador', label: 'Borrador', tone: 'gray' },
  { value: 'enviado', label: 'Pendiente de aprobar', tone: 'orange' },
  { value: 'aprobado', label: 'Aprobado', tone: 'blue' },
  { value: 'rechazado', label: 'Rechazado', tone: 'red' },
  { value: 'liquidado', label: 'Pagado', tone: 'green' },
] as const);
export type GastoEstado = (typeof GASTO_ESTADOS)[number]['value'];

export const LIQUIDACION_VIAS = enumOptions([
  { value: 'nomina', label: 'En la nómina' },
  { value: 'transferencia', label: 'Por transferencia' },
] as const);

export const IVA_GASTO = [21, 10, 4, 0] as const;

/** Cuenta de gasto del PGC según el tipo y la categoría del gasto. */
export function cuentaGasto(tipo: string, categoria?: string | null): string {
  if (categoria === 'combustible') return '6280000';
  if (categoria === 'transporte' || categoria === 'parking') return '6240000';
  if (categoria === 'material') return '6020000';
  if (tipo === 'kilometraje') return '6290001';
  if (tipo === 'dieta' || categoria === 'comida' || categoria === 'alojamiento') return '6290002';
  return '6290000';
}

export const tarjetaResource = defineResource({
  key: 'gas.tarjetas',
  module: 'gas',
  label: 'Tarjeta de empresa',
  plural: 'Tarjetas de empresa',
  icon: 'CreditCard',
  titleField: 'nombre',
  subtitleField: 'ultimos4',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true, placeholder: 'p. ej. Visa comercial Marta' },
    ultimos4: { type: 'text', label: 'Últimos 4 dígitos', required: true, max: 4 },
    personaId: { type: 'ref', ref: 'personas', label: 'Titular', required: true },
    cuentaContable: { type: 'text', label: 'Cuenta del banco que la carga', max: 12, default: '5720001', help: 'Subcuenta 572 desde la que se pagan los cargos' },
    limiteMensual: { type: 'money', label: 'Límite mensual', min: 0 },
    activo: { type: 'bool', label: 'Activa', default: true },
  },
  list: ['nombre', 'ultimos4', 'personaId', 'limiteMensual', 'activo'],
  searchable: ['nombre', 'ultimos4'],
  filters: ['personaId', 'activo'],
  defaultSort: { field: 'nombre', dir: 'asc' },
});
