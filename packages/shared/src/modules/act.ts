// Recursos y enumeraciones del módulo ACT (activos y flota)
import { defineResource, enumOptions } from '../resource';

export const ACTIVO_TIPOS = enumOptions([
  { value: 'vehiculo', label: 'Vehículo', tone: 'blue' },
  { value: 'maquinaria', label: 'Maquinaria', tone: 'brown' },
  { value: 'informatica', label: 'Informática', tone: 'violet' },
  { value: 'herramienta', label: 'Herramienta', tone: 'green' },
  { value: 'otro', label: 'Otro', tone: 'gray' },
] as const);

export const ACTIVO_ESTADOS = enumOptions([
  { value: 'activo', label: 'En uso', tone: 'green' },
  { value: 'taller', label: 'En taller', tone: 'yellow' },
  { value: 'disponible', label: 'Disponible', tone: 'blue' },
  { value: 'baja', label: 'De baja', tone: 'gray' },
] as const);

export const VENCIMIENTO_TIPOS = enumOptions([
  { value: 'itv', label: 'ITV', tone: 'blue' },
  { value: 'seguro', label: 'Seguro', tone: 'violet' },
  { value: 'revision', label: 'Revisión', tone: 'green' },
  { value: 'mantenimiento', label: 'Mantenimiento', tone: 'brown' },
  { value: 'calibracion', label: 'Calibración', tone: 'yellow' },
  { value: 'otro', label: 'Otro', tone: 'gray' },
] as const);

export const VENCIMIENTO_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'orange' },
  { value: 'hecho', label: 'Hecho', tone: 'green' },
  { value: 'cancelado', label: 'Cancelado', tone: 'gray' },
] as const);

export const REGISTRO_TIPOS = enumOptions([
  { value: 'preventivo', label: 'Mantenimiento preventivo', tone: 'green' },
  { value: 'correctivo', label: 'Mantenimiento correctivo', tone: 'orange' },
  { value: 'reparacion', label: 'Reparación', tone: 'red' },
  { value: 'combustible', label: 'Combustible', tone: 'blue' },
  { value: 'km', label: 'Lectura de kilómetros', tone: 'gray' },
  { value: 'multa', label: 'Multa', tone: 'red' },
  { value: 'otro', label: 'Otro gasto', tone: 'brown' },
] as const);

export const activoResource = defineResource({
  key: 'act.activos',
  module: 'act',
  label: 'Activo',
  plural: 'Activos',
  icon: 'Truck',
  titleField: 'nombre',
  subtitleField: 'codigo',
  fields: {
    codigo: { type: 'text', label: 'Código', readOnly: true },
    nombre: { type: 'text', label: 'Nombre', required: true, max: 200 },
    tipo: { type: 'enum', label: 'Tipo', options: ACTIVO_TIPOS, default: 'vehiculo', required: true },
    estado: { type: 'enum', label: 'Estado', options: ACTIVO_ESTADOS, default: 'activo' },
    marca: { type: 'text', label: 'Marca' },
    modelo: { type: 'text', label: 'Modelo' },
    numeroSerie: { type: 'text', label: 'Nº de serie / bastidor', max: 80 },
    matricula: { type: 'text', label: 'Matrícula', max: 20 },
    km: { type: 'int', label: 'Kilómetros', min: 0 },
    asignadoId: { type: 'ref', ref: 'personas', label: 'Asignado a' },
    centroId: { type: 'ref', ref: 'centros', label: 'Centro' },
    proyectoId: { type: 'ref', ref: 'proyectos', label: 'Proyecto' },
    proveedorId: { type: 'ref', ref: 'proveedores', label: 'Proveedor' },
    fechaCompra: { type: 'date', label: 'Fecha de compra' },
    valorCompra: { type: 'money', label: 'Valor de compra', min: 0 },
    vidaUtilMeses: { type: 'int', label: 'Vida útil (meses)', min: 1, max: 600 },
    valorResidual: { type: 'money', label: 'Valor residual', min: 0, default: 0 },
    cuentaActivo: { type: 'text', label: 'Cuenta de inmovilizado', max: 12, help: 'Por ejemplo 218 (elementos de transporte)' },
    cuentaAmortizacion: { type: 'text', label: 'Cuenta de amortización acumulada', max: 12, default: '281' },
    cuentaGasto: { type: 'text', label: 'Cuenta de gasto por amortización', max: 12, default: '681' },
    notas: { type: 'textarea', label: 'Notas', colSpan: 2 },
  },
  sections: [
    { title: 'Identificación', fields: ['nombre', 'tipo', 'estado', 'marca', 'modelo', 'numeroSerie', 'matricula', 'km'] },
    { title: 'Ubicación y uso', fields: ['asignadoId', 'centroId', 'proyectoId'] },
    { title: 'Compra y amortización', fields: ['proveedorId', 'fechaCompra', 'valorCompra', 'vidaUtilMeses', 'valorResidual', 'cuentaActivo', 'cuentaAmortizacion', 'cuentaGasto'] },
    { title: 'Otros', fields: ['notas'] },
  ],
  list: ['codigo', 'nombre', 'tipo', 'matricula', 'asignadoId', 'estado'],
  searchable: ['codigo', 'nombre', 'matricula', 'numeroSerie', 'marca', 'modelo'],
  filters: ['tipo', 'estado', 'asignadoId', 'centroId'],
  defaultSort: { field: 'codigo', dir: 'asc' },
});

export const vencimientoResource = defineResource({
  key: 'act.vencimientos',
  module: 'act',
  label: 'Vencimiento',
  plural: 'Vencimientos',
  icon: 'CalendarClock',
  titleField: 'descripcion',
  fields: {
    activoId: { type: 'ref', ref: 'activos', label: 'Activo', required: true },
    tipo: { type: 'enum', label: 'Tipo', options: VENCIMIENTO_TIPOS, default: 'itv', required: true },
    descripcion: { type: 'text', label: 'Descripción', max: 200 },
    fecha: { type: 'date', label: 'Vence el', required: true },
    avisoDias: { type: 'int', label: 'Avisar con (días)', min: 0, max: 365, default: 15 },
    periodicidadMeses: { type: 'int', label: 'Se repite cada (meses)', min: 0, max: 120, help: 'Al marcarlo como hecho se crea el siguiente' },
    costeEstimado: { type: 'money', label: 'Coste estimado', min: 0 },
    estado: { type: 'enum', label: 'Estado', options: VENCIMIENTO_ESTADOS, default: 'pendiente', readOnly: true },
  },
  list: ['fecha', 'activoId', 'tipo', 'descripcion', 'estado'],
  filters: ['activoId', 'tipo', 'estado'],
  defaultSort: { field: 'fecha', dir: 'asc' },
});

export const registroResource = defineResource({
  key: 'act.registros',
  module: 'act',
  label: 'Registro',
  plural: 'Mantenimientos y gastos',
  icon: 'Wrench',
  titleField: 'descripcion',
  fields: {
    activoId: { type: 'ref', ref: 'activos', label: 'Activo', required: true },
    tipo: { type: 'enum', label: 'Tipo', options: REGISTRO_TIPOS, default: 'preventivo', required: true },
    fecha: { type: 'date', label: 'Fecha', required: true },
    descripcion: { type: 'text', label: 'Descripción', max: 300 },
    coste: { type: 'money', label: 'Coste (sin IVA)', min: 0 },
    proveedorId: { type: 'ref', ref: 'proveedores', label: 'Proveedor / taller' },
    km: { type: 'int', label: 'Kilómetros', min: 0 },
    litros: { type: 'number', label: 'Litros', min: 0, decimals: 2 },
    archivoId: { type: 'file', label: 'Factura o ticket' },
  },
  list: ['fecha', 'activoId', 'tipo', 'descripcion', 'km', 'coste'],
  filters: ['activoId', 'tipo', 'proveedorId'],
  defaultSort: { field: 'fecha', dir: 'desc' },
});
