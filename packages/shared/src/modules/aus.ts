// Recursos y enumeraciones del módulo AUS (Vacaciones y ausencias)
import { defineResource, enumOptions } from '../resource';

export const UNIDADES_SALDO = enumOptions([
  { value: 'laborables', label: 'Días laborables' },
  { value: 'naturales', label: 'Días naturales' },
] as const);

export const SOLICITUD_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'orange' },
  { value: 'aprobada_responsable', label: 'Pendiente de RRHH', tone: 'yellow' },
  { value: 'aprobada', label: 'Aprobada', tone: 'green' },
  { value: 'rechazada', label: 'Rechazada', tone: 'red' },
  { value: 'cancelada', label: 'Cancelada', tone: 'gray' },
] as const);
export type SolicitudEstado = (typeof SOLICITUD_ESTADOS)[number]['value'];

export const MEDIO_DIA = enumOptions([
  { value: 'manana', label: 'Mañana' },
  { value: 'tarde', label: 'Tarde' },
] as const);

export const tipoAusenciaResource = defineResource({
  key: 'aus.tipos',
  module: 'aus',
  label: 'Tipo de ausencia',
  plural: 'Tipos de ausencia',
  icon: 'Tags',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true },
    codigo: { type: 'text', label: 'Código', max: 20, help: 'Abreviatura para el calendario (VAC, AP, BM…)' },
    color: { type: 'color', label: 'Color en el calendario', default: '#35AE29' },
    retribuido: { type: 'bool', label: 'Retribuido', default: true },
    descuentaSaldo: { type: 'bool', label: 'Descuenta del saldo anual', default: false },
    diasAnuales: { type: 'number', label: 'Días por año', min: 0, decimals: 1, help: 'Saldo que se asigna cada año (vacaciones, asuntos propios)' },
    unidad: { type: 'enum', label: 'Se cuenta en', options: UNIDADES_SALDO, default: 'laborables' },
    requiereJustificante: { type: 'bool', label: 'Requiere justificante', default: false },
    permiteMedioDia: { type: 'bool', label: 'Permite medio día', default: true },
    dosNiveles: { type: 'bool', label: 'Aprobación en dos niveles', default: false, help: 'Primero el responsable y después RRHH' },
    soloRrhh: { type: 'bool', label: 'Solo lo registra RRHH', default: false, help: 'Bajas médicas, permisos por nacimiento…' },
    maxArrastre: { type: 'number', label: 'Máximo de días que pasan al año siguiente', min: 0, decimals: 1, default: 0 },
    activo: { type: 'bool', label: 'Activo', default: true },
  },
  sections: [
    { title: 'Tipo', fields: ['nombre', 'codigo', 'color', 'activo'] },
    { title: 'Saldo', fields: ['descuentaSaldo', 'diasAnuales', 'unidad', 'maxArrastre'] },
    { title: 'Reglas', fields: ['retribuido', 'requiereJustificante', 'permiteMedioDia', 'dosNiveles', 'soloRrhh'] },
  ],
  list: ['nombre', 'codigo', 'retribuido', 'descuentaSaldo', 'diasAnuales', 'activo'],
  searchable: ['nombre', 'codigo'],
  defaultSort: { field: 'nombre', dir: 'asc' },
});

export const saldoResource = defineResource({
  key: 'aus.saldos',
  module: 'aus',
  label: 'Saldo',
  plural: 'Saldos',
  icon: 'Scale',
  titleField: 'personaId',
  fields: {
    personaId: { type: 'ref', ref: 'personas', label: 'Persona', required: true },
    tipoId: { type: 'ref', ref: 'aus.tipos', label: 'Tipo', required: true },
    anio: { type: 'int', label: 'Año', required: true, min: 2000, max: 2100 },
    dias: { type: 'number', label: 'Días asignados', required: true, min: 0, decimals: 1 },
    arrastre: { type: 'number', label: 'Arrastre del año anterior', min: 0, decimals: 1, default: 0 },
    ajuste: { type: 'number', label: 'Ajuste (+/-)', decimals: 1, default: 0, help: 'Días extra por antigüedad, compensaciones…' },
    notas: { type: 'text', label: 'Notas', colSpan: 2 },
  },
  list: ['personaId', 'tipoId', 'anio', 'dias', 'arrastre', 'ajuste'],
  filters: ['tipoId', 'anio', 'personaId'],
  defaultSort: { field: 'anio', dir: 'desc' },
});

export const minimoResource = defineResource({
  key: 'aus.minimos',
  module: 'aus',
  label: 'Mínimo de personal',
  plural: 'Mínimos de personal',
  icon: 'Users',
  titleField: 'departamentoId',
  fields: {
    departamentoId: { type: 'ref', ref: 'departamentos', label: 'Departamento', required: true },
    minimo: { type: 'int', label: 'Personas presentes como mínimo', required: true, min: 0 },
  },
  list: ['departamentoId', 'minimo'],
});

export interface SaldoResumen {
  tipoId: string;
  tipo: string;
  color: string;
  unidad: string;
  anio: number;
  asignados: number;
  arrastre: number;
  ajuste: number;
  disfrutados: number;
  pendientes: number;
  disponibles: number;
}
