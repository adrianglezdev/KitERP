// Recursos y enumeraciones del módulo CNT (Contabilidad e impuestos, PGC PYMES)
import { defineResource, enumOptions } from '../resource';

export const ASIENTO_ORIGENES = enumOptions([
  { value: 'manual', label: 'Manual', tone: 'gray' },
  { value: 'fac', label: 'Ventas', tone: 'violet' },
  { value: 'cpr', label: 'Compras', tone: 'brown' },
  { value: 'tes', label: 'Tesorería', tone: 'green' },
  { value: 'nom', label: 'Nóminas', tone: 'yellow' },
  { value: 'gas', label: 'Gastos', tone: 'orange' },
  { value: 'act', label: 'Amortizaciones', tone: 'blue' },
  { value: 'apertura', label: 'Apertura', tone: 'purple' },
  { value: 'regularizacion', label: 'Regularización', tone: 'purple' },
  { value: 'cierre', label: 'Cierre', tone: 'purple' },
] as const);

export const EJERCICIO_ESTADOS = enumOptions([
  { value: 'abierto', label: 'Abierto', tone: 'green' },
  { value: 'cerrado', label: 'Cerrado', tone: 'gray' },
] as const);

export const CUENTA_NATURALEZA = enumOptions([
  { value: 'activo', label: 'Activo' },
  { value: 'pasivo', label: 'Pasivo' },
  { value: 'patrimonio', label: 'Patrimonio neto' },
  { value: 'gasto', label: 'Gasto' },
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'mixta', label: 'Deudora o acreedora' },
] as const);

export const RETENCION_TIPOS = enumOptions([
  { value: 'ninguna', label: 'Sin retención' },
  { value: 'profesional', label: 'Profesional (modelo 111)' },
  { value: 'alquiler', label: 'Alquiler de local (modelo 115)' },
] as const);

/** Grupos del PGC. */
export const PGC_GRUPOS: Record<string, string> = {
  '1': 'Financiación básica',
  '2': 'Activo no corriente',
  '3': 'Existencias',
  '4': 'Acreedores y deudores por operaciones comerciales',
  '5': 'Cuentas financieras',
  '6': 'Compras y gastos',
  '7': 'Ventas e ingresos',
};

/** Las subcuentas tienen 7 o más dígitos; solo en ellas se puede anotar. */
export const DIGITOS_SUBCUENTA = 7;

export const subcuentaResource = defineResource({
  key: 'cnt.cuentas',
  module: 'cnt',
  label: 'Cuenta',
  plural: 'Plan de cuentas',
  icon: 'BookOpen',
  titleField: 'nombre',
  subtitleField: 'codigo',
  fields: {
    codigo: { type: 'text', label: 'Código', required: true, max: 12, help: 'Subcuenta de 7 o más dígitos (p. ej. 6290001)' },
    nombre: { type: 'text', label: 'Nombre', required: true, max: 200 },
  },
  list: ['codigo', 'nombre'],
  searchable: ['codigo', 'nombre'],
  defaultSort: { field: 'codigo', dir: 'asc' },
});

export const centroCosteResource = defineResource({
  key: 'cnt.centros',
  module: 'cnt',
  label: 'Centro de coste',
  plural: 'Centros de coste',
  icon: 'Network',
  titleField: 'nombre',
  subtitleField: 'codigo',
  fields: {
    codigo: { type: 'text', label: 'Código', required: true, max: 20 },
    nombre: { type: 'text', label: 'Nombre', required: true, max: 120 },
    activo: { type: 'bool', label: 'Activo', default: true },
  },
  list: ['codigo', 'nombre', 'activo'],
  searchable: ['codigo', 'nombre'],
  defaultSort: { field: 'codigo', dir: 'asc' },
});

export const terceroFiscalResource = defineResource({
  key: 'cnt.terceros_fiscal',
  module: 'cnt',
  label: 'Configuración fiscal del tercero',
  plural: 'Configuración fiscal de terceros',
  icon: 'Building2',
  titleField: 'terceroId',
  fields: {
    terceroId: { type: 'ref', ref: 'terceros', label: 'Cliente o proveedor', required: true },
    tipoRetencion: { type: 'enum', label: 'Retenciones que le practicamos', options: RETENCION_TIPOS, default: 'ninguna' },
    excluir347: { type: 'bool', label: 'Excluir del modelo 347' },
    cuentaGasto: { type: 'text', label: 'Cuenta de gasto habitual', max: 12, help: 'Opcional, p. ej. 6210000 para un alquiler' },
  },
  list: ['terceroId', 'tipoRetencion', 'excluir347', 'cuentaGasto'],
});

export interface CasillaModelo {
  casilla: string;
  concepto: string;
  importe: number;
  tipo?: 'base' | 'cuota' | 'total' | 'numero' | 'porcentaje';
  destacado?: boolean;
}
