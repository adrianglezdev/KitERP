/**
 * Tema de la aplicación.
 *
 * Cada empresa guarda su apariencia (colores, tipografías, formas…). Aquí se convierte en variables
 * CSS que usan Tailwind y todos los componentes, con sus versiones clara y oscura. El resultado se
 * guarda también en localStorage para pintarlo antes de que cargue React (ver index.html) y para
 * que la pantalla de entrada recuerde la marca de la última empresa.
 */
import { useEffect, useState } from 'react';
import { fuente, normalizarApariencia, type Apariencia } from '@kite/shared';
import { WHITE, contrast, hexToRgb, hsl, ink, luminance, mix, on, rgbToHex, rgbToHsl, triplet, type RGB } from './color';

export type Mode = 'light' | 'dark';
type Vars = Record<string, string>;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Fondo suave de un color: más mezcla de blanco cuanto más oscuro es el color. */
function soft(c: RGB): RGB {
  const k = 0.89 - clamp((luminance(c) - 0.3) / 0.5, 0, 1) * 0.14;
  return mix(c, WHITE, k);
}

interface Tokens {
  light: Vars;
  dark: Vars;
  base: Vars;
}

export function buildTokens(input: Apariencia): Tokens {
  const ap = normalizarApariencia(input);
  const P = hexToRgb(ap.colores.primario);
  const A = hexToRgb(ap.colores.acento);
  const I = hexToRgb(ap.colores.info);
  const R = hexToRgb(ap.colores.alerta);
  const S = hexToRgb(ap.colores.estructura);
  const [h, s] = rgbToHsl(S);
  // Los grises toman el tono del color de estructura, con una saturación contenida
  const sat = clamp(s * 1.25, 0, 0.34);
  const [ah] = rgbToHsl(A);
  const accentFg: RGB = luminance(A) > 0.36 ? hsl(ah, 0.3, 0.14) : WHITE;

  /* ── Claro ── */
  const lSurface = WHITE;
  const lBg = hsl(h, sat, 0.962);
  const lSunken = hsl(h, sat * 0.95, 0.945);
  const lLine = hsl(h, sat * 0.9, 0.94);
  const lLineStrong = hsl(h, sat * 0.7, 0.87);
  const lFg = hsl(h, Math.min(s * 1.15, 0.3), 0.16);
  const lMuted = hsl(h, Math.min(s * 0.5, 0.14), 0.47);
  const lPrimarySoft = soft(P);
  const lPrimaryInk = ink(P, lPrimarySoft, 4.5);
  const light: Vars = {
    bg: triplet(lBg),
    surface: triplet(lSurface),
    sunken: triplet(lSunken),
    line: triplet(lLine),
    'line-strong': triplet(lLineStrong),
    fg: triplet(lFg),
    muted: triplet(lMuted),
    primary: triplet(P),
    'primary-fg': triplet(on(P, lFg)),
    'primary-soft': triplet(lPrimarySoft),
    'primary-ink': triplet(lPrimaryInk),
    deep: triplet(S),
    'deep-fg': triplet(on(S, lFg)),
    ok: triplet(ink(A, soft(A), 4.5)),
    'ok-soft': triplet(mix(soft(A), WHITE, 0.15)),
    warn: triplet(lPrimaryInk),
    'warn-soft': triplet(lPrimarySoft),
    bad: triplet(ink(R, soft(R), 4.5)),
    'bad-soft': triplet(soft(R)),
    info: triplet(ink(I, soft(I), 4.5)),
    'info-soft': triplet(soft(I)),
    sun: triplet(A),
    'sun-fg': triplet(accentFg),
    'sun-soft': triplet(soft(A)),
    earth: triplet(R),
    'earth-fg': triplet(on(R, lFg)),
    'earth-soft': triplet(soft(R)),
    leaf: triplet(I),
    'leaf-fg': triplet(on(I, lFg)),
    'leaf-soft': triplet(soft(I)),
    'chart-1': triplet(P),
    'chart-2': triplet(I),
    'chart-3': triplet(R),
    'chart-4': triplet(contrast(A, lSurface) >= 1.25 ? A : ink(A, lSurface, 1.6)),
    'chart-5': triplet(S),
    'chart-6': triplet(mix(P, WHITE, 0.62)),
  };

  /* ── Oscuro ── */
  const dBg = hsl(h, sat * 0.95, 0.11);
  const dSurface = hsl(h, sat * 0.85, 0.153);
  const dSunken = hsl(h, sat * 0.8, 0.21);
  const dLine = hsl(h, sat * 0.75, 0.215);
  const dLineStrong = hsl(h, sat * 0.65, 0.3);
  const dFg = hsl(h, Math.min(sat, 0.3), 0.95);
  const dMuted = hsl(h, Math.min(s * 0.6, 0.15), 0.63);
  const dPrimary = ink(mix(P, WHITE, 0.12), dSurface, 3);
  const dPrimaryInk = ink(mix(P, WHITE, 0.3), dSurface, 6.2);
  const dPrimarySoft = mix(dSurface, P, 0.24);
  const dOk = ink(A, dSurface, 6.5);
  const dBad = ink(mix(R, WHITE, 0.2), dSurface, 6);
  const dInfo = ink(mix(I, WHITE, 0.25), dSurface, 6);
  const dark: Vars = {
    bg: triplet(dBg),
    surface: triplet(dSurface),
    sunken: triplet(dSunken),
    line: triplet(dLine),
    'line-strong': triplet(dLineStrong),
    fg: triplet(dFg),
    muted: triplet(dMuted),
    primary: triplet(dPrimary),
    'primary-fg': triplet(on(dPrimary, lFg)),
    'primary-soft': triplet(dPrimarySoft),
    'primary-ink': triplet(dPrimaryInk),
    deep: triplet(hsl(h, sat, 0.08)),
    'deep-fg': triplet(WHITE),
    ok: triplet(dOk),
    'ok-soft': triplet(mix(dSurface, A, 0.14)),
    warn: triplet(dPrimaryInk),
    'warn-soft': triplet(dPrimarySoft),
    bad: triplet(dBad),
    'bad-soft': triplet(mix(dSurface, R, 0.2)),
    info: triplet(dInfo),
    'info-soft': triplet(mix(dSurface, I, 0.26)),
    sun: triplet(A),
    'sun-fg': triplet(accentFg),
    'sun-soft': triplet(mix(dSurface, A, 0.14)),
    earth: triplet(dBad),
    'earth-fg': triplet(on(dBad, lFg)),
    'earth-soft': triplet(mix(dSurface, R, 0.2)),
    leaf: triplet(dInfo),
    'leaf-fg': triplet(on(dInfo, lFg)),
    'leaf-soft': triplet(mix(dSurface, I, 0.26)),
    'chart-1': triplet(dPrimary),
    'chart-2': triplet(dInfo),
    'chart-3': triplet(dBad),
    'chart-4': triplet(ink(A, dSurface, 3)),
    'chart-5': triplet(dMuted),
    'chart-6': triplet(mix(dSurface, P, 0.5)),
  };

  /* ── Barra lateral ── */
  if (ap.barra === 'clara') {
    Object.assign(light, { side: light.surface, 'side-fg': light.fg, 'side-active': light.primary, 'side-active-fg': light['primary-fg'] });
    Object.assign(dark, { side: dark.surface, 'side-fg': dark.fg, 'side-active': dark.primary, 'side-active-fg': dark['primary-fg'] });
  } else if (ap.barra === 'color') {
    const [ph, ps, pl] = rgbToHsl(P);
    const dSide = hsl(ph, ps * 0.85, Math.min(pl, 0.3));
    Object.assign(light, { side: light.primary, 'side-fg': light['primary-fg'], 'side-active': light.sun, 'side-active-fg': light['sun-fg'] });
    Object.assign(dark, { side: triplet(dSide), 'side-fg': triplet(WHITE), 'side-active': dark.sun, 'side-active-fg': dark['sun-fg'] });
  } else {
    Object.assign(light, { side: light.deep, 'side-fg': light['deep-fg'], 'side-active': light.sun, 'side-active-fg': light['sun-fg'] });
    Object.assign(dark, { side: dark.deep, 'side-fg': dark['deep-fg'], 'side-active': dark.sun, 'side-active-fg': dark['sun-fg'] });
  }

  /* ── Sombras y bordes de las tarjetas ── */
  const sTrip = triplet(S);
  if (ap.tarjetas === 'borde') {
    light['shadow-card'] = `0 0 0 1px rgb(${triplet(lLineStrong)})`;
    dark['shadow-card'] = `0 0 0 1px rgb(${triplet(dLineStrong)})`;
  } else if (ap.tarjetas === 'planas') {
    light['shadow-card'] = '0 0 #0000';
    dark['shadow-card'] = '0 0 #0000';
  } else {
    light['shadow-card'] = `0 1px 2px rgb(${sTrip} / 0.06), 0 6px 20px -10px rgb(${sTrip} / 0.16)`;
    dark['shadow-card'] = '0 0 #0000';
  }
  light['shadow-pop'] = `0 24px 48px -16px rgb(${triplet(lFg)} / 0.28)`;
  dark['shadow-pop'] = '0 24px 48px -16px rgb(0 0 0 / 0.6)';

  /* ── Lo que no depende del modo ── */
  const ft = fuente(ap.fuenteTitulos);
  const fx = fuente(ap.fuenteTexto);
  const base: Vars = {
    'font-display': ft.familia,
    'font-sans': fx.familia,
    'font-weight-body': String(fx.peso),
    radius: ap.esquinas === 'rectas' ? '0.25' : ap.esquinas === 'suaves' ? '0.6' : '1',
    'radius-pill': ap.botones === 'pildora' ? '9999px' : ap.botones === 'redondeados' ? '0.625rem' : '0.25rem',
    density: ap.densidad === 'compacta' ? '14.5px' : '16px',
    'text-base': ap.densidad === 'compacta' ? '13.5px' : '14px',
  };
  return { light, dark, base };
}

const decl = (v: Vars) =>
  Object.entries(v)
    .map(([k, val]) => `--${k}:${val}`)
    .join(';');

/** CSS con las variables del tema. `html:root` gana en especificidad a los valores por defecto de index.css. */
export function themeCss(ap: Apariencia): string {
  const t = buildTokens(ap);
  return `html:root{${decl(t.base)};${decl(t.light)};color-scheme:light}html[data-theme='dark']{${decl(t.dark)};color-scheme:dark}`;
}

/** Dirección de Google Fonts con las tipografías del tema (null si no hace falta cargar nada). */
export function fontsUrl(ap: Apariencia): string | null {
  const specs = [...new Set([fuente(ap.fuenteTitulos).google, fuente(ap.fuenteTexto).google].filter(Boolean))] as string[];
  if (!specs.length) return null;
  return `https://fonts.googleapis.com/css2?${specs.map((s) => `family=${s}`).join('&')}&display=swap`;
}

/** Colores de muestra de un tema (para las vistas previas), como hexadecimales. */
export function swatches(ap: Apariencia, mode: Mode = 'light') {
  const t = buildTokens(ap)[mode];
  const hex = (k: string) => rgbToHex(t[k]!.split(' ').map(Number) as RGB);
  return {
    bg: hex('bg'),
    surface: hex('surface'),
    sunken: hex('sunken'),
    fg: hex('fg'),
    muted: hex('muted'),
    primary: hex('primary'),
    primaryFg: hex('primary-fg'),
    primarySoft: hex('primary-soft'),
    accent: hex('sun'),
    accentFg: hex('sun-fg'),
    info: hex('leaf'),
    alert: hex('earth'),
    side: hex('side'),
    sideFg: hex('side-fg'),
    sideActive: hex('side-active'),
    sideActiveFg: hex('side-active-fg'),
  };
}

/* ───────────────────────── Aplicar ───────────────────────── */

export interface Brand {
  /** Empresa a la que pertenece (null: marca genérica de la instalación). */
  empresaId: string | null;
  nombre: string | null;
  logoUrl: string | null;
  apariencia: Apariencia;
}

const KEY_BRAND = 'kite-brand';
const KEY_MODE = 'kite-theme';

function ensureEl<T extends HTMLElement>(id: string, tag: string, attrs: Record<string, string> = {}): T {
  let el = document.getElementById(id) as T | null;
  if (!el) {
    el = document.createElement(tag) as T;
    el.id = id;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  return el;
}

/** Modo elegido por la persona en este dispositivo (null: el que proponga la empresa). */
export function storedMode(): Mode | null {
  try {
    const t = localStorage.getItem(KEY_MODE);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
}

export function resolveMode(ap: Apariencia | null): Mode {
  const own = storedMode();
  if (own) return own;
  if (ap?.modo === 'oscuro') return 'dark';
  if (ap?.modo === 'claro') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current: Brand | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function currentBrand(): Brand | null {
  return current;
}

/** Nombre que se muestra como nombre de la aplicación. */
export function appName(b: Brand | null = current): string {
  return b?.apariencia.nombreApp || b?.nombre || 'KiteERP';
}

/**
 * Pinta la marca: variables CSS, tipografías y modo.
 *  - `persist`: es la marca de la empresa de la sesión; se recuerda para el próximo arranque.
 *  - `visitor`: es la marca de una página pública (un cliente abre un enlace); vale mientras
 *    dure la visita y no se guarda.
 *  - sin opciones: vista previa del editor de apariencia, que se deshace con `restoreBrand`.
 */
export function applyBrand(brand: Brand, opts: { persist?: boolean; visitor?: boolean } = {}) {
  const ap = normalizarApariencia(brand.apariencia);
  const css = themeCss(ap);
  ensureEl<HTMLStyleElement>('kite-brand-css', 'style').textContent = css;
  const fonts = fontsUrl(ap);
  if (fonts) {
    const link = ensureEl<HTMLLinkElement>('kite-brand-fonts', 'link', { rel: 'stylesheet' });
    if (link.getAttribute('href') !== fonts) link.setAttribute('href', fonts);
  }
  const mode = resolveMode(ap);
  document.documentElement.dataset.theme = mode;
  const t = buildTokens(ap)[mode];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', `rgb(${t.bg!.split(' ').join(',')})`);
  if (opts.persist || opts.visitor) current = { ...brand, apariencia: ap };
  if (opts.persist) {
    try {
      localStorage.setItem(KEY_BRAND, JSON.stringify({ empresaId: brand.empresaId, nombre: brand.nombre, logoUrl: brand.logoUrl, apariencia: ap, css, fonts, modo: ap.modo }));
    } catch {
      /* sin almacenamiento */
    }
  }
  emit();
}

/** Vuelve a la marca guardada (al salir del editor sin guardar). */
export function restoreBrand() {
  if (current) applyBrand(current);
}

/** Marca recordada del último arranque (la usa la pantalla de entrada mientras llega la del servidor). */
export function cachedBrand(): Brand | null {
  try {
    const raw = localStorage.getItem(KEY_BRAND);
    if (!raw) return null;
    const b = JSON.parse(raw);
    return { empresaId: b.empresaId ?? null, nombre: b.nombre ?? null, logoUrl: b.logoUrl ?? null, apariencia: normalizarApariencia(b.apariencia) };
  } catch {
    return null;
  }
}

/** Cambia el modo claro/oscuro de esta persona en este dispositivo. */
export function setMode(mode: Mode) {
  try {
    localStorage.setItem(KEY_MODE, mode);
  } catch {
    /* sin almacenamiento */
  }
  document.documentElement.dataset.theme = mode;
  if (current) applyBrand(current);
  else emit();
}

export function useMode(): [Mode, (m: Mode) => void] {
  const [mode, set] = useState<Mode>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    const l = () => set(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return [mode, setMode];
}

/** Marca activa (se actualiza al cambiar de empresa o al guardar la apariencia). */
export function useBrand(): Brand | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return current ?? cachedBrand();
}

/** Colores de las series de los gráficos: siguen el tema. */
export const CHART = {
  primary: 'rgb(var(--chart-1))',
  info: 'rgb(var(--chart-2))',
  alert: 'rgb(var(--chart-3))',
  accent: 'rgb(var(--chart-4))',
  neutral: 'rgb(var(--chart-5))',
  soft: 'rgb(var(--chart-6))',
} as const;
export const SERIES_COLORS = [CHART.primary, CHART.info, CHART.alert, CHART.accent, CHART.neutral, CHART.soft];
