import { defineResource, enumOptions } from '../resource';

export const ETAPA_TIPOS = enumOptions([
  { value: 'abierta', label: 'Abierta', tone: 'violet' },
  { value: 'ganada', label: 'Ganada', tone: 'green' },
  { value: 'perdida', label: 'Perdida', tone: 'red' },
] as const);

export const OPORTUNIDAD_ORIGENES = enumOptions([
  { value: 'web', label: 'Formulario web' },
  { value: 'telefono', label: 'Teléfono' },
  { value: 'referido', label: 'Recomendación' },
  { value: 'feria', label: 'Feria o evento' },
  { value: 'cliente', label: 'Cliente actual' },
  { value: 'prospeccion', label: 'Prospección' },
  { value: 'otro', label: 'Otro' },
] as const);

export const MOTIVOS_PERDIDA = enumOptions([
  { value: 'precio', label: 'Precio' },
  { value: 'plazo', label: 'Plazo de entrega' },
  { value: 'competencia', label: 'Eligió a la competencia' },
  { value: 'sin_presupuesto', label: 'Sin presupuesto' },
  { value: 'sin_respuesta', label: 'Dejó de responder' },
  { value: 'aplazado', label: 'Proyecto aplazado' },
  { value: 'otro', label: 'Otro' },
] as const);

export const etapaResource = defineResource({
  key: 'opo.etapas',
  module: 'opo',
  label: 'Etapa',
  plural: 'Etapas del embudo',
  titleField: 'nombre',
  fields: {
    nombre: { type: 'text', label: 'Nombre', required: true },
    orden: { type: 'int', label: 'Orden', default: 1 },
    probabilidad: { type: 'percent', label: 'Probabilidad %', min: 0, max: 100, default: 20 },
    tipo: { type: 'enum', label: 'Tipo', options: ETAPA_TIPOS, default: 'abierta', required: true },
    color: { type: 'color', label: 'Color', default: '#7D2CDD' },
  },
  list: ['orden', 'nombre', 'tipo', 'probabilidad'],
  defaultSort: { field: 'orden', dir: 'asc' },
});

export const oportunidadResource = defineResource({
  key: 'opo.oportunidades',
  module: 'opo',
  label: 'Oportunidad',
  plural: 'Oportunidades',
  icon: 'Target',
  titleField: 'titulo',
  subtitleField: 'terceroId',
  fields: {
    titulo: { type: 'text', label: 'Título', required: true, max: 200 },
    terceroId: { type: 'ref', ref: 'terceros', label: 'Cliente', required: true },
    contactoId: { type: 'ref', ref: 'contactos', label: 'Contacto' },
    etapaId: { type: 'ref', ref: 'opo_etapas', label: 'Etapa' },
    importe: { type: 'money', label: 'Importe estimado', min: 0 },
    probabilidad: { type: 'percent', label: 'Probabilidad %', min: 0, max: 100, help: 'Si lo dejas vacío se usa la de la etapa' },
    cierrePrevisto: { type: 'date', label: 'Cierre previsto' },
    comercialId: { type: 'ref', ref: 'personas', label: 'Comercial' },
    origen: { type: 'enum', label: 'Origen', options: OPORTUNIDAD_ORIGENES, default: 'telefono' },
    motivoPerdida: { type: 'enum', label: 'Motivo de pérdida', options: MOTIVOS_PERDIDA, readOnly: true },
    descripcion: { type: 'textarea', label: 'Descripción', colSpan: 2 },
  },
  sections: [
    { title: 'Oportunidad', fields: ['titulo', 'terceroId', 'contactoId', 'etapaId', 'origen', 'descripcion'] },
    { title: 'Previsión', fields: ['importe', 'probabilidad', 'cierrePrevisto', 'comercialId'] },
  ],
  list: ['titulo', 'terceroId', 'etapaId', 'importe', 'cierrePrevisto', 'comercialId'],
  searchable: ['titulo', 'descripcion'],
  filters: ['etapaId', 'comercialId', 'origen'],
  defaultSort: { field: 'cierrePrevisto', dir: 'asc' },
});
