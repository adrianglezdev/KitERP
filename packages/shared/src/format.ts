/** Formateo común (es-ES) para la web, los PDF y los emails. */
// En español los números de cuatro cifras no llevan separador de miles por defecto («7908,00 €»
// junto a «10.712,00 €»). Se fuerza para que todas las cifras de una pantalla se lean igual.
const G = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', ...G });
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, ...G });

export function fmtMoney(v: number | string | null | undefined, currency = 'EUR'): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (currency === 'EUR') return eur.format(n);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, ...G }).format(n);
}
export function fmtNumber(v: number | string | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || v === '') return '—';
  return decimals === 2 ? num.format(Number(v)) : new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimals, ...G }).format(Number(v));
}
export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v.length === 10 ? v + 'T12:00:00' : v) : v;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${sign}${hh}:${String(mm === 60 ? 0 : mm).padStart(2, '0')} h`;
}
export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}
