// Recursos y enumeraciones del módulo FIC (Ficha del trabajador)
import { defineResource, enumOptions } from '../resource';

export const SEXOS = enumOptions([
  { value: 'mujer', label: 'Mujer' },
  { value: 'hombre', label: 'Hombre' },
  { value: 'no_binario', label: 'No binario' },
  { value: 'no_consta', label: 'Prefiere no indicarlo' },
] as const);

export const TIPOS_CONTRATO = enumOptions([
  { value: 'indefinido', label: 'Indefinido', tone: 'green' },
  { value: 'fijo_discontinuo', label: 'Fijo discontinuo', tone: 'blue' },
  { value: 'temporal', label: 'Temporal (circunstancias de la producción)', tone: 'yellow' },
  { value: 'sustitucion', label: 'Sustitución', tone: 'yellow' },
  { value: 'formacion', label: 'Formativo', tone: 'violet' },
  { value: 'practicas', label: 'Prácticas', tone: 'violet' },
] as const);

export const GRUPOS_COTIZACION = enumOptions(
  [
    ['1', 'Ingenieros y licenciados'],
    ['2', 'Ingenieros técnicos, peritos'],
    ['3', 'Jefes administrativos y de taller'],
    ['4', 'Ayudantes no titulados'],
    ['5', 'Oficiales administrativos'],
    ['6', 'Subalternos'],
    ['7', 'Auxiliares administrativos'],
    ['8', 'Oficiales de primera y segunda'],
    ['9', 'Oficiales de tercera y especialistas'],
    ['10', 'Peones'],
    ['11', 'Menores de 18 años'],
  ].map(([value, label]) => ({ value: value!, label: `${value} · ${label}` })),
);

export const MOTIVOS_BAJA = enumOptions([
  { value: 'voluntaria', label: 'Baja voluntaria' },
  { value: 'fin_contrato', label: 'Fin de contrato' },
  { value: 'despido_objetivo', label: 'Despido objetivo' },
  { value: 'despido_disciplinario', label: 'Despido disciplinario' },
  { value: 'no_supera_prueba', label: 'No supera el periodo de prueba' },
  { value: 'jubilacion', label: 'Jubilación' },
  { value: 'excedencia', label: 'Excedencia' },
  { value: 'otro', label: 'Otro' },
] as const);

export const HISTORIAL_TIPOS = enumOptions([
  { value: 'alta', label: 'Alta', tone: 'green' },
  { value: 'ascenso', label: 'Ascenso o cambio de categoría', tone: 'violet' },
  { value: 'salario', label: 'Revisión salarial', tone: 'green' },
  { value: 'jornada', label: 'Cambio de jornada', tone: 'blue' },
  { value: 'contrato', label: 'Cambio de contrato', tone: 'yellow' },
  { value: 'centro', label: 'Cambio de centro', tone: 'brown' },
  { value: 'puesto', label: 'Cambio de puesto', tone: 'violet' },
  { value: 'baja', label: 'Baja', tone: 'red' },
  { value: 'otro', label: 'Otro', tone: 'gray' },
] as const);

export const FORMACION_TIPOS = enumOptions([
  { value: 'tecnica', label: 'Técnica', tone: 'violet' },
  { value: 'idiomas', label: 'Idiomas', tone: 'blue' },
  { value: 'habilidades', label: 'Habilidades', tone: 'green' },
  { value: 'obligatoria', label: 'Obligatoria (normativa)', tone: 'yellow' },
  { value: 'otra', label: 'Otra', tone: 'gray' },
] as const);

export const PRL_TIPOS = enumOptions([
  { value: 'reconocimiento', label: 'Reconocimiento médico', tone: 'blue' },
  { value: 'curso_prl', label: 'Curso de PRL', tone: 'violet' },
  { value: 'epi', label: 'Entrega de EPI', tone: 'yellow' },
  { value: 'informacion', label: 'Información de riesgos del puesto', tone: 'green' },
] as const);

export const PRL_RESULTADOS = enumOptions([
  { value: 'apto', label: 'Apto', tone: 'green' },
  { value: 'apto_restricciones', label: 'Apto con restricciones', tone: 'yellow' },
  { value: 'no_apto', label: 'No apto', tone: 'red' },
  { value: 'renuncia', label: 'Renuncia voluntaria', tone: 'gray' },
] as const);

export const CAMBIO_ESTADOS = enumOptions([
  { value: 'pendiente', label: 'Pendiente de revisar', tone: 'orange' },
  { value: 'aprobado', label: 'Aplicado', tone: 'green' },
  { value: 'rechazado', label: 'Rechazado', tone: 'red' },
] as const);

export const trabajadorResource = defineResource({
  key: 'fic.trabajadores',
  module: 'fic',
  label: 'Ficha laboral',
  plural: 'Fichas laborales',
  icon: 'IdCard',
  titleField: 'dni',
  fields: {
    personaId: { type: 'ref', ref: 'personas', label: 'Persona', required: true },
    dni: { type: 'nif', label: 'DNI / NIE' },
    nss: { type: 'text', label: 'Nº de afiliación a la Seguridad Social', max: 14, placeholder: '28 12345678 40' },
    fechaNacimiento: { type: 'date', label: 'Fecha de nacimiento' },
    sexo: { type: 'enum', label: 'Sexo', options: SEXOS, help: 'Necesario para el registro retributivo (igualdad)' },
    nacionalidad: { type: 'text', label: 'Nacionalidad', default: 'Española' },
    direccion: { type: 'text', label: 'Dirección', colSpan: 2 },
    codigoPostal: { type: 'text', label: 'Código postal', max: 10 },
    localidad: { type: 'text', label: 'Localidad' },
    provincia: { type: 'text', label: 'Provincia' },
    telefonoPersonal: { type: 'phone', label: 'Teléfono personal' },
    emailPersonal: { type: 'email', label: 'Email personal' },
    iban: { type: 'iban', label: 'IBAN para la nómina', sensitive: 'fic.sensible' },
    contactoEmergencia: { type: 'text', label: 'Contacto de emergencia' },
    telefonoEmergencia: { type: 'phone', label: 'Teléfono de emergencia' },
    convenio: { type: 'text', label: 'Convenio colectivo', colSpan: 2 },
    categoria: { type: 'text', label: 'Categoría profesional' },
    grupoCotizacion: { type: 'enum', label: 'Grupo de cotización', options: GRUPOS_COTIZACION },
    tipoContrato: { type: 'enum', label: 'Tipo de contrato', options: TIPOS_CONTRATO, default: 'indefinido' },
    jornadaHoras: { type: 'number', label: 'Jornada (horas/semana)', default: 40, min: 0, max: 60, decimals: 2 },
    salarioBruto: { type: 'money', label: 'Salario bruto anual', sensitive: 'fic.sensible', min: 0 },
    fechaAlta: { type: 'date', label: 'Fecha de alta' },
    finPeriodoPrueba: { type: 'date', label: 'Fin del periodo de prueba' },
    finContrato: { type: 'date', label: 'Fin de contrato', help: 'Solo contratos temporales' },
    fechaBaja: { type: 'date', label: 'Fecha de baja' },
    motivoBaja: { type: 'enum', label: 'Motivo de la baja', options: MOTIVOS_BAJA },
    discapacidad: { type: 'percent', label: 'Grado de discapacidad %', sensitive: 'fic.sensible', min: 0, max: 100 },
    datosSalud: { type: 'textarea', label: 'Observaciones de salud', sensitive: 'fic.sensible', help: 'Alergias, adaptaciones del puesto… Solo lo ve quien tiene permiso de datos sensibles.' },
    notas: { type: 'textarea', label: 'Notas internas de RRHH' },
    validado: { type: 'bool', label: 'Datos validados por RRHH', readOnly: true },
  },
  sections: [
    { title: 'Datos personales', fields: ['dni', 'nss', 'fechaNacimiento', 'sexo', 'nacionalidad', 'telefonoPersonal', 'emailPersonal'] },
    { title: 'Domicilio', fields: ['direccion', 'codigoPostal', 'localidad', 'provincia'] },
    { title: 'Emergencias', fields: ['contactoEmergencia', 'telefonoEmergencia'] },
    { title: 'Contrato', fields: ['tipoContrato', 'convenio', 'categoria', 'grupoCotizacion', 'jornadaHoras', 'fechaAlta', 'finPeriodoPrueba', 'finContrato'] },
    { title: 'Datos sensibles', fields: ['salarioBruto', 'iban', 'discapacidad', 'datosSalud'] },
    { title: 'Baja', fields: ['fechaBaja', 'motivoBaja'] },
    { title: 'RRHH', fields: ['notas'] },
  ],
  list: ['personaId', 'dni', 'categoria', 'tipoContrato', 'jornadaHoras', 'fechaAlta', 'finContrato'],
  searchable: ['dni', 'nss', 'categoria'],
  filters: ['tipoContrato', 'grupoCotizacion'],
  defaultSort: { field: 'fechaAlta', dir: 'desc' },
});

/** Campos que el propio trabajador puede proponer desde el portal (RRHH los valida). */
export const CAMPOS_EMPLEADO = [
  'dni',
  'nss',
  'fechaNacimiento',
  'sexo',
  'nacionalidad',
  'direccion',
  'codigoPostal',
  'localidad',
  'provincia',
  'telefonoPersonal',
  'emailPersonal',
  'iban',
  'contactoEmergencia',
  'telefonoEmergencia',
] as const;

/** Cambios de estos campos se anotan solos en el historial laboral. */
export const CAMPOS_HISTORIAL: Record<string, string> = {
  categoria: 'ascenso',
  grupoCotizacion: 'ascenso',
  salarioBruto: 'salario',
  jornadaHoras: 'jornada',
  tipoContrato: 'contrato',
  convenio: 'contrato',
};

export const historialResource = defineResource({
  key: 'fic.historial',
  module: 'fic',
  label: 'Entrada del historial',
  plural: 'Historial laboral',
  icon: 'History',
  titleField: 'descripcion',
  fields: {
    personaId: { type: 'ref', ref: 'personas', label: 'Persona', required: true },
    fecha: { type: 'date', label: 'Fecha', required: true },
    tipo: { type: 'enum', label: 'Tipo', options: HISTORIAL_TIPOS, required: true, default: 'otro' },
    descripcion: { type: 'text', label: 'Descripción', required: true, colSpan: 2 },
    valorAnterior: { type: 'text', label: 'Antes' },
    valorNuevo: { type: 'text', label: 'Después' },
  },
  list: ['fecha', 'tipo', 'descripcion', 'valorAnterior', 'valorNuevo'],
  filters: ['tipo'],
  defaultSort: { field: 'fecha', dir: 'desc' },
});

export const formacionResource = defineResource({
  key: 'fic.formacion',
  module: 'fic',
  label: 'Curso',
  plural: 'Formación',
  icon: 'GraduationCap',
  titleField: 'curso',
  subtitleField: 'entidad',
  fields: {
    personaId: { type: 'ref', ref: 'personas', label: 'Persona', required: true },
    curso: { type: 'text', label: 'Curso', required: true, colSpan: 2 },
    tipo: { type: 'enum', label: 'Tipo', options: FORMACION_TIPOS, default: 'tecnica' },
    entidad: { type: 'text', label: 'Entidad que lo imparte' },
    fecha: { type: 'date', label: 'Fecha de realización', required: true },
    horas: { type: 'number', label: 'Horas', min: 0, decimals: 1 },
    caduca: { type: 'date', label: 'Caduca el', help: 'Carnés y certificados que hay que renovar' },
    coste: { type: 'money', label: 'Coste', min: 0 },
    bonificada: { type: 'bool', label: 'Bonificada (FUNDAE)' },
    archivoId: { type: 'file', label: 'Diploma o certificado', hidden: true },
    notas: { type: 'textarea', label: 'Notas' },
  },
  list: ['curso', 'personaId', 'tipo', 'fecha', 'horas', 'caduca'],
  searchable: ['curso', 'entidad'],
  filters: ['tipo', 'personaId'],
  defaultSort: { field: 'fecha', dir: 'desc' },
});

export const prlResource = defineResource({
  key: 'fic.prl',
  module: 'fic',
  label: 'Registro de PRL',
  plural: 'Prevención de riesgos',
  icon: 'HardHat',
  titleField: 'descripcion',
  fields: {
    personaId: { type: 'ref', ref: 'personas', label: 'Persona', required: true },
    tipo: { type: 'enum', label: 'Tipo', options: PRL_TIPOS, required: true, default: 'reconocimiento' },
    descripcion: { type: 'text', label: 'Descripción', required: true, colSpan: 2, placeholder: 'Reconocimiento anual, curso de 20 h de oficio, botas S3…' },
    fecha: { type: 'date', label: 'Fecha', required: true },
    caduca: { type: 'date', label: 'Próxima revisión o caducidad' },
    resultado: { type: 'enum', label: 'Resultado', options: PRL_RESULTADOS, sensitive: 'fic.sensible', help: 'Solo reconocimientos médicos' },
    entidad: { type: 'text', label: 'Servicio de prevención o proveedor' },
    horas: { type: 'number', label: 'Horas (cursos)', min: 0, decimals: 1 },
    epis: { type: 'json', label: 'Equipos entregados', hidden: true },
    archivoId: { type: 'file', label: 'Documento', hidden: true },
    notas: { type: 'textarea', label: 'Notas' },
  },
  list: ['fecha', 'tipo', 'descripcion', 'personaId', 'caduca'],
  searchable: ['descripcion', 'entidad'],
  filters: ['tipo', 'personaId'],
  defaultSort: { field: 'fecha', dir: 'desc' },
});

export interface EpiItem {
  nombre: string;
  talla?: string | null;
  cantidad: number;
}

/** Tipos de alerta de la ficha laboral. */
export const ALERTA_TIPOS = enumOptions([
  { value: 'fin_contrato', label: 'Fin de contrato', tone: 'red' },
  { value: 'fin_prueba', label: 'Fin del periodo de prueba', tone: 'orange' },
  { value: 'reconocimiento', label: 'Reconocimiento médico', tone: 'blue' },
  { value: 'prl', label: 'PRL que caduca', tone: 'yellow' },
  { value: 'formacion', label: 'Formación que caduca', tone: 'violet' },
  { value: 'documento', label: 'Documento que caduca', tone: 'brown' },
  { value: 'datos', label: 'Datos pendientes de validar', tone: 'gray' },
] as const);

/** Avisos con estos días de antelación. */
export const DIAS_AVISO = [30, 15, 7, 1] as const;
