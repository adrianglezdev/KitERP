/** @type {import('tailwindcss').Config} */
// Todos los colores, tipografías, radios y sombras salen de variables CSS: las define el tema de
// cada empresa (src/lib/theme.ts) y aquí solo se les da nombre.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const r = (rem) => `calc(${rem}rem * var(--radius, 1))`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        sunken: v('sunken'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        fg: v('fg'),
        muted: v('muted'),
        primary: { DEFAULT: v('primary'), fg: v('primary-fg'), soft: v('primary-soft'), ink: v('primary-ink') },
        lime: { DEFAULT: v('sun'), fg: v('sun-fg'), soft: v('sun-soft') },
        pink: { DEFAULT: v('earth'), soft: v('earth-soft') },
        deep: { DEFAULT: v('deep'), fg: v('deep-fg') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        bad: { DEFAULT: v('bad'), soft: v('bad-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        sun: { DEFAULT: v('sun'), fg: v('sun-fg'), soft: v('sun-soft') },
        earth: { DEFAULT: v('earth'), fg: v('earth-fg'), soft: v('earth-soft') },
        leaf: { DEFAULT: v('leaf'), fg: v('leaf-fg'), soft: v('leaf-soft') },
        // Barra lateral (oscura, clara o del color principal, según el tema)
        side: { DEFAULT: v('side'), fg: v('side-fg'), active: v('side-active'), 'active-fg': v('side-active-fg') },
      },
      // Como texto, «primary» usa su versión tinta: legible sobre fondos claros y oscuros
      textColor: { primary: { DEFAULT: v('primary-ink') } },
      fontFamily: {
        sans: ['var(--font-sans)', 'Manrope', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      // Los radios se multiplican por --radius (esquinas rectas, suaves o redondas)
      borderRadius: {
        sm: r(0.125),
        DEFAULT: r(0.25),
        md: r(0.375),
        lg: r(0.75),
        xl: r(1),
        '2xl': r(1.25),
        '3xl': r(1.5),
        // Botones, pestañas, insignias y buscadores (píldora, redondeado o recto)
        pill: 'var(--radius-pill, 9999px)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'pop-in': { from: { opacity: 0, transform: 'scale(.97)' }, to: { opacity: 1, transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'slide-left': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-right': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'pop-in': 'pop-in .14s ease-out',
        'slide-up': 'slide-up .22s ease-out',
        'slide-left': 'slide-left .22s ease-out',
        'slide-right': 'slide-right .22s ease-out',
      },
    },
  },
  plugins: [],
};
