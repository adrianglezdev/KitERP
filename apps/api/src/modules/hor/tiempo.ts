/**
 * Fechas y horas en Europe/Madrid. El servidor guarda instantes (timestamptz);
 * la jornada se agrupa por día y hora local de España peninsular.
 */
const TZ = 'Europe/Madrid';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function parts(d: Date) {
  const p = partsFmt.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour') === '24' ? '00' : g('hour'), mi: g('minute'), s: g('second') };
}

/** AAAA-MM-DD de un instante en hora de Madrid. */
export function fechaMadrid(d: Date | string = new Date()): string {
  const p = parts(typeof d === 'string' ? new Date(d) : d);
  return `${p.y}-${p.m}-${p.d}`;
}
export const hoyMadrid = () => fechaMadrid(new Date());

/** HH:MM de un instante en hora de Madrid. */
export function horaMadrid(d: Date | string): string {
  const p = parts(typeof d === 'string' ? new Date(d) : d);
  return `${p.h}:${p.mi}`;
}

/** Desfase de Madrid respecto a UTC en minutos para ese instante (60 o 120). */
export function offsetMadridMin(d: Date): number {
  const p = parts(d);
  const asUtc = Date.UTC(Number(p.y), Number(p.m) - 1, Number(p.d), Number(p.h), Number(p.mi), Number(p.s));
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** Instante correspondiente a una fecha y hora locales de Madrid. */
export function madridAInstante(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, d!, h!, mi!));
  const off = offsetMadridMin(new Date(guess.getTime() - 60 * 60000));
  const r = new Date(guess.getTime() - off * 60000);
  // ajuste fino en los cambios de hora
  const off2 = offsetMadridMin(r);
  return off2 === off ? r : new Date(guess.getTime() - off2 * 60000);
}

/** Medianoche (inicio del día) en Madrid como instante UTC. */
export const inicioDiaMadrid = (fecha: string) => madridAInstante(fecha, '00:00');

export function addDays(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + 'T12:00:00Z').getTime() - new Date(desde + 'T12:00:00Z').getTime()) / 86400000);
}

/** 1 = lunes … 7 = domingo */
export function diaSemana(fecha: string): number {
  const w = new Date(fecha + 'T12:00:00Z').getUTCDay();
  return w === 0 ? 7 : w;
}

export function lunesDe(fecha: string): string {
  return addDays(fecha, 1 - diaSemana(fecha));
}

export function rangoDias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = addDays(f, 1)) {
    out.push(f);
    if (out.length > 800) break;
  }
  return out;
}

/** Primer y último día de un mes AAAA-MM. */
export function limitesMes(mes: string): { desde: string; hasta: string; anio: number; m: number } {
  const [y, m] = mes.split('-').map(Number);
  const desde = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { desde, hasta: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`, anio: y!, m: m! };
}

export const mesActual = () => hoyMadrid().slice(0, 7);

/** Minutos desde medianoche de "HH:MM". */
export function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Horas entre dos "HH:MM" (si la salida es menor, cruza la medianoche). */
export function horasTurno(inicio: string, fin: string, pausaMin = 0): number {
  let d = minutos(fin) - minutos(inicio);
  if (d <= 0) d += 24 * 60;
  return Math.max(0, (d - pausaMin) / 60);
}

export const redondear = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;

/** Distancia en metros entre dos coordenadas (haversine). */
export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
