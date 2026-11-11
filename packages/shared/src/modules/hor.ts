// Recursos y enumeraciones del módulo HOR (Control horario)
import { defineResource, enumOptions } from '../resource';

export const FICHAJE_TIPOS = enumOptions([
  { value: 'entrada', label: 'Entrada', tone: 'green' },
  { value: 'pausa_inicio', label: 'Inicio de pausa', tone: 'yellow' },
  { value: 'pausa_fin', label: 'Fin de pausa', tone: 'blue' },
  { value: 'salida', label: 'Salida', tone: 'violet' },
] as const);
export type FichajeTipo = (typeof FICHAJE_TIPOS)[number]['value'];

export const FICHAJE_ORIGENES = enumOptions([
  { value: 'web', label: 'Web' },
  { value: 'movil', label: 'Móvil' },
  { value: 'kiosco', label: 'Quiosco' },
  { value: 'correccion', label: 'Corrección aprobada' },
] as const);

/** Estado actual de la jornada de una persona. */
export const ESTADOS_JORNADA = enumOptions([
  { value: 'fuera', label: 'Fuera', tone: 'gray' },
  { value: 'trabajando', label: 'Trabajando', tone: 'green' },
  { value: 'pausa', label: 'En pausa', tone: 'yellow' },
] as const);
export type EstadoJornada = (typeof ESTADOS_JORNADA)[number]['value'];

/** Siguiente estado tras cada fichaje y qué fichajes se permiten desde cada estado. */
export const TRANSICIONES: Record<EstadoJornada, FichajeTipo[]> = {
  fuera: ['entrada'],
  trabajando: ['pausa_inicio', 'salida'],
  pausa: ['pausa_fin', 'salida'],
};
export function estadoTras(tipo: FichajeTipo): EstadoJornada {
  return tipo === 'entrada' || tipo === 'pausa_fin' ? 'trabajando' : tipo === 'pausa_inicio' ? 'pausa' : 'fuera';
}

export const CORRECCION_TIPOS = enumOptions([
  { value: 'anadir', label: 'Añadir un fichaje olvidado' },
  { value: 'modificar', label: 'Cambiar la hora de un fichaje' },
  { value: 'anular', label: 'Anular un fichaje erróneo' },
] as const);

export const CORRECCION_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente', tone: 'orange' },
  { value: 'aprobada', label: 'Aprobada', tone: 'green' },
  { value: 'rechazada', label: 'Rechazada', tone: 'red' },
] as const);

export const INCIDENCIA_TIPOS = enumOptions([
  { value: 'retraso', label: 'Retraso', tone: 'orange' },
  { value: 'falta_fichaje', label: 'Sin fichajes', tone: 'red' },
  { value: 'sin_salida', label: 'Sin salida', tone: 'red' },
  { value: 'exceso_jornada', label: 'Exceso de jornada', tone: 'yellow' },
  { value: 'fuera_geovalla', label: 'Fuera del centro', tone: 'brown' },
] as const);
export type IncidenciaTipo = (typeof INCIDENCIA_TIPOS)[number]['value'];

export const DIAS_SEMANA = [
  { value: 1, corto: 'L', label: 'Lunes' },
  { value: 2, corto: 'M', label: 'Martes' },
  { value: 3, corto: 'X', label: 'Miércoles' },
  { value: 4, corto: 'J', label: 'Jueves' },
  { value: 5, corto: 'V', label: 'Viernes' },
  { value: 6, corto: 'S', label: 'Sábado' },
  { value: 7, corto: 'D', label: 'Domingo' },
] as const;

export const turnoResource = defineResource({
  key: 'hor.turnos',
  module: 'hor',
  label: 'Turno',
  plural: 'Turnos',
  icon: 'AlarmClock',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true, placeholder: 'Mañana, partido, guardia…' },
    horaInicio: { type: 'time', label: 'Entrada', required: true, default: '08:00' },
    horaFin: { type: 'time', label: 'Salida', required: true, default: '17:00' },
    pausaMinutos: { type: 'int', label: 'Pausa (minutos)', default: 60, min: 0, max: 240, help: 'Tiempo de comida o descanso no retribuido' },
    dias: { type: 'json', label: 'Días de la semana', default: [1, 2, 3, 4, 5], hidden: true },
    color: { type: 'color', label: 'Color', default: '#7D2CDD' },
    activo: { type: 'bool', label: 'Activo', default: true },
  },
  list: ['nombre', 'horaInicio', 'horaFin', 'pausaMinutos', 'activo'],
  searchable: ['nombre'],
  defaultSort: { field: 'horaInicio', dir: 'asc' },
});

export const asignacionResource = defineResource({
  key: 'hor.asignaciones',
  module: 'hor',
  label: 'Asignación de turno',
  plural: 'Asignaciones de turno',
  icon: 'CalendarRange',
  titleField: 'personaId',
  fields: {
    personaId: { type: 'ref', ref: 'personas', label: 'Persona', required: true },
    turnoId: { type: 'ref', ref: 'hor.turnos', label: 'Turno', required: true },
    desde: { type: 'date', label: 'Desde', required: true },
    hasta: { type: 'date', label: 'Hasta', help: 'Vacío = sin fecha de fin' },
  },
  list: ['personaId', 'turnoId', 'desde', 'hasta'],
  filters: ['personaId', 'turnoId'],
  defaultSort: { field: 'desde', dir: 'desc' },
});

export const kioscoResource = defineResource({
  key: 'hor.kioscos',
  module: 'hor',
  label: 'Quiosco de fichaje',
  plural: 'Quioscos',
  icon: 'Tablet',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true, placeholder: 'Tableta de la entrada' },
    centroId: { type: 'ref', ref: 'centros', label: 'Centro', required: true },
    activo: { type: 'bool', label: 'Activo', default: true },
  },
  list: ['nombre', 'centroId', 'activo'],
});

/** Texto legal que se muestra junto al registro de jornada. */
export const NOTA_LEGAL_REGISTRO =
  'Registro diario de jornada obligatorio (art. 34.9 del Estatuto de los Trabajadores). Los registros se conservan durante cuatro años y están a disposición de las personas trabajadoras, de sus representantes y de la Inspección de Trabajo.';

/** Horas nocturnas (art. 36 ET): entre las 22:00 y las 06:00. */
export const NOCHE_DESDE = 22;
export const NOCHE_HASTA = 6;

export interface DiaJornada {
  fecha: string;
  diaSemana: number;
  fichajes: { id: string; tipo: FichajeTipo; momento: string; origen: string; anulado: boolean; dentroGeovalla: boolean | null; nota?: string | null }[];
  trabajadas: number;
  pausas: number;
  previstas: number;
  extra: number;
  nocturnas: number;
  festivo: string | null;
  ausencia: { tipo: string; color: string; medioDia?: string | null } | null;
  turno: { id: string; nombre: string; horaInicio: string; horaFin: string; color: string } | null;
  incidencias: { tipo: IncidenciaTipo; detalle: string }[];
  abierta: boolean;
}
