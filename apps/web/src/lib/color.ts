/** Utilidades de color para derivar un tema completo a partir de los cinco colores de marca. */

export type RGB = [number, number, number];

export const WHITE: RGB = [255, 255, 255];
export const BLACK: RGB = [0, 0, 0];

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Tripleta «r g b» que usan las variables CSS (Tailwind añade la opacidad). */
export function triplet(c: RGB): string {
  return c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(' ');
}

/** Mezcla `a` con `b`; `t` es la proporción de `b` (0 = a, 1 = b). */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** [h 0-360, s 0-1, l 0-1] */
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

export function hsl(h: number, s: number, l: number): RGB {
  const S = Math.max(0, Math.min(1, s));
  const L = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * Oscurece o aclara un color (manteniendo el tono) hasta que contraste lo pedido contra `bg`.
 * Sirve para obtener la versión «tinta» de un color de marca: legible como texto.
 */
export function ink(color: RGB, bg: RGB, target = 4.5): RGB {
  if (contrast(color, bg) >= target) return color;
  const [h, s, l0] = rgbToHsl(color);
  const darker = luminance(bg) > 0.4;
  let l = l0;
  let out = color;
  for (let i = 0; i < 60; i++) {
    l += darker ? -0.015 : 0.015;
    if (l <= 0.02 || l >= 0.98) break;
    // Al aclarar mucho, baja algo la saturación para que no chille sobre fondo oscuro
    out = hsl(h, darker ? Math.min(1, s * 1.05) : s * (1 - (l - l0) * 0.25), l);
    if (contrast(out, bg) >= target) break;
  }
  return out;
}

/** Color de texto (claro u oscuro) que mejor se lee sobre `bg`. Prefiere el blanco si llega a un contraste razonable. */
export function on(bg: RGB, dark: RGB = [26, 32, 44]): RGB {
  const w = contrast(WHITE, bg);
  return w >= 3 || w >= contrast(dark, bg) ? WHITE : dark;
}
