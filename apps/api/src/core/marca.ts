import { normalizarApariencia } from '@kite/shared';

/** Colores de serie de los documentos y correos (tema «Cometa»). Los nombres son históricos. */
export const BRAND = {
  /** Color principal: títulos y acentos. */
  violeta: '#5559E6',
  /** Color de estructura: cabeceras de tabla y totales. */
  morado: '#38465C',
  verde: '#4D6B00',
  marron: '#C81E6E',
  amarillo: '#C6FA2D',
  tinta: '#1E2635',
  gris: '#707A8E',
  linea: '#E3E6EE',
  /** Fondo suave de los recuadros. */
  suave: '#F4F5F9',
};
export type Marca = typeof BRAND;

function luminancia(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/**
 * Colores de marca de una empresa para lo que sale fuera (PDF de presupuestos y facturas, correos):
 * su color principal y el de estructura, tomados de la apariencia que ha configurado.
 * Si alguno es demasiado claro para leerse sobre blanco se usa el de serie.
 */
export function marcaDe(ajustes: unknown): Marca {
  const ap = normalizarApariencia((ajustes as { apariencia?: unknown } | null | undefined)?.apariencia);
  const legible = (hex: string, alt: string) => (luminancia(hex) < 0.45 ? hex : alt);
  return { ...BRAND, violeta: legible(ap.colores.primario, BRAND.violeta), morado: legible(ap.colores.estructura, BRAND.morado) };
}
