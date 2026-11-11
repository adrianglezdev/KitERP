// Recursos y enumeraciones del módulo ALT (Altas, bajas y evaluación)
import { defineResource, enumOptions } from '../resource';
import { TIPOS_CONTRATO } from './fic';

export const OFERTA_ESTADOS = enumOptions([
  { value: 'borrador', label: 'Borrador', tone: 'gray' },
  { value: 'abierta', label: 'Abierta', tone: 'green' },
  { value: 'pausada', label: 'En pausa', tone: 'yellow' },
  { value: 'cerrada', label: 'Cerrada', tone: 'brown' },
] as const);

export const CANDIDATO_ESTADOS = enumOptions([
  { value: 'nuevo', label: 'Nuevo', tone: 'blue' },
  { value: 'cribado', label: 'Preseleccionado', tone: 'violet' },
  { value: 'entrevista', label: 'Entrevista', tone: 'yellow' },
  { value: 'oferta', label: 'Oferta enviada', tone: 'orange' },
  { value: 'contratado', label: 'Contratado', tone: 'green' },
  { value: 'descartado', label: 'Descartado', tone: 'gray' },
] as const);
export type CandidatoEstado = (typeof CANDIDATO_ESTADOS)[number]['value'];

export const CANDIDATO_FUENTES = enumOptions([
  { value: 'web', label: 'Web de empleo' },
  { value: 'portal', label: 'Portal de empleo (InfoJobs, LinkedIn…)' },
  { value: 'referido', label: 'Recomendación' },
  { value: 'espontanea', label: 'Candidatura espontánea' },
  { value: 'ett', label: 'ETT o agencia' },
  { value: 'otra', label: 'Otra' },
] as const);

export const PROCESO_TIPOS = enumOptions([
  { value: 'alta', label: 'Incorporación', tone: 'green' },
  { value: 'baja', label: 'Salida', tone: 'red' },
] as const);

export const PROCESO_ESTADOS = enumOptions([
  { value: 'en_curso', label: 'En curso', tone: 'blue' },
  { value: 'completado', label: 'Completado', tone: 'green' },
  { value: 'cancelado', label: 'Cancelado', tone: 'gray' },
] as const);

/** A quién se asigna cada tarea de una plantilla. */
export const RESPONSABLES_TAREA = enumOptions([
  { value: 'rrhh', label: 'RRHH' },
  { value: 'responsable', label: 'Responsable directo' },
  { value: 'persona', label: 'La propia persona' },
  { value: 'departamento', label: 'Responsable de un departamento' },
  { value: 'concreta', label: 'Una persona concreta' },
] as const);

export interface PlantillaTarea {
  titulo: string;
  descripcion?: string | null;
  responsable: (typeof RESPONSABLES_TAREA)[number]['value'];
  departamentoId?: string | null;
  personaId?: string | null;
  /** Días respecto a la fecha de alta o baja (negativo = antes). */
  dias: number;
}

export const EVALUACION_ESTADOS = enumOptions([
  { value: 'borrador', label: 'Borrador', tone: 'gray' },
  { value: 'compartida', label: 'Compartida', tone: 'blue' },
  { value: 'firmada', label: 'Firmada', tone: 'green' },
] as const);

export interface ObjetivoEvaluacion {
  titulo: string;
  descripcion?: string | null;
  peso: number;
  puntuacion: number | null;
  comentario?: string | null;
}
export const PUNTUACION_MAX = 5;

export function puntuacionGlobal(objs: ObjetivoEvaluacion[]): number | null {
  const valid = objs.filter((o) => o.puntuacion !== null && o.puntuacion !== undefined && o.peso > 0);
  const pesos = valid.reduce((a, o) => a + o.peso, 0);
  if (!pesos) return null;
  return Math.round((valid.reduce((a, o) => a + o.peso * (o.puntuacion ?? 0), 0) / pesos) * 100) / 100;
}

export const PLAN_ESTADOS = enumOptions([
  { value: 'planificada', label: 'Planificada', tone: 'blue' },
  { value: 'en_curso', label: 'En curso', tone: 'yellow' },
  { value: 'realizada', label: 'Realizada', tone: 'green' },
  { value: 'cancelada', label: 'Cancelada', tone: 'gray' },
] as const);

export const ofertaResource = defineResource({
  key: 'alt.ofertas',
  module: 'alt',
  label: 'Oferta de empleo',
  plural: 'Ofertas de empleo',
  icon: 'Briefcase',
  titleField: 'titulo',
  subtitleField: 'departamentoId',
  fields: {
    titulo: { type: 'text', label: 'Puesto', required: true, colSpan: 2 },
    estado: { type: 'enum', label: 'Estado', options: OFERTA_ESTADOS, default: 'abierta' },
    plazas: { type: 'int', label: 'Plazas', default: 1, min: 1 },
    departamentoId: { type: 'ref', ref: 'departamentos', label: 'Departamento' },
    centroId: { type: 'ref', ref: 'centros', label: 'Centro de trabajo' },
    responsableId: { type: 'ref', ref: 'personas', label: 'Responsable de la selección' },
    tipoContrato: { type: 'enum', label: 'Contrato', options: TIPOS_CONTRATO, default: 'indefinido' },
    jornadaHoras: { type: 'number', label: 'Jornada (h/semana)', default: 40, decimals: 1 },
    salarioDesde: { type: 'money', label: 'Salario desde (bruto anual)' },
    salarioHasta: { type: 'money', label: 'Salario hasta' },
    fechaCierre: { type: 'date', label: 'Cierre previsto' },
    descripcion: { type: 'textarea', label: 'Descripción del puesto' },
    requisitos: { type: 'textarea', label: 'Requisitos' },
  },
  sections: [
    { title: 'Puesto', fields: ['titulo', 'estado', 'plazas', 'departamentoId', 'centroId', 'responsableId', 'fechaCierre'] },
    { title: 'Condiciones', fields: ['tipoContrato', 'jornadaHoras', 'salarioDesde', 'salarioHasta'] },
    { title: 'Detalle', fields: ['descripcion', 'requisitos'] },
  ],
  list: ['titulo', 'departamentoId', 'estado', 'plazas', 'fechaCierre'],
  searchable: ['titulo'],
  filters: ['estado', 'departamentoId'],
  defaultSort: { field: 'creadoEn', dir: 'desc' },
});

export const candidatoResource = defineResource({
  key: 'alt.candidatos',
  module: 'alt',
  label: 'Candidato',
  plural: 'Candidatos',
  icon: 'UserSearch',
  titleField: 'nombre',
  subtitleField: 'email',
  fields: {
    ofertaId: { type: 'ref', ref: 'alt.ofertas', label: 'Oferta', required: true },
    nombre: { type: 'text', label: 'Nombre', required: true },
    apellidos: { type: 'text', label: 'Apellidos' },
    email: { type: 'email', label: 'Email' },
    telefono: { type: 'phone', label: 'Teléfono' },
    localidad: { type: 'text', label: 'Localidad' },
    fuente: { type: 'enum', label: 'Cómo nos ha llegado', options: CANDIDATO_FUENTES, default: 'portal' },
    estado: { type: 'enum', label: 'Fase', options: CANDIDATO_ESTADOS, default: 'nuevo' },
    valoracion: { type: 'int', label: 'Valoración (1 a 5)', min: 1, max: 5 },
    pretension: { type: 'money', label: 'Pretensión salarial' },
    disponibilidad: { type: 'text', label: 'Disponibilidad', placeholder: 'Inmediata, 15 días…' },
    cvArchivoId: { type: 'file', label: 'Currículum', hidden: true },
    notas: { type: 'textarea', label: 'Notas' },
    consentimiento: { type: 'bool', label: 'Consiente conservar su CV para futuras ofertas (RGPD)' },
  },
  sections: [
    { title: 'Candidato', fields: ['ofertaId', 'nombre', 'apellidos', 'email', 'telefono', 'localidad', 'fuente'] },
    { title: 'Valoración', fields: ['estado', 'valoracion', 'pretension', 'disponibilidad', 'notas', 'consentimiento'] },
  ],
  list: ['nombre', 'ofertaId', 'estado', 'valoracion', 'fuente', 'email'],
  searchable: ['nombre', 'apellidos', 'email', 'telefono'],
  filters: ['ofertaId', 'estado', 'fuente'],
  defaultSort: { field: 'creadoEn', dir: 'desc' },
});

export const planFormacionResource = defineResource({
  key: 'alt.plan',
  module: 'alt',
  label: 'Acción formativa',
  plural: 'Plan de formación',
  icon: 'GraduationCap',
  titleField: 'accion',
  fields: {
    anio: { type: 'int', label: 'Año', required: true, min: 2000, max: 2100 },
    accion: { type: 'text', label: 'Acción formativa', required: true, colSpan: 2 },
    objetivo: { type: 'textarea', label: 'Objetivo' },
    departamentoId: { type: 'ref', ref: 'departamentos', label: 'Departamento destinatario', help: 'Vacío = toda la empresa' },
    personas: { type: 'refs', ref: 'personas', label: 'Personas concretas' },
    trimestre: { type: 'enum', label: 'Trimestre', options: [1, 2, 3, 4].map((t) => ({ value: String(t), label: `${t}.º trimestre` })) },
    modalidad: { type: 'enum', label: 'Modalidad', options: [{ value: 'presencial', label: 'Presencial' }, { value: 'online', label: 'En línea' }, { value: 'mixta', label: 'Mixta' }] },
    proveedor: { type: 'text', label: 'Proveedor' },
    horas: { type: 'number', label: 'Horas', decimals: 1, min: 0 },
    costeEstimado: { type: 'money', label: 'Coste estimado', min: 0 },
    bonificable: { type: 'bool', label: 'Bonificable (FUNDAE)' },
    estado: { type: 'enum', label: 'Estado', options: PLAN_ESTADOS, default: 'planificada' },
  },
  list: ['accion', 'anio', 'trimestre', 'departamentoId', 'horas', 'costeEstimado', 'estado'],
  searchable: ['accion', 'proveedor'],
  filters: ['anio', 'estado', 'departamentoId'],
  defaultSort: { field: 'trimestre', dir: 'asc' },
});
