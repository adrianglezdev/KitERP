// Recursos y enumeraciones del módulo DTC (documentación técnica controlada)
import { defineResource, enumOptions } from '../resource';

export const DTC_TIPOS = enumOptions([
  { value: 'manual', label: 'Manual', tone: 'violet' },
  { value: 'ficha_tecnica', label: 'Ficha técnica', tone: 'blue' },
  { value: 'plano', label: 'Plano', tone: 'brown' },
  { value: 'procedimiento', label: 'Procedimiento', tone: 'green' },
  { value: 'esquema', label: 'Esquema', tone: 'purple' },
  { value: 'certificado', label: 'Certificado', tone: 'yellow' },
  { value: 'instruccion_trabajo', label: 'Instrucción de trabajo', tone: 'orange' },
  { value: 'normativa', label: 'Normativa', tone: 'gray' },
] as const);

export const DTC_ESTADOS = enumOptions([
  { value: 'borrador', label: 'Borrador', tone: 'gray' },
  { value: 'en_revision', label: 'En revisión', tone: 'orange' },
  { value: 'aprobado', label: 'Aprobado', tone: 'green' },
  { value: 'obsoleto', label: 'Obsoleto', tone: 'red' },
] as const);

export const DTC_VERSION_ESTADOS = enumOptions([
  { value: 'borrador', label: 'Borrador', tone: 'gray' },
  { value: 'en_revision', label: 'En revisión', tone: 'orange' },
  { value: 'aprobada', label: 'Vigente', tone: 'green' },
  { value: 'rechazada', label: 'Rechazada', tone: 'red' },
  { value: 'obsoleta', label: 'Obsoleta', tone: 'brown' },
] as const);

export const DTC_CONFIDENCIALIDAD = enumOptions([
  { value: 'publico', label: 'Público (también clientes)', tone: 'green' },
  { value: 'interno', label: 'Interno', tone: 'blue' },
  { value: 'restringido', label: 'Restringido', tone: 'red' },
] as const);

/** Entidades a las que se puede vincular un documento técnico. */
export const DTC_VINCULOS = enumOptions([
  { value: 'articulo', label: 'Artículo' },
  { value: 'sat_equipo', label: 'Equipo instalado' },
  { value: 'activo', label: 'Activo' },
  { value: 'proyecto', label: 'Proyecto' },
  { value: 'tercero', label: 'Cliente o proveedor' },
] as const);
export type DtcVinculo = (typeof DTC_VINCULOS)[number]['value'];

/** Destino del selector de referencias para cada tipo de vínculo. */
export const DTC_VINCULO_REF: Record<DtcVinculo, string> = {
  articulo: 'articulos',
  sat_equipo: 'sat_equipos',
  activo: 'activos',
  proyecto: 'proyectos',
  tercero: 'terceros',
};

export const dtcDocumentoResource = defineResource({
  key: 'dtc.documentos',
  module: 'dtc',
  label: 'Documento técnico',
  plural: 'Documentación técnica',
  icon: 'BookOpenCheck',
  titleField: 'titulo',
  subtitleField: 'codigo',
  fields: {
    codigo: { type: 'text', label: 'Código', max: 40, help: 'Si lo dejas vacío se asigna uno automáticamente' },
    titulo: { type: 'text', label: 'Título', required: true, max: 200, colSpan: 2 },
    tipo: { type: 'enum', label: 'Tipo', options: DTC_TIPOS, required: true, default: 'manual' },
    confidencialidad: { type: 'enum', label: 'Confidencialidad', options: DTC_CONFIDENCIALIDAD, required: true, default: 'interno' },
    descripcion: { type: 'textarea', label: 'Descripción' },
    departamentoId: { type: 'ref', ref: 'departamentos', label: 'Departamento propietario' },
    responsableId: { type: 'ref', ref: 'personas', label: 'Responsable' },
    revisorId: { type: 'ref', ref: 'personas', label: 'Revisor', help: 'Quien aprueba las nuevas versiones' },
    revisionMeses: { type: 'int', label: 'Revisar cada (meses)', min: 1, max: 120, default: 12 },
    proximaRevision: { type: 'date', label: 'Próxima revisión' },
    etiquetas: { type: 'tags', label: 'Etiquetas' },
    estado: { type: 'enum', label: 'Estado', options: DTC_ESTADOS, readOnly: true },
    versionVigente: { type: 'text', label: 'Versión vigente', readOnly: true },
  },
  sections: [
    { title: 'Documento', fields: ['codigo', 'titulo', 'tipo', 'confidencialidad', 'descripcion', 'etiquetas'] },
    { title: 'Control', fields: ['departamentoId', 'responsableId', 'revisorId', 'revisionMeses', 'proximaRevision'] },
  ],
  list: ['codigo', 'titulo', 'tipo', 'estado', 'versionVigente', 'confidencialidad', 'proximaRevision'],
  searchable: ['codigo', 'titulo'],
  filters: ['tipo', 'estado', 'confidencialidad', 'departamentoId', 'responsableId'],
  defaultSort: { field: 'codigo', dir: 'asc' },
});

/** Siguiente número de versión: 1.0 → 1.1 (o 2.0 si es un cambio mayor). */
export function siguienteVersion(actual: string | null | undefined, mayor = false): string {
  if (!actual) return '1.0';
  const [ma, mi] = actual.split('.').map((n) => Number(n) || 0);
  return mayor ? `${(ma ?? 0) + 1}.0` : `${ma ?? 1}.${(mi ?? 0) + 1}`;
}
