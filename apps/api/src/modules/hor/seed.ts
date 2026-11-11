import { and, eq, gte, lte } from 'drizzle-orm';
import { OPTIONAL_MODULE_CODES } from '@kite/shared';
import type { Tx } from '../../db/client';
import { festivos } from '../../db/schema/core';
import { hashPassword, sha256 } from '../../core/auth';
import type { SeedCtx } from '../../core/modules';
import { AUSENCIAS_DEMO } from '../aus/demo';
import { hashResumen, jornadas, totales } from './calculo';
import { horAsignaciones, horBolsa, horCorrecciones, horCuadrante, horFichajes, horFirmasMes, horKioscos, horPines, horTurnos } from './schema';
import { addDays, diaSemana, hoyMadrid, limitesMes, madridAInstante, rangoDias } from './tiempo';

/** Token fijo del quiosco de ejemplo: /publico/kiosco/demo-almacen-paterna */
export const KIOSCO_DEMO_TOKEN = 'demo-almacen-paterna';
export const PIN_DEMO = '2468';
/** Firma de ejemplo (PNG mínimo). */
const FIRMA_DEMO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Pseudoaleatorio reproducible a partir de una cadena (minutos de variación). */
function jitter(seed: string, min: number, max: number) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return min + (Math.abs(h) % (max - min + 1));
}

const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export async function seedHor(tx: Tx, s: SeedCtx) {
  const empresaId = s.empresaId;
  const p = s.personas;
  const hoy = hoyMadrid();

  const [general] = await tx.insert(horTurnos).values({ empresaId, nombre: 'Jornada partida', horaInicio: '08:00', horaFin: '17:00', pausaMinutos: 60, dias: [1, 2, 3, 4, 5], color: '#7D2CDD' }).returning();
  const [almacen] = await tx.insert(horTurnos).values({ empresaId, nombre: 'Mañana almacén', horaInicio: '07:00', horaFin: '15:00', pausaMinutos: 30, dias: [1, 2, 3, 4, 5], color: '#35AE29' }).returning();
  const [intensiva] = await tx.insert(horTurnos).values({ empresaId, nombre: 'Intensiva', horaInicio: '08:00', horaFin: '15:00', pausaMinutos: 0, dias: [1, 2, 3, 4, 5], color: '#B28574' }).returning();
  const [guardia] = await tx.insert(horTurnos).values({ empresaId, nombre: 'Guardia SAT', horaInicio: '09:00', horaFin: '14:00', pausaMinutos: 0, dias: [6], color: '#D4BE00' }).returning();

  const turnoDe: Record<string, typeof general> = {
    admin: general,
    direccion: general,
    administracion: general,
    rrhh: intensiva,
    comercial1: general,
    comercial2: general,
    almacen,
    operario: almacen,
    jefesat: general,
    tecnico1: general,
    tecnico2: general,
  };
  const inicio = addDays(hoy, -400);
  for (const [k, t] of Object.entries(turnoDe)) if (p[k]) await tx.insert(horAsignaciones).values({ empresaId, personaId: p[k]!, turnoId: t!.id, desde: inicio });
  // guardias de sábado en el cuadrante
  const sabado = addDays(hoy, 6 - diaSemana(hoy) + (diaSemana(hoy) === 7 ? 7 : 0));
  await tx.insert(horCuadrante).values([
    { empresaId, personaId: p.tecnico1!, fecha: sabado, turnoId: guardia!.id, libre: false },
    { empresaId, personaId: p.tecnico2!, fecha: addDays(sabado, 7), turnoId: guardia!.id, libre: false },
  ]);

  const [kiosco] = await tx.insert(horKioscos).values({ empresaId, nombre: 'Tableta de la entrada del almacén', centroId: s.centros.almacen!, tokenHash: sha256(KIOSCO_DEMO_TOKEN) }).returning();
  const pinHash = await hashPassword(PIN_DEMO);
  for (const k of ['almacen', 'operario', 'tecnico1']) await tx.insert(horPines).values({ personaId: p[k]!, empresaId, pinHash });

  // Fichajes de los últimos 35 días
  const desde = addDays(hoy, -35);
  const fest = await tx.select({ fecha: festivos.fecha, centroId: festivos.centroId }).from(festivos).where(and(eq(festivos.empresaId, empresaId), gte(festivos.fecha, desde), lte(festivos.fecha, hoy)));
  const ahora = Date.now();
  const sede = { lat: 39.4537, lng: -0.3966 };
  const alm = { lat: 39.5216, lng: -0.4559 };
  const filas: (typeof horFichajes.$inferInsert)[] = [];
  let tecnico2Abierta: { fecha: string } | null = null;

  for (const [key, turno] of Object.entries(turnoDe)) {
    const personaId = p[key];
    if (!personaId || !turno) continue;
    const enAlmacen = key === 'almacen' || key === 'operario';
    const movil = ['comercial1', 'comercial2', 'tecnico1', 'tecnico2', 'jefesat'].includes(key);
    for (const fecha of rangoDias(desde, hoy)) {
      const dow = diaSemana(fecha);
      if (dow > 5) continue;
      if (fest.some((f) => f.fecha === fecha && (!f.centroId || f.centroId === s.centros.sede) && !enAlmacen)) continue;
      if (fest.some((f) => f.fecha === fecha && !f.centroId)) continue;
      const aus = AUSENCIAS_DEMO.find((a) => a.key === key && a.estado === 'aprobada' && addDays(hoy, a.desde) <= fecha && addDays(hoy, a.hasta) >= fecha);
      if (aus && !aus.medioDia) continue;
      const off = Math.round((new Date(hoy + 'T12:00:00Z').getTime() - new Date(fecha + 'T12:00:00Z').getTime()) / 86400000);
      if (key === 'comercial2' && off === 4) continue; // día sin fichajes (incidencia)
      if (key === 'direccion' && off % 9 === 0) continue;
      const j = (tag: string, a: number, b: number) => jitter(`${key}|${fecha}|${tag}`, a, b);
      const ini = (aus?.medioDia === 'manana' ? 14 * 60 : Number(turno.horaInicio.slice(0, 2)) * 60) + j('in', -12, 8) + (key === 'operario' && off === 6 ? 27 : 0);
      const finTurno = Number(turno.horaFin.slice(0, 2)) * 60;
      const fin = finTurno + j('out', -3, 22) + (key === 'tecnico1' && off === 2 ? 150 : 0);
      const pos = enAlmacen ? alm : sede;
      const fuera = movil && (off === 8 || off === 15) && key.startsWith('comercial');
      const geo = (tag: string) => {
        if (!movil && !enAlmacen) return { origen: 'web', lat: null, lng: null, precision: null, dentroGeovalla: null } as const;
        if (enAlmacen) return { origen: 'kiosco', lat: null, lng: null, precision: null, dentroGeovalla: true, kioscoId: kiosco!.id, centroId: s.centros.almacen } as const;
        const lat = fuera ? 39.4699 + j(tag + 'lat', 0, 90) / 10000 : pos.lat + j(tag + 'lat', -8, 8) / 10000;
        const lng = fuera ? -0.3763 + j(tag + 'lng', 0, 90) / 10000 : pos.lng + j(tag + 'lng', -8, 8) / 10000;
        return { origen: 'movil', lat, lng, precision: j(tag + 'acc', 8, 35), dentroGeovalla: !fuera, centroId: s.centros.sede } as const;
      };
      const eventos: [string, number][] = [['entrada', ini]];
      if (turno.pausaMinutos > 0 && !aus?.medioDia) {
        const pIni = (turno === almacen ? 10 * 60 : 13 * 60 + 30) + j('pi', -10, 15);
        eventos.push(['pausa_inicio', pIni], ['pausa_fin', pIni + turno.pausaMinutos + j('pf', -5, 8)]);
      }
      const olvidoSalida = key === 'tecnico2' && off === 5;
      if (olvidoSalida) tecnico2Abierta = { fecha };
      if (!olvidoSalida) eventos.push(['salida', aus?.medioDia === 'manana' ? 18 * 60 + j('out2', 0, 10) : fin]);
      for (const [tipo, min] of eventos) {
        const momento = madridAInstante(fecha, hm(min));
        if (momento.getTime() > ahora) break;
        filas.push({ empresaId, personaId, tipo, momento, registradoEn: momento, ...geo(tipo) });
      }
    }
  }
  for (let i = 0; i < filas.length; i += 500) await tx.insert(horFichajes).values(filas.slice(i, i + 500));

  // Corrección pendiente: Lucía olvidó fichar la salida
  if (tecnico2Abierta)
    await tx.insert(horCorrecciones).values({
      empresaId,
      personaId: p.tecnico2!,
      tipo: 'anadir',
      fecha: tecnico2Abierta.fecha,
      nuevoTipo: 'salida',
      nuevoMomento: madridAInstante(tecnico2Abierta.fecha, '17:10'),
      motivo: 'Me quedé sin batería al salir de la obra del colegio y no pude fichar la salida.',
    });
  // Corrección ya aprobada en el pasado (para el historial)
  const fRetraso = addDays(hoy, -6);
  await tx.insert(horCorrecciones).values({
    empresaId,
    personaId: p.operario!,
    tipo: 'anadir',
    fecha: addDays(hoy, -27),
    nuevoTipo: 'pausa_fin',
    nuevoMomento: madridAInstante(addDays(hoy, -27), '10:31'),
    motivo: 'La tableta no respondía al volver del descanso',
    estado: 'rechazada',
    motivoRechazo: 'El fichaje sí consta: la tableta lo registró a las 10:30.',
    revisadoPor: s.adminUsuarioId,
    revisadoEn: new Date(),
  });
  void fRetraso;

  // Firma del mes anterior para varias personas
  const mesAnterior = addDays(hoy.slice(0, 8) + '01', -1).slice(0, 7);
  const { desde: d0, hasta: d1, anio, m } = limitesMes(mesAnterior);
  const keys = ['administracion', 'rrhh', 'almacen', 'tecnico1', 'jefesat'];
  const mods = new Set<string>(OPTIONAL_MODULE_CODES);
  const jm = await jornadas(
    tx,
    empresaId,
    keys.map((k) => p[k]!),
    d0,
    d1,
    mods,
  );
  for (const k of keys) {
    const dias = jm.get(p[k]!)!;
    const t = totales(dias);
    await tx.insert(horFirmasMes).values({
      empresaId,
      personaId: p[k]!,
      anio,
      mes: m,
      hash: hashResumen(p[k]!, mesAnterior, dias),
      resumen: { trabajadas: t.trabajadas, extra: t.extra, nocturnas: t.nocturnas, dias: t.diasTrabajados },
      firmaImagen: FIRMA_DEMO,
      firmadoEn: new Date(madridAInstante(addDays(d1, 3), '09:12')),
    });
  }

  // Bolsa de horas
  await tx.insert(horBolsa).values([
    { empresaId, personaId: p.tecnico1!, fecha: addDays(hoy, -60), horas: 6, concepto: 'Guardias de septiembre compensables', origen: 'manual', creadoPor: s.adminUsuarioId },
    { empresaId, personaId: p.tecnico1!, fecha: addDays(hoy, -25), horas: -3, concepto: 'Salida anticipada compensada', origen: 'manual', creadoPor: s.adminUsuarioId },
    { empresaId, personaId: p.almacen!, fecha: addDays(hoy, -45), horas: 4.5, concepto: 'Inventario anual en sábado', origen: 'manual', creadoPor: s.adminUsuarioId },
  ]);
}
