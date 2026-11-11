import { useEffect, useState } from 'react';
import { satShared } from '@kite/shared';
import { api } from '@/lib/api';

export const { TICKET_ESTADOS, ORDEN_ESTADOS, ORDEN_TIPOS, PRIORIDADES, CANALES, CONTRATO_ESTADOS, PERIODICIDADES } = satShared;

export const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
export const sumarDias = (fecha: string, n: number) => new Date(Date.parse(fecha + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);

export const hora = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '—');
export const diaLargo = (fecha: string) => new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/** ISO → "AAAA-MM-DDTHH:mm" en hora de Madrid (para <input type="datetime-local">). */
export function aLocal(v: string | Date | null | undefined) {
  if (!v) return '';
  const d = new Date(v);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

export function minutosTexto(min: number | null | undefined) {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** Tiempo restante de un SLA en texto corto. */
export function restanteTexto(min: number | null | undefined) {
  if (min === null || min === undefined) return '';
  const abs = Math.abs(min);
  const t = abs >= 1440 ? `${Math.floor(abs / 1440)} d ${Math.floor((abs % 1440) / 60)} h` : abs >= 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${abs} min`;
  return min < 0 ? `vencido hace ${t}` : `quedan ${t}`;
}

export function telHref(t: string | null | undefined) {
  return t ? `tel:${t.replace(/[^\d+]/g, '')}` : undefined;
}

/** ¿Hay conexión? (se actualiza al perderla o recuperarla). */
export function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/* ── Almacenamiento local resistente (modo privado o almacenamiento lleno: no rompe nada) ── */

export function leerLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function guardarLocal(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cambios de estado pendientes de enviar (en ruta, empezar…) cuando no hay cobertura.
 * Se guardan en una cola local y se reenvían al recuperar la conexión.
 */
const COLA = 'sat:cola-estados';
interface Pendiente {
  ordenId: string;
  estado: string;
  en: string;
}
export function encolarEstado(ordenId: string, estado: string) {
  const cola = (leerLocal<Pendiente[]>(COLA) ?? []).filter((p) => p.ordenId !== ordenId);
  cola.push({ ordenId, estado, en: new Date().toISOString() });
  guardarLocal(COLA, cola);
}
export function estadosPendientes(): Pendiente[] {
  return leerLocal<Pendiente[]>(COLA) ?? [];
}
export async function vaciarColaEstados() {
  const cola = estadosPendientes();
  if (!cola.length) return 0;
  const quedan: Pendiente[] = [];
  let enviados = 0;
  for (const p of cola) {
    try {
      await api.post(`/sat/ordenes/${p.ordenId}/estado`, { estado: p.estado, en: p.en, cronometro: false });
      enviados++;
    } catch (e: any) {
      // si el servidor lo rechaza (p. ej. ya está finalizada) se descarta; si es la red, se reintenta
      if (!(e?.status >= 400 && e?.status < 500)) quedan.push(p);
    }
  }
  guardarLocal(COLA, quedan.length ? quedan : null);
  return enviados;
}

export const esErrorDeRed = (e: any) => !(e && typeof e.status === 'number' && e.status > 0);
