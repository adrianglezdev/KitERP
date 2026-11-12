/**
 * Apariencia de la aplicación, propia de cada empresa.
 *
 * Cada empresa elige un tema de partida y lo ajusta: cinco colores con un papel fijo, tipografías,
 * forma de esquinas y botones, estilo de las tarjetas y de la barra lateral. Se guarda en
 * `empresas.ajustes.apariencia` y la web lo convierte en variables CSS (apps/web/src/lib/theme.ts).
 */
import { z } from 'zod';

/** Los cinco colores de marca. Cada uno tiene un papel; el resto de tonos se calcula a partir de ellos. */
export interface AparienciaColores {
  /** Acción principal: botones, enlaces, selección. También el pilar Personas. */
  primario: string;
  /** Elemento activo y «correcto»: opción del menú seleccionada, fichar, estados resueltos. Pilar Finanzas. */
  acento: string;
  /** Información y «en curso». Pilar Operaciones. */
  info: string;
  /** Alertas, errores e incumplidos. Pilar Comercial. */
  alerta: string;
  /** Barra lateral, bloques oscuros y el tinte de los grises. */
  estructura: string;
}

export type AparienciaEsquinas = 'rectas' | 'suaves' | 'redondas';
export type AparienciaBotones = 'pildora' | 'redondeados' | 'rectos';
export type AparienciaTarjetas = 'sombra' | 'borde' | 'planas';
export type AparienciaBarra = 'oscura' | 'clara' | 'color';
export type AparienciaDensidad = 'comoda' | 'compacta';
export type AparienciaModo = 'claro' | 'oscuro' | 'sistema';

export interface Apariencia {
  /** Tema del que parte (uno de TEMAS) o «personalizado». Solo informativo: mandan los valores. */
  tema: string;
  colores: AparienciaColores;
  fuenteTitulos: string;
  fuenteTexto: string;
  esquinas: AparienciaEsquinas;
  botones: AparienciaBotones;
  tarjetas: AparienciaTarjetas;
  barra: AparienciaBarra;
  densidad: AparienciaDensidad;
  /** Modo con el que abre quien no ha elegido el suyo. */
  modo: AparienciaModo;
  /** Nombre que se muestra en la aplicación en lugar de «KiteERP» (vacío: el de la empresa). */
  nombreApp: string | null;
}

export interface Fuente {
  id: string;
  nombre: string;
  /** Valor de font-family. */
  familia: string;
  /** Especificación para Google Fonts (familia y pesos); null si es una fuente del sistema. */
  google: string | null;
  tipo: 'sans' | 'serif';
  /** Peso del texto corrido que mejor le sienta. */
  peso: 400 | 500;
}

export const FUENTES: Fuente[] = [
  { id: 'sora', nombre: 'Sora', familia: "'Sora'", google: 'Sora:wght@400;500;600;700', tipo: 'sans', peso: 400 },
  { id: 'manrope', nombre: 'Manrope', familia: "'Manrope'", google: 'Manrope:wght@500;600;700;800', tipo: 'sans', peso: 500 },
  { id: 'inter', nombre: 'Inter', familia: "'Inter'", google: 'Inter:wght@400;500;600;700', tipo: 'sans', peso: 400 },
  { id: 'jakarta', nombre: 'Plus Jakarta Sans', familia: "'Plus Jakarta Sans'", google: 'Plus+Jakarta+Sans:wght@400;500;600;700', tipo: 'sans', peso: 500 },
  { id: 'dm-sans', nombre: 'DM Sans', familia: "'DM Sans'", google: 'DM+Sans:wght@400;500;600;700', tipo: 'sans', peso: 400 },
  { id: 'outfit', nombre: 'Outfit', familia: "'Outfit'", google: 'Outfit:wght@400;500;600;700', tipo: 'sans', peso: 400 },
  { id: 'space-grotesk', nombre: 'Space Grotesk', familia: "'Space Grotesk'", google: 'Space+Grotesk:wght@400;500;600;700', tipo: 'sans', peso: 400 },
  { id: 'poppins', nombre: 'Poppins', familia: "'Poppins'", google: 'Poppins:wght@400;500;600;700', tipo: 'sans', peso: 400 },
  { id: 'nunito-sans', nombre: 'Nunito Sans', familia: "'Nunito Sans'", google: 'Nunito+Sans:wght@400;500;600;700', tipo: 'sans', peso: 500 },
  { id: 'ibm-plex', nombre: 'IBM Plex Sans', familia: "'IBM Plex Sans'", google: 'IBM+Plex+Sans:wght@400;500;600;700', tipo: 'sans', peso: 400 },
  { id: 'montserrat', nombre: 'Montserrat', familia: "'Montserrat'", google: 'Montserrat:wght@400;500;600;700', tipo: 'sans', peso: 500 },
  { id: 'lora', nombre: 'Lora', familia: "'Lora'", google: 'Lora:wght@400;500;600;700', tipo: 'serif', peso: 400 },
  { id: 'fraunces', nombre: 'Fraunces', familia: "'Fraunces'", google: 'Fraunces:wght@400;500;600;700', tipo: 'serif', peso: 400 },
  { id: 'sistema', nombre: 'Del sistema', familia: 'system-ui', google: null, tipo: 'sans', peso: 400 },
];

export function fuente(id: string | null | undefined): Fuente {
  return FUENTES.find((f) => f.id === id) ?? FUENTES[1]!;
}

export const APARIENCIA_DEFECTO: Apariencia = {
  tema: 'cometa',
  colores: { primario: '#5559E6', acento: '#C6FA2D', info: '#2651D4', alerta: '#F14092', estructura: '#38465C' },
  fuenteTitulos: 'sora',
  fuenteTexto: 'manrope',
  esquinas: 'redondas',
  botones: 'pildora',
  tarjetas: 'sombra',
  barra: 'oscura',
  densidad: 'comoda',
  modo: 'sistema',
  nombreApp: null,
};

export interface Tema {
  id: string;
  nombre: string;
  descripcion: string;
  apariencia: Omit<Apariencia, 'nombreApp'>;
}

/** Temas de partida. Una empresa elige uno y, si quiere, cambia cualquier valor. */
export const TEMAS: Tema[] = [
  {
    id: 'cometa',
    nombre: 'Cometa',
    descripcion: 'Violeta y lima sobre pizarra. El aspecto original de Kite.',
    apariencia: { ...APARIENCIA_DEFECTO },
  },
  {
    id: 'atardecer',
    nombre: 'Atardecer',
    descripcion: 'Naranja cálido con barra oscura. Cercano y enérgico.',
    apariencia: {
      tema: 'atardecer',
      colores: { primario: '#EA580C', acento: '#FFD23F', info: '#1D74D8', alerta: '#D7263D', estructura: '#2E2A27' },
      fuenteTitulos: 'outfit',
      fuenteTexto: 'dm-sans',
      esquinas: 'redondas',
      botones: 'pildora',
      tarjetas: 'sombra',
      barra: 'oscura',
      densidad: 'comoda',
      modo: 'sistema',
    },
  },
  {
    id: 'oceano',
    nombre: 'Océano',
    descripcion: 'Verde azulado y ámbar. Tranquilo y técnico.',
    apariencia: {
      tema: 'oceano',
      colores: { primario: '#0E7C86', acento: '#FFC857', info: '#2F6FED', alerta: '#E5484D', estructura: '#12343B' },
      fuenteTitulos: 'jakarta',
      fuenteTexto: 'jakarta',
      esquinas: 'suaves',
      botones: 'redondeados',
      tarjetas: 'sombra',
      barra: 'oscura',
      densidad: 'comoda',
      modo: 'sistema',
    },
  },
  {
    id: 'grafito',
    nombre: 'Grafito',
    descripcion: 'Azul corporativo sobre grises neutros, con bordes finos y más datos por pantalla.',
    apariencia: {
      tema: 'grafito',
      colores: { primario: '#2563EB', acento: '#34D399', info: '#0891B2', alerta: '#DC2626', estructura: '#1F2937' },
      fuenteTitulos: 'inter',
      fuenteTexto: 'inter',
      esquinas: 'suaves',
      botones: 'redondeados',
      tarjetas: 'borde',
      barra: 'clara',
      densidad: 'compacta',
      modo: 'sistema',
    },
  },
  {
    id: 'bosque',
    nombre: 'Bosque',
    descripcion: 'Verdes profundos con un toque de lima. Sereno.',
    apariencia: {
      tema: 'bosque',
      colores: { primario: '#1F7A4D', acento: '#D9F26B', info: '#2B6CB0', alerta: '#D9485F', estructura: '#1D3B2F' },
      fuenteTitulos: 'space-grotesk',
      fuenteTexto: 'inter',
      esquinas: 'suaves',
      botones: 'redondeados',
      tarjetas: 'sombra',
      barra: 'oscura',
      densidad: 'comoda',
      modo: 'sistema',
    },
  },
  {
    id: 'vino',
    nombre: 'Vino',
    descripcion: 'Granate y dorado con títulos con serifa. Elegante.',
    apariencia: {
      tema: 'vino',
      colores: { primario: '#9B2C5A', acento: '#F2C14E', info: '#3B6FD4', alerta: '#E4572E', estructura: '#3A1F2B' },
      fuenteTitulos: 'fraunces',
      fuenteTexto: 'nunito-sans',
      esquinas: 'suaves',
      botones: 'redondeados',
      tarjetas: 'sombra',
      barra: 'oscura',
      densidad: 'comoda',
      modo: 'sistema',
    },
  },
  {
    id: 'medianoche',
    nombre: 'Medianoche',
    descripcion: 'Violeta eléctrico y turquesa, pensado para el modo oscuro.',
    apariencia: {
      tema: 'medianoche',
      colores: { primario: '#7C5CFC', acento: '#3DDBD9', info: '#4C8DFF', alerta: '#FF5C8A', estructura: '#1B2036' },
      fuenteTitulos: 'space-grotesk',
      fuenteTexto: 'manrope',
      esquinas: 'redondas',
      botones: 'pildora',
      tarjetas: 'planas',
      barra: 'oscura',
      densidad: 'comoda',
      modo: 'oscuro',
    },
  },
  {
    id: 'arena',
    nombre: 'Arena',
    descripcion: 'Terracota sobre tonos cálidos, esquinas rectas y barra clara. Sobrio.',
    apariencia: {
      tema: 'arena',
      colores: { primario: '#B4532A', acento: '#E9C46A', info: '#3D6FB6', alerta: '#C8324B', estructura: '#4A3F35' },
      fuenteTitulos: 'lora',
      fuenteTexto: 'dm-sans',
      esquinas: 'rectas',
      botones: 'rectos',
      tarjetas: 'borde',
      barra: 'clara',
      densidad: 'comoda',
      modo: 'sistema',
    },
  },
];

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color no válido: usa el formato #RRGGBB')
  .transform((s) => s.toUpperCase());
const idFuente = z.string().refine((v) => FUENTES.some((f) => f.id === v), 'Tipografía desconocida');

export const aparienciaSchema = z.object({
  tema: z.string().trim().max(40).default('personalizado'),
  colores: z.object({ primario: hex, acento: hex, info: hex, alerta: hex, estructura: hex }),
  fuenteTitulos: idFuente,
  fuenteTexto: idFuente,
  esquinas: z.enum(['rectas', 'suaves', 'redondas']),
  botones: z.enum(['pildora', 'redondeados', 'rectos']),
  tarjetas: z.enum(['sombra', 'borde', 'planas']),
  barra: z.enum(['oscura', 'clara', 'color']),
  densidad: z.enum(['comoda', 'compacta']),
  modo: z.enum(['claro', 'oscuro', 'sistema']),
  nombreApp: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || null),
});

/** Completa con los valores por defecto lo que falte o no sea válido (datos antiguos o incompletos). */
export function normalizarApariencia(raw: unknown): Apariencia {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const colores = { ...APARIENCIA_DEFECTO.colores, ...((r.colores && typeof r.colores === 'object' ? r.colores : {}) as object) };
  const p = aparienciaSchema.safeParse({ ...APARIENCIA_DEFECTO, ...r, colores });
  return p.success ? (p.data as Apariencia) : { ...APARIENCIA_DEFECTO };
}

/** Preferencias de cada persona dentro de una empresa (se guardan en usuario_empresas.preferencias). */
export interface Preferencias {
  /** Aplicaciones favoritas del lanzador, en el orden elegido. Sin definir: las propuestas por defecto. */
  favoritos?: string[];
}

export const preferenciasSchema = z.object({
  favoritos: z.array(z.string().trim().min(1).max(24)).max(40).optional(),
});
