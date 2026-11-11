import { z, type ZodTypeAny } from 'zod';
import { isValidIban, isValidNif } from './validators';

/**
 * Sistema de recursos: una sola definición por entidad que usan
 *  - la API, para validar (toZod) y saber qué columnas filtrar/buscar
 *  - la web, para pintar listados, formularios y fichas.
 */

export type FieldType =
  | 'text' | 'textarea' | 'email' | 'phone' | 'url'
  | 'int' | 'number' | 'money' | 'percent'
  | 'date' | 'datetime' | 'time'
  | 'bool' | 'enum' | 'ref' | 'refs' | 'tags'
  | 'nif' | 'iban' | 'color' | 'json' | 'file';

export type Tone = 'gray' | 'violet' | 'purple' | 'green' | 'yellow' | 'brown' | 'red' | 'blue' | 'orange';

export interface EnumOption {
  value: string;
  label: string;
  tone?: Tone;
}

export interface FieldDef {
  type: FieldType;
  label: string;
  required?: boolean;
  help?: string;
  placeholder?: string;
  max?: number;
  min?: number;
  options?: readonly EnumOption[];
  ref?: string; // destino del selector (ver REF_TARGETS en la API)
  refFilter?: Record<string, string | number | boolean>;
  default?: unknown;
  readOnly?: boolean; // se muestra pero no se envía
  hidden?: boolean; // ni se muestra en formularios
  sensitive?: string; // permiso necesario para verlo (p. ej. fic.sensible)
  colSpan?: 1 | 2;
  decimals?: number;
}

export interface ResourceSection {
  title: string;
  fields: string[];
  description?: string;
}

/** Definición de recurso (forma general, sin genéricos, para poder pasarla a cualquier función). */
export interface ResourceDef {
  key: string; // identificador único (p. ej. "terceros", "sat.equipos")
  module: string;
  label: string; // singular
  plural: string;
  icon?: string;
  fields: Record<string, FieldDef>;
  sections?: ResourceSection[];
  list: string[]; // columnas del listado
  titleField: string;
  subtitleField?: string;
  searchable?: string[];
  filters?: string[];
  defaultSort?: { field: string; dir: 'asc' | 'desc' };
}

/** Define un recurso comprobando que las columnas, filtros y búsquedas existen en sus campos. */
export function defineResource<F extends Record<string, FieldDef>>(
  def: Omit<ResourceDef, 'fields' | 'list' | 'titleField' | 'subtitleField' | 'searchable' | 'filters'> & {
    fields: F;
    list: (keyof F & string)[];
    titleField: keyof F & string;
    subtitleField?: keyof F & string;
    searchable?: (keyof F & string)[];
    filters?: (keyof F & string)[];
  },
): ResourceDef & { fields: F } {
  return def as ResourceDef & { fields: F };
}

export function enumOptions<const T extends readonly EnumOption[]>(opts: T): T {
  return opts;
}

export function optionLabel(options: readonly EnumOption[] | undefined, value: unknown): EnumOption | undefined {
  return options?.find((o) => o.value === value);
}

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

function fieldToZod(f: FieldDef): ZodTypeAny {
  let s: ZodTypeAny;
  switch (f.type) {
    case 'text':
    case 'textarea':
    case 'phone':
    case 'color':
      s = z.string().trim().max(f.max ?? (f.type === 'textarea' ? 20000 : 500));
      break;
    case 'email':
      s = z.string().trim().toLowerCase().email('Email no válido').max(254);
      break;
    case 'url':
      s = z.string().trim().max(500);
      break;
    case 'nif':
      s = z
        .string()
        .trim()
        .toUpperCase()
        .transform((v) => v.replace(/[\s-]/g, ''))
        .refine((v) => isValidNif(v) || /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(v), 'NIF/CIF/NIE no válido');
      break;
    case 'iban':
      s = z
        .string()
        .trim()
        .toUpperCase()
        .transform((v) => v.replace(/\s/g, ''))
        .refine((v) => isValidIban(v), 'IBAN no válido');
      break;
    case 'int':
      s = z.coerce.number().int();
      if (f.min !== undefined) s = (s as z.ZodNumber).min(f.min);
      if (f.max !== undefined) s = (s as z.ZodNumber).max(f.max);
      break;
    case 'number':
    case 'money':
    case 'percent':
      s = z.coerce.number().finite();
      if (f.min !== undefined) s = (s as z.ZodNumber).min(f.min);
      if (f.max !== undefined) s = (s as z.ZodNumber).max(f.max);
      break;
    case 'date':
      s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
      break;
    case 'datetime':
      s = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/));
      break;
    case 'time':
      s = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora no válida');
      break;
    case 'bool':
      s = z.coerce.boolean();
      break;
    case 'enum': {
      const vals = (f.options ?? []).map((o) => o.value);
      s = vals.length ? z.enum(vals as [string, ...string[]]) : z.string();
      break;
    }
    case 'ref':
    case 'file':
      s = z.string().uuid();
      break;
    case 'refs':
      s = z.array(z.string().uuid());
      break;
    case 'tags':
      s = z.array(z.string().trim().min(1).max(60)).max(50);
      break;
    case 'json':
      s = z.any();
      break;
    default:
      s = z.any();
  }
  if (f.required) {
    if (f.type === 'text' || f.type === 'textarea') s = (s as z.ZodString).min(1, `${f.label} es obligatorio`);
    return z.preprocess((v) => (v === '' ? undefined : v), s);
  }
  return z.preprocess(emptyToNull, s.nullable().optional());
}

/** Esquema zod de alta a partir de la definición del recurso. */
export function toZod(def: ResourceDef, opts: { partial?: boolean; omit?: string[] } = {}) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [k, f] of Object.entries(def.fields)) {
    if (f.readOnly || opts.omit?.includes(k)) continue;
    const s = fieldToZod(f);
    shape[k] = opts.partial ? s.optional() : s;
  }
  return z.object(shape);
}

/** Valores por defecto para formularios nuevos. */
export function defaultsOf(def: ResourceDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(def.fields)) {
    if (f.default !== undefined) out[k] = f.default;
    else if (f.type === 'bool') out[k] = false;
    else if (f.type === 'tags' || f.type === 'refs') out[k] = [];
    else out[k] = '';
  }
  return out;
}
