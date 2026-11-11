/** Formateo común (es-ES) para la web, los PDF y los emails. */
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export function fmtMoney(v: number | string | null | undefined, currency = 'EUR'): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (currency === 'EUR') return eur.format(n);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n);
}
export function fmtNumber(v: number | string | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || v === '') return '—';
  return decimals === 2 ? num.format(Number(v)) : new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimals }).format(Number(v));
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
