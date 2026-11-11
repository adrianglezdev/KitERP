/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        sunken: v('sunken'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        primary: { DEFAULT: v('primary'), fg: v('primary-fg'), soft: v('primary-soft') },
        deep: { DEFAULT: v('deep'), fg: v('deep-fg') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        bad: { DEFAULT: v('bad'), soft: v('bad-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        sun: { DEFAULT: v('sun'), soft: v('sun-soft') },
        earth: { DEFAULT: v('earth'), soft: v('earth-soft') },
        leaf: { DEFAULT: v('leaf'), soft: v('leaf-soft') },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      boxShadow: {
        card: '0 1px 2px rgb(40 18 60 / 0.05), 0 1px 1px rgb(40 18 60 / 0.03)',
        pop: '0 12px 32px -8px rgb(40 18 60 / 0.25), 0 2px 6px rgb(40 18 60 / 0.08)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'slide-left': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .18s ease-out', 'slide-up': 'slide-up .22s ease-out', 'slide-left': 'slide-left .22s ease-out' },
    },
  },
  plugins: [],
};
