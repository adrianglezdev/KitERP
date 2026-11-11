import { api } from '@/lib/api';
import { esErrorDeRed, guardarLocal, leerLocal } from './lib';

/**
 * Parte de trabajo en curso, guardado en el móvil.
 * El técnico puede quedarse sin cobertura en un sótano: todo lo que escribe se guarda en el
 * dispositivo y el servidor solo recibe el parte final (con un identificador para no duplicarlo).
 */
export interface ParteBorrador {
  uid: string;
  ordenId: string;
  codigo: string;
  trabajoRealizado: string;
  checklist: Record<string, { hecho: boolean; nota?: string | null }>;
  materiales: { articuloId: string; label: string; cantidad: number; almacenId?: string | null }[];
  /** Tramos de tiempo medidos en el móvil sin conexión. */
  tiempos: { inicio: string; fin: string }[];
  /** Cronómetro local en marcha (cuando no se pudo avisar al servidor). */
  cronoLocal: string | null;
  horas: number | null;
  desplazamiento: boolean;
  facturable: boolean;
  firma: string | null;
  firmaNombre: string;
  /** Pendiente de enviar (se intentó sin cobertura). */
  pendienteEnvio: boolean;
  error: string | null;
  actualizado: string;
}

const PREFIJO = 'sat:parte:';
const clave = (ordenId: string) => `${PREFIJO}${ordenId}`;

export function nuevoUid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function leerParte(ordenId: string) {
  return leerLocal<ParteBorrador>(clave(ordenId));
}
export function guardarParte(p: ParteBorrador) {
  return guardarLocal(clave(p.ordenId), { ...p, actualizado: new Date().toISOString() });
}
export function borrarParte(ordenId: string) {
  guardarLocal(clave(ordenId), null);
}

export function partesGuardados(): ParteBorrador[] {
  const out: ParteBorrador[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIJO)) {
        const p = leerLocal<ParteBorrador>(k);
        if (p) out.push(p);
      }
    }
  } catch {
    /* sin almacenamiento */
  }
  return out;
}

export function cuerpoCierre(p: ParteBorrador) {
  const tiempos = [...p.tiempos];
  if (p.cronoLocal) tiempos.push({ inicio: p.cronoLocal, fin: new Date().toISOString() });
  return {
    uid: p.uid,
    trabajoRealizado: p.trabajoRealizado.trim(),
    checklist: Object.entries(p.checklist).map(([id, v]) => ({ id, hecho: v.hecho, nota: v.nota ?? null })),
    materiales: p.materiales.filter((m) => m.cantidad > 0).map((m) => ({ articuloId: m.articuloId, cantidad: m.cantidad, almacenId: m.almacenId ?? null })),
    tiempos,
    horas: p.horas,
    desplazamiento: p.desplazamiento,
    facturable: p.facturable,
    firma: p.firma,
    firmaNombre: p.firmaNombre.trim() || null,
  };
}

export type ResultadoEnvio = { ok: true; albaranId: string | null } | { ok: false; red: boolean; mensaje: string };

/** Envía un parte. Si no hay red queda marcado para reenviarlo; si el servidor lo rechaza se guarda el motivo. */
export async function enviarParte(p: ParteBorrador): Promise<ResultadoEnvio> {
  try {
    const r = await api.post<{ albaranId: string | null }>(`/sat/ordenes/${p.ordenId}/cerrar`, cuerpoCierre(p));
    borrarParte(p.ordenId);
    return { ok: true, albaranId: r.albaranId };
  } catch (e: any) {
    const red = esErrorDeRed(e);
    guardarParte({ ...p, pendienteEnvio: red, error: red ? null : (e?.message ?? 'No se ha podido enviar') });
    return { ok: false, red, mensaje: red ? 'Sin conexión' : (e?.message ?? 'No se ha podido enviar') };
  }
}

/** Reenvía los partes que se quedaron pendientes por falta de cobertura. Devuelve cuántos se enviaron. */
export async function reenviarPartes() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  let n = 0;
  for (const p of partesGuardados().filter((x) => x.pendienteEnvio)) {
    const r = await enviarParte(p);
    if (r.ok) n++;
    else if (r.red) break;
  }
  return n;
}
