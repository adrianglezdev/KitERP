// Recursos y enumeraciones del módulo NOM (Nóminas)
import { defineResource, enumOptions } from '../resource';

export const PERIODO_ESTADOS = enumOptions([
  { value: 'abierto', label: 'Abierto', tone: 'blue' },
  { value: 'cerrado', label: 'Cerrado', tone: 'green' },
] as const);

export const VARIABLE_CONCEPTOS = enumOptions([
  { value: 'horas_extra', label: 'Horas extra', tone: 'violet' },
  { value: 'nocturnidad', label: 'Nocturnidad', tone: 'purple' },
  { value: 'dietas', label: 'Dietas y gastos', tone: 'brown' },
  { value: 'kilometraje', label: 'Kilometraje', tone: 'brown' },
  { value: 'comision', label: 'Comisión', tone: 'green' },
  { value: 'plus', label: 'Plus o incentivo', tone: 'green' },
  { value: 'anticipo', label: 'Anticipo (descuento)', tone: 'orange' },
  { value: 'embargo', label: 'Embargo (descuento)', tone: 'red' },
  { value: 'otro', label: 'Otro', tone: 'gray' },
] as const);

/** Conceptos que restan del neto. */
export const CONCEPTOS_DESCUENTO = ['anticipo', 'embargo'];

export const VARIABLE_ORIGENES = enumOptions([
  { value: 'manual', label: 'Manual' },
  { value: 'hor', label: 'Control horario' },
  { value: 'gas', label: 'Gastos' },
  { value: 'anticipo', label: 'Anticipo aprobado' },
] as const);

export const RECIBO_TIPOS = enumOptions([
  { value: 'nomina', label: 'Nómina', tone: 'violet' },
  { value: 'paga_extra', label: 'Paga extra', tone: 'green' },
  { value: 'finiquito', label: 'Finiquito', tone: 'red' },
  { value: 'certificado', label: 'Certificado', tone: 'blue' },
  { value: 'otro', label: 'Otro documento', tone: 'gray' },
] as const);

export const ANTICIPO_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'orange' },
  { value: 'aprobado', label: 'Aprobado', tone: 'green' },
  { value: 'rechazado', label: 'Rechazado', tone: 'red' },
] as const);

export const variableResource = defineResource({
  key: 'nom.variables',
  module: 'nom',
  label: 'Variable de nómina',
  plural: 'Variables de nómina',
  icon: 'ListPlus',
  titleField: 'concepto',
  fields: {
    periodoId: { type: 'ref', ref: 'nom.periodos', label: 'Periodo', required: true, hidden: true },
    personaId: { type: 'ref', ref: 'personas', label: 'Persona', required: true },
    concepto: { type: 'enum', label: 'Concepto', options: VARIABLE_CONCEPTOS, required: true, default: 'plus' },
    descripcion: { type: 'text', label: 'Descripción', colSpan: 2 },
    cantidad: { type: 'number', label: 'Cantidad (horas, km…)', decimals: 2 },
    importe: { type: 'money', label: 'Importe', required: true },
    origen: { type: 'enum', label: 'Origen', options: VARIABLE_ORIGENES, readOnly: true },
  },
  list: ['personaId', 'concepto', 'descripcion', 'cantidad', 'importe', 'origen'],
  filters: ['concepto', 'personaId'],
  defaultSort: { field: 'personaId', dir: 'asc' },
});

export interface TotalesNomina {
  bruto: number;
  ssEmpresa: number;
  ssTrabajador: number;
  irpf: number;
  neto: number;
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const nombrePeriodo = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`;

/** Expresión para detectar DNI/NIE en el texto de un recibo. */
export const DNI_REGEX = /\b([XYZ]\s?-?\d{7}\s?-?[A-Z]|\d{8}\s?-?[A-Z])\b/g;
