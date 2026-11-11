// Recursos y enumeraciones del módulo PRY (proyectos y partes)
import { defineResource, enumOptions } from '../resource';

export const PROYECTO_ESTADOS = enumOptions([
  { value: 'planificado', label: 'Planificado', tone: 'gray' },
  { value: 'en_curso', label: 'En curso', tone: 'blue' },
  { value: 'pausado', label: 'En pausa', tone: 'yellow' },
  { value: 'terminado', label: 'Terminado', tone: 'green' },
  { value: 'cancelado', label: 'Cancelado', tone: 'red' },
] as const);

export const FACTURACION_TIPOS = enumOptions([
  { value: 'hitos', label: 'Por hitos' },
  { value: 'avance', label: 'Por avance de obra' },
  { value: 'horas', label: 'Por horas trabajadas' },
] as const);

export const TAREA_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'gray' },
  { value: 'en_curso', label: 'En curso', tone: 'blue' },
  { value: 'revision', label: 'En revisión', tone: 'yellow' },
  { value: 'hecha', label: 'Hecha', tone: 'green' },
] as const);

export const PRIORIDADES = enumOptions([
  { value: 'baja', label: 'Baja', tone: 'gray' },
  { value: 'normal', label: 'Normal', tone: 'blue' },
  { value: 'alta', label: 'Alta', tone: 'red' },
] as const);

export const PARTIDA_TIPOS = enumOptions([
  { value: 'mano_obra', label: 'Mano de obra', tone: 'violet' },
  { value: 'material', label: 'Material', tone: 'green' },
  { value: 'subcontrata', label: 'Subcontrata', tone: 'brown' },
  { value: 'otros', label: 'Otros', tone: 'gray' },
] as const);

export const HITO_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'gray' },
  { value: 'listo', label: 'Listo para facturar', tone: 'yellow' },
  { value: 'facturado', label: 'Facturado', tone: 'green' },
] as const);

export const proyectoResource = defineResource({
  key: 'pry.proyectos',
  module: 'pry',
  label: 'Proyecto',
  plural: 'Proyectos',
  icon: 'KanbanSquare',
  titleField: 'nombre',
  subtitleField: 'codigo',
  fields: {
    codigo: { type: 'text', label: 'Código', readOnly: true },
    nombre: { type: 'text', label: 'Nombre', required: true, max: 200, colSpan: 2 },
    clienteId: { type: 'ref', ref: 'clientes', label: 'Cliente' },
    responsableId: { type: 'ref', ref: 'personas', label: 'Responsable' },
    estado: { type: 'enum', label: 'Estado', options: PROYECTO_ESTADOS, default: 'planificado', required: true },
    tipoFacturacion: { type: 'enum', label: 'Facturación', options: FACTURACION_TIPOS, default: 'hitos' },
    fechaInicio: { type: 'date', label: 'Inicio' },
    fechaFin: { type: 'date', label: 'Fin previsto' },
    presupuestoId: { type: 'ref', ref: 'documentos', label: 'Presupuesto de venta', refFilter: { tipo: 'presupuesto' } },
    presupuestoVenta: { type: 'money', label: 'Venta prevista', min: 0 },
    presupuestoCoste: { type: 'money', label: 'Coste previsto', min: 0 },
    miembros: { type: 'refs', ref: 'personas', label: 'Equipo' },
    color: { type: 'color', label: 'Color', default: '#35AE29' },
    descripcion: { type: 'textarea', label: 'Descripción', colSpan: 2 },
  },
  sections: [
    { title: 'Proyecto', fields: ['nombre', 'clienteId', 'responsableId', 'estado', 'fechaInicio', 'fechaFin', 'color', 'descripcion'] },
    { title: 'Económico', fields: ['tipoFacturacion', 'presupuestoId', 'presupuestoVenta', 'presupuestoCoste'] },
    { title: 'Equipo', fields: ['miembros'] },
  ],
  list: ['codigo', 'nombre', 'clienteId', 'responsableId', 'estado', 'fechaFin'],
  searchable: ['codigo', 'nombre'],
  filters: ['estado', 'clienteId', 'responsableId'],
  defaultSort: { field: 'creadoEn', dir: 'desc' },
});

export const faseResource = defineResource({
  key: 'pry.fases',
  module: 'pry',
  label: 'Fase',
  plural: 'Fases',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true },
    orden: { type: 'int', label: 'Orden', default: 0 },
    fechaInicio: { type: 'date', label: 'Inicio' },
    fechaFin: { type: 'date', label: 'Fin' },
  },
  list: ['nombre', 'fechaInicio', 'fechaFin'],
  defaultSort: { field: 'orden', dir: 'asc' },
});

export const tareaResource = defineResource({
  key: 'pry.tareas',
  module: 'pry',
  label: 'Tarea',
  plural: 'Tareas',
  titleField: 'titulo',
  fields: {
    titulo: { type: 'text', label: 'Tarea', required: true, max: 200, colSpan: 2 },
    faseId: { type: 'ref', ref: 'pry_fases', label: 'Fase' },
    asignadoId: { type: 'ref', ref: 'personas', label: 'Asignada a' },
    estado: { type: 'enum', label: 'Estado', options: TAREA_ESTADOS, default: 'pendiente' },
    prioridad: { type: 'enum', label: 'Prioridad', options: PRIORIDADES, default: 'normal' },
    fechaInicio: { type: 'date', label: 'Inicio' },
    fechaFin: { type: 'date', label: 'Fin' },
    estimacionHoras: { type: 'number', label: 'Horas estimadas', min: 0, decimals: 2 },
    dependeDeId: { type: 'ref', ref: 'pry_tareas', label: 'Depende de', help: 'No debería empezar hasta que esa tarea esté hecha' },
    partidaId: { type: 'ref', ref: 'pry_partidas', label: 'Partida' },
    descripcion: { type: 'textarea', label: 'Descripción', colSpan: 2 },
  },
  list: ['titulo', 'faseId', 'asignadoId', 'estado', 'fechaFin', 'estimacionHoras'],
  searchable: ['titulo'],
  filters: ['estado', 'asignadoId', 'faseId'],
  defaultSort: { field: 'orden', dir: 'asc' },
});

export const partidaResource = defineResource({
  key: 'pry.partidas',
  module: 'pry',
  label: 'Partida',
  plural: 'Partidas',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Partida', required: true, max: 200, colSpan: 2 },
    tipo: { type: 'enum', label: 'Tipo', options: PARTIDA_TIPOS, default: 'mano_obra' },
    horasPrevistas: { type: 'number', label: 'Horas previstas', min: 0, decimals: 2 },
    costePrevisto: { type: 'money', label: 'Coste previsto', min: 0 },
    ventaPrevista: { type: 'money', label: 'Venta prevista', min: 0 },
  },
  list: ['nombre', 'tipo', 'horasPrevistas', 'costePrevisto', 'ventaPrevista'],
  defaultSort: { field: 'orden', dir: 'asc' },
});

export const imputacionResource = defineResource({
  key: 'pry.imputaciones',
  module: 'pry',
  label: 'Imputación de horas',
  plural: 'Horas imputadas',
  icon: 'Clock',
  titleField: 'descripcion',
  fields: {
    proyectoId: { type: 'ref', ref: 'proyectos', label: 'Proyecto', required: true },
    tareaId: { type: 'ref', ref: 'pry_tareas', label: 'Tarea' },
    partidaId: { type: 'ref', ref: 'pry_partidas', label: 'Partida' },
    personaId: { type: 'ref', ref: 'personas', label: 'Persona' },
    fecha: { type: 'date', label: 'Fecha', required: true },
    horas: { type: 'number', label: 'Horas', min: 0.05, max: 24, decimals: 2, required: true },
    descripcion: { type: 'text', label: 'Qué has hecho', max: 500 },
  },
  list: ['fecha', 'personaId', 'proyectoId', 'tareaId', 'horas', 'descripcion'],
  defaultSort: { field: 'fecha', dir: 'desc' },
});

export const hitoResource = defineResource({
  key: 'pry.hitos',
  module: 'pry',
  label: 'Hito de facturación',
  plural: 'Hitos de facturación',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Hito', required: true, max: 200, colSpan: 2 },
    fecha: { type: 'date', label: 'Fecha prevista' },
    porcentaje: { type: 'percent', label: '% del total', min: 0, max: 100 },
    importe: { type: 'money', label: 'Importe (sin IVA)', min: 0, required: true },
    ivaTipo: { type: 'number', label: 'IVA %', default: 21, min: 0, max: 100, decimals: 0 },
    estado: { type: 'enum', label: 'Estado', options: HITO_ESTADOS, default: 'pendiente' },
  },
  list: ['nombre', 'fecha', 'porcentaje', 'importe', 'estado'],
  defaultSort: { field: 'fecha', dir: 'asc' },
});

export interface Rentabilidad {
  prevista: { venta: number; coste: number; margen: number; horas: number };
  real: { horas: number; costeHoras: number; material: number; compras: number; coste: number; facturado: number; margen: number; margenPct: number };
  comprometido: number;
  pendienteFacturar: number;
  avance: number;
  partidas: {
    id: string;
    nombre: string;
    tipo: string;
    horasPrevistas: number;
    costePrevisto: number;
    ventaPrevista: number;
    horas: number;
    costeReal: number;
    desviacionPct: number | null;
    alerta: boolean;
  }[];
  umbralDesviacion: number;
}
