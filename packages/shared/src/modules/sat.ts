// Recursos y enumeraciones del módulo SAT (servicio técnico)
import { defineResource, enumOptions } from '../resource';

export const TICKET_ESTADOS = enumOptions([
  { value: 'nuevo', label: 'Nuevo', tone: 'violet' },
  { value: 'asignado', label: 'Asignado', tone: 'blue' },
  { value: 'en_curso', label: 'En curso', tone: 'yellow' },
  { value: 'esperando_cliente', label: 'Esperando al cliente', tone: 'orange' },
  { value: 'resuelto', label: 'Resuelto', tone: 'green' },
  { value: 'cerrado', label: 'Cerrado', tone: 'gray' },
] as const);
export type TicketEstado = (typeof TICKET_ESTADOS)[number]['value'];
export const TICKET_ABIERTOS: TicketEstado[] = ['nuevo', 'asignado', 'en_curso', 'esperando_cliente'];

export const PRIORIDADES = enumOptions([
  { value: 'baja', label: 'Baja', tone: 'gray' },
  { value: 'normal', label: 'Normal', tone: 'blue' },
  { value: 'alta', label: 'Alta', tone: 'orange' },
  { value: 'urgente', label: 'Urgente', tone: 'red' },
] as const);
export type Prioridad = (typeof PRIORIDADES)[number]['value'];

export const CANALES = enumOptions([
  { value: 'telefono', label: 'Teléfono' },
  { value: 'email', label: 'Email' },
  { value: 'portal', label: 'Portal del cliente' },
  { value: 'web', label: 'Web / código QR' },
] as const);

/** Plazos por defecto (horas) si el cliente no tiene contrato con SLA propio. */
export const SLA_DEFECTO: Record<Prioridad, { respuesta: number; resolucion: number }> = {
  urgente: { respuesta: 4, resolucion: 24 },
  alta: { respuesta: 8, resolucion: 48 },
  normal: { respuesta: 24, resolucion: 72 },
  baja: { respuesta: 48, resolucion: 120 },
};

export const ORDEN_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente de planificar', tone: 'gray' },
  { value: 'planificada', label: 'Planificada', tone: 'blue' },
  { value: 'en_ruta', label: 'En ruta', tone: 'violet' },
  { value: 'en_curso', label: 'En curso', tone: 'yellow' },
  { value: 'finalizada', label: 'Finalizada', tone: 'green' },
  { value: 'cancelada', label: 'Cancelada', tone: 'red' },
] as const);
export type OrdenEstado = (typeof ORDEN_ESTADOS)[number]['value'];
export const ORDEN_ABIERTAS: OrdenEstado[] = ['pendiente', 'planificada', 'en_ruta', 'en_curso'];

export const ORDEN_TIPOS = enumOptions([
  { value: 'correctivo', label: 'Correctivo', tone: 'orange' },
  { value: 'preventivo', label: 'Preventivo', tone: 'green' },
  { value: 'instalacion', label: 'Instalación', tone: 'violet' },
] as const);

export const PERIODICIDADES = enumOptions([
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
] as const);

export const CONTRATO_ESTADOS = enumOptions([
  { value: 'activo', label: 'Activo', tone: 'green' },
  { value: 'suspendido', label: 'Suspendido', tone: 'orange' },
  { value: 'finalizado', label: 'Finalizado', tone: 'gray' },
] as const);

export interface ChecklistItem {
  id: string;
  texto: string;
  obligatorio?: boolean;
  hecho?: boolean;
  nota?: string | null;
}

export const ticketResource = defineResource({
  key: 'sat.tickets',
  module: 'sat',
  label: 'Ticket',
  plural: 'Tickets',
  icon: 'LifeBuoy',
  titleField: 'asunto',
  subtitleField: 'codigo',
  fields: {
    codigo: { type: 'text', label: 'Código', readOnly: true },
    terceroId: { type: 'ref', ref: 'clientes', label: 'Cliente', required: true },
    contactoId: { type: 'ref', ref: 'contactos', label: 'Contacto' },
    equipoId: { type: 'ref', ref: 'sat_equipos', label: 'Equipo' },
    asunto: { type: 'text', label: 'Asunto', required: true, max: 200, colSpan: 2 },
    descripcion: { type: 'textarea', label: 'Descripción' },
    prioridad: { type: 'enum', label: 'Prioridad', options: PRIORIDADES, default: 'normal', required: true },
    canal: { type: 'enum', label: 'Canal', options: CANALES, default: 'telefono', required: true },
    responsableId: { type: 'ref', ref: 'personas', label: 'Técnico responsable' },
    estado: { type: 'enum', label: 'Estado', options: TICKET_ESTADOS, readOnly: true },
    creadoEn: { type: 'datetime', label: 'Abierto', readOnly: true },
    venceResolucion: { type: 'datetime', label: 'Resolver antes de', readOnly: true },
    slaIncumplido: { type: 'bool', label: 'SLA incumplido', readOnly: true },
    valoracion: { type: 'int', label: 'Valoración', readOnly: true },
  },
  sections: [
    { title: 'Cliente', fields: ['terceroId', 'contactoId', 'equipoId'] },
    { title: 'Incidencia', fields: ['asunto', 'descripcion', 'prioridad', 'canal', 'responsableId'] },
  ],
  list: ['codigo', 'asunto', 'terceroId', 'prioridad', 'estado', 'responsableId', 'venceResolucion'],
  searchable: ['codigo', 'asunto'],
  filters: ['estado', 'prioridad', 'canal', 'responsableId', 'terceroId', 'slaIncumplido'],
  defaultSort: { field: 'creadoEn', dir: 'desc' },
});

export const ordenResource = defineResource({
  key: 'sat.ordenes',
  module: 'sat',
  label: 'Orden de trabajo',
  plural: 'Órdenes de trabajo',
  icon: 'Wrench',
  titleField: 'codigo',
  subtitleField: 'descripcion',
  fields: {
    codigo: { type: 'text', label: 'Código', readOnly: true },
    terceroId: { type: 'ref', ref: 'clientes', label: 'Cliente', required: true },
    ticketId: { type: 'ref', ref: 'sat_tickets', label: 'Ticket' },
    equipoId: { type: 'ref', ref: 'sat_equipos', label: 'Equipo' },
    contratoId: { type: 'ref', ref: 'sat_contratos', label: 'Contrato' },
    tipo: { type: 'enum', label: 'Tipo', options: ORDEN_TIPOS, default: 'correctivo', required: true },
    prioridad: { type: 'enum', label: 'Prioridad', options: PRIORIDADES, default: 'normal', required: true },
    descripcion: { type: 'textarea', label: 'Trabajo a realizar' },
    tecnicoId: { type: 'ref', ref: 'sat_tecnicos', label: 'Técnico' },
    planificadaInicio: { type: 'datetime', label: 'Inicio previsto' },
    planificadaFin: { type: 'datetime', label: 'Fin previsto' },
    checklistId: { type: 'ref', ref: 'sat_checklists', label: 'Checklist' },
    facturable: { type: 'bool', label: 'Facturable', default: true, help: 'Desmárcalo si está en garantía o cubierto por contrato' },
    estado: { type: 'enum', label: 'Estado', options: ORDEN_ESTADOS, readOnly: true },
    finalizadaEn: { type: 'datetime', label: 'Finalizada', readOnly: true },
  },
  sections: [
    { title: 'Cliente', fields: ['terceroId', 'ticketId', 'equipoId', 'contratoId'] },
    { title: 'Trabajo', fields: ['tipo', 'prioridad', 'descripcion', 'checklistId', 'facturable'] },
    { title: 'Planificación', fields: ['tecnicoId', 'planificadaInicio', 'planificadaFin'] },
  ],
  list: ['codigo', 'terceroId', 'tipo', 'estado', 'tecnicoId', 'planificadaInicio', 'prioridad'],
  searchable: ['codigo', 'descripcion'],
  filters: ['estado', 'tipo', 'tecnicoId', 'terceroId', 'prioridad', 'contratoId'],
  defaultSort: { field: 'creadoEn', dir: 'desc' },
});

export const equipoResource = defineResource({
  key: 'sat.equipos',
  module: 'sat',
  label: 'Equipo instalado',
  plural: 'Equipos instalados',
  icon: 'AirVent',
  titleField: 'nombre',
  subtitleField: 'numeroSerie',
  fields: {
    terceroId: { type: 'ref', ref: 'clientes', label: 'Cliente', required: true },
    nombre: { type: 'text', label: 'Descripción', required: true, max: 200, placeholder: 'Split habitación 204' },
    articuloId: { type: 'ref', ref: 'articulos', label: 'Artículo del catálogo' },
    marca: { type: 'text', label: 'Marca' },
    modelo: { type: 'text', label: 'Modelo' },
    numeroSerie: { type: 'text', label: 'Número de serie', max: 100 },
    ubicacion: { type: 'text', label: 'Ubicación', placeholder: 'Planta 2, habitación 204' },
    fechaInstalacion: { type: 'date', label: 'Fecha de instalación' },
    garantiaHasta: { type: 'date', label: 'Garantía hasta' },
    contratoId: { type: 'ref', ref: 'sat_contratos', label: 'Contrato de mantenimiento' },
    notas: { type: 'textarea', label: 'Notas' },
  },
  sections: [
    { title: 'Equipo', fields: ['terceroId', 'nombre', 'articuloId', 'marca', 'modelo', 'numeroSerie'] },
    { title: 'Instalación', fields: ['ubicacion', 'fechaInstalacion', 'garantiaHasta', 'contratoId', 'notas'] },
  ],
  list: ['nombre', 'terceroId', 'marca', 'modelo', 'numeroSerie', 'garantiaHasta', 'contratoId'],
  searchable: ['nombre', 'marca', 'modelo', 'numeroSerie', 'ubicacion'],
  filters: ['terceroId', 'contratoId', 'articuloId'],
  defaultSort: { field: 'nombre', dir: 'asc' },
});

export const contratoResource = defineResource({
  key: 'sat.contratos',
  module: 'sat',
  label: 'Contrato de mantenimiento',
  plural: 'Contratos de mantenimiento',
  icon: 'FileCheck2',
  titleField: 'nombre',
  subtitleField: 'codigo',
  fields: {
    codigo: { type: 'text', label: 'Código', readOnly: true },
    terceroId: { type: 'ref', ref: 'clientes', label: 'Cliente', required: true },
    nombre: { type: 'text', label: 'Nombre', required: true, placeholder: 'Mantenimiento climatización' },
    estado: { type: 'enum', label: 'Estado', options: CONTRATO_ESTADOS, default: 'activo', required: true },
    inicio: { type: 'date', label: 'Inicio', required: true },
    fin: { type: 'date', label: 'Fin' },
    periodicidadMeses: { type: 'int', label: 'Visita preventiva cada (meses)', min: 1, max: 24, default: 6 },
    proximaVisita: { type: 'date', label: 'Próxima visita' },
    tecnicoId: { type: 'ref', ref: 'sat_tecnicos', label: 'Técnico habitual' },
    checklistId: { type: 'ref', ref: 'sat_checklists', label: 'Checklist de la visita' },
    slaRespuestaHoras: { type: 'int', label: 'SLA respuesta (horas)', min: 1, max: 720 },
    slaResolucionHoras: { type: 'int', label: 'SLA resolución (horas)', min: 1, max: 2160 },
    cuota: { type: 'money', label: 'Cuota', min: 0, help: 'Si indicas cuota se crea la facturación periódica' },
    cuotaPeriodicidad: { type: 'enum', label: 'Se factura', options: PERIODICIDADES, default: 'trimestral' },
    notas: { type: 'textarea', label: 'Condiciones y notas' },
  },
  sections: [
    { title: 'Contrato', fields: ['terceroId', 'nombre', 'estado', 'inicio', 'fin'] },
    { title: 'Visitas preventivas', fields: ['periodicidadMeses', 'proximaVisita', 'tecnicoId', 'checklistId'] },
    { title: 'Nivel de servicio', fields: ['slaRespuestaHoras', 'slaResolucionHoras'] },
    { title: 'Cuota', fields: ['cuota', 'cuotaPeriodicidad', 'notas'] },
  ],
  list: ['codigo', 'nombre', 'terceroId', 'estado', 'proximaVisita', 'cuota', 'fin'],
  searchable: ['codigo', 'nombre'],
  filters: ['estado', 'terceroId', 'tecnicoId'],
  defaultSort: { field: 'proximaVisita', dir: 'asc' },
});

export const checklistResource = defineResource({
  key: 'sat.checklists',
  module: 'sat',
  label: 'Checklist',
  plural: 'Plantillas de checklist',
  icon: 'ListChecks',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true },
    tipo: { type: 'enum', label: 'Para órdenes de tipo', options: ORDEN_TIPOS },
    items: { type: 'json', label: 'Puntos a revisar', default: [] },
    activo: { type: 'bool', label: 'Activa', default: true },
  },
  list: ['nombre', 'tipo', 'activo'],
  searchable: ['nombre'],
  filters: ['tipo', 'activo'],
  defaultSort: { field: 'nombre', dir: 'asc' },
});

/** Enlace a Google Maps para una dirección. */
export function mapsUrl(d: { direccion?: string | null; codigoPostal?: string | null; localidad?: string | null; provincia?: string | null; lat?: number | null; lng?: number | null } | null | undefined) {
  if (!d) return null;
  if (d.lat && d.lng) return `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`;
  const q = [d.direccion, d.codigoPostal, d.localidad, d.provincia].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
