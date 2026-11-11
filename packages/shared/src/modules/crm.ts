import { defineResource, enumOptions } from '../resource';

export const ACTIVIDAD_TIPOS = enumOptions([
  { value: 'llamada', label: 'Llamada', tone: 'violet' },
  { value: 'email', label: 'Email', tone: 'blue' },
  { value: 'visita', label: 'Visita', tone: 'green' },
  { value: 'reunion', label: 'Reunión', tone: 'purple' },
  { value: 'nota', label: 'Nota', tone: 'gray' },
] as const);

export const ACTIVIDAD_RESULTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'yellow' },
  { value: 'realizada', label: 'Realizada', tone: 'green' },
  { value: 'sin_respuesta', label: 'Sin respuesta', tone: 'orange' },
  { value: 'cancelada', label: 'Cancelada', tone: 'gray' },
] as const);

export const actividadResource = defineResource({
  key: 'crm.actividades',
  module: 'crm',
  label: 'Actividad',
  plural: 'Actividad comercial',
  icon: 'MessageSquare',
  titleField: 'asunto',
  subtitleField: 'terceroId',
  fields: {
    tipo: { type: 'enum', label: 'Tipo', options: ACTIVIDAD_TIPOS, required: true, default: 'llamada' },
    asunto: { type: 'text', label: 'Asunto', required: true, max: 200 },
    terceroId: { type: 'ref', ref: 'terceros', label: 'Cliente', required: true },
    contactoId: { type: 'ref', ref: 'contactos', label: 'Contacto' },
    fecha: { type: 'datetime', label: 'Fecha y hora', required: true },
    duracionMin: { type: 'int', label: 'Duración (min)', min: 0 },
    estado: { type: 'enum', label: 'Estado', options: ACTIVIDAD_RESULTADOS, default: 'realizada' },
    descripcion: { type: 'textarea', label: 'Notas', colSpan: 2 },
    proximaAccion: { type: 'text', label: 'Próxima acción', max: 200 },
    proximaFecha: { type: 'date', label: 'Fecha de la próxima acción' },
    personaId: { type: 'ref', ref: 'personas', label: 'Responsable' },
    oportunidadId: { type: 'ref', ref: 'oportunidades', label: 'Oportunidad' },
  },
  sections: [
    { title: 'Actividad', fields: ['tipo', 'estado', 'asunto', 'fecha', 'duracionMin', 'terceroId', 'contactoId', 'oportunidadId', 'descripcion'] },
    { title: 'Seguimiento', fields: ['proximaAccion', 'proximaFecha', 'personaId'] },
  ],
  list: ['fecha', 'tipo', 'asunto', 'terceroId', 'estado', 'personaId', 'proximaFecha'],
  searchable: ['asunto', 'descripcion', 'proximaAccion'],
  filters: ['tipo', 'estado', 'personaId', 'terceroId'],
  defaultSort: { field: 'fecha', dir: 'desc' },
});
