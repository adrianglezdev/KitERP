import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { horShared } from '@kite/shared';
import type { DbOrTx } from '../../db/client';
import { sha256 } from '../../core/auth';
import { festivos, personas } from '../../db/schema/core';
import { getAjustes } from '../../core/settings';
import { ausSolicitudes, ausTipos } from '../aus/schema';
import { ficTrabajadores } from '../fic/schema';
import { horAnulaciones, horAsignaciones, horCuadrante, horFichajes, horTurnos } from './schema';
import { addDays, diaSemana, fechaMadrid, horaMadrid, horasTurno, hoyMadrid, inicioDiaMadrid, minutos, offsetMadridMin, rangoDias, redondear } from './tiempo';

type FichajeTipo = horShared.FichajeTipo;
type DiaJornada = horShared.DiaJornada;
type EstadoJornada = horShared.EstadoJornada;

const { NOCHE_DESDE, NOCHE_HASTA, estadoTras } = horShared;
/** Una jornada abierta más de estas horas se da por no cerrada (olvido de fichar la salida). */
export const HORAS_JORNADA_ABIERTA = 16;

export interface FichajeValido {
  id: string;
  personaId: string;
  tipo: FichajeTipo;
  momento: Date;
  origen: string;
  anulado: boolean;
  dentroGeovalla: boolean | null;
  nota: string | null;
}

export interface TurnoRow {
  id: string;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  pausaMinutos: number;
  dias: number[];
  color: string;
}

export async function fichajesEntre(tx: DbOrTx, personaIds: string[], desde: Date, hasta: Date): Promise<FichajeValido[]> {
  if (!personaIds.length) return [];
  const rows = await tx
    .select({
      id: horFichajes.id,
      personaId: horFichajes.personaId,
      tipo: horFichajes.tipo,
      momento: horFichajes.momento,
      origen: horFichajes.origen,
      dentroGeovalla: horFichajes.dentroGeovalla,
      nota: horFichajes.nota,
      anulado: sql<boolean>`${horAnulaciones.id} IS NOT NULL`,
    })
    .from(horFichajes)
    .leftJoin(horAnulaciones, eq(horAnulaciones.fichajeId, horFichajes.id))
    .where(and(inArray(horFichajes.personaId, personaIds), gte(horFichajes.momento, desde), lt(horFichajes.momento, hasta)))
    .orderBy(asc(horFichajes.momento), asc(horFichajes.registradoEn));
  return rows as FichajeValido[];
}

/** Último fichaje válido y estado actual de la jornada. */
export async function estadoActual(tx: DbOrTx, personaId: string): Promise<{ estado: EstadoJornada; ultimo: FichajeValido | null; desde: Date | null }> {
  const desde = new Date(Date.now() - HORAS_JORNADA_ABIERTA * 3600_000);
  const fs = (await fichajesEntre(tx, [personaId], desde, new Date(Date.now() + 60_000))).filter((f) => !f.anulado);
  const ultimo = fs[fs.length - 1] ?? null;
  if (!ultimo) return { estado: 'fuera', ultimo: null, desde: null };
  const estado = estadoTras(ultimo.tipo);
  // inicio de la jornada en curso
  let inicio: Date | null = null;
  if (estado !== 'fuera') for (let i = fs.length - 1; i >= 0; i--) if (fs[i]!.tipo === 'entrada') { inicio = fs[i]!.momento; break; }
  return { estado, ultimo, desde: inicio };
}

/** Estado de varias personas a la vez (para "quién está trabajando"). */
export async function estadosAhora(tx: DbOrTx, personaIds: string[]) {
  const fs = (await fichajesEntre(tx, personaIds, new Date(Date.now() - HORAS_JORNADA_ABIERTA * 3600_000), new Date(Date.now() + 60_000))).filter((f) => !f.anulado);
  const out = new Map<string, { estado: EstadoJornada; ultimo: FichajeValido; desde: Date | null }>();
  const byP = new Map<string, FichajeValido[]>();
  for (const f of fs) byP.set(f.personaId, [...(byP.get(f.personaId) ?? []), f]);
  for (const [pid, list] of byP) {
    const ultimo = list[list.length - 1]!;
    const estado = estadoTras(ultimo.tipo);
    let desde: Date | null = null;
    if (estado !== 'fuera') for (let i = list.length - 1; i >= 0; i--) if (list[i]!.tipo === 'entrada') { desde = list[i]!.momento; break; }
    out.set(pid, { estado, ultimo, desde });
  }
  return out;
}

export interface DatosCalculo {
  fichajes: Map<string, FichajeValido[]>;
  turnos: Map<string, TurnoRow>;
  asignaciones: Map<string, { turnoId: string; desde: string; hasta: string | null }[]>;
  cuadrante: Map<string, { turnoId: string | null; libre: boolean }>;
  festivos: { fecha: string; nombre: string; centroId: string | null }[];
  ausencias: Map<string, { desde: string; hasta: string; tipo: string; color: string; medioDia: string | null }[]>;
  centro: Map<string, string | null>;
  jornadaSemanal: Map<string, number>;
  cortesia: number;
  jornadaMax: number;
}

/** Carga de una vez todo lo necesario para calcular las jornadas de varias personas. */
export async function cargarDatos(tx: DbOrTx, empresaId: string, personaIds: string[], desde: string, hasta: string, modules: Set<string>): Promise<DatosCalculo> {
  const ajustes = await getAjustes(empresaId);
  const ids = personaIds.length ? personaIds : ['00000000-0000-0000-0000-000000000000'];
  const fs = await fichajesEntre(tx, ids, inicioDiaMadrid(addDays(desde, -1)), inicioDiaMadrid(addDays(hasta, 2)));
  const fichajes = new Map<string, FichajeValido[]>();
  for (const f of fs) fichajes.set(f.personaId, [...(fichajes.get(f.personaId) ?? []), f]);

  const ts = await tx.select().from(horTurnos).where(eq(horTurnos.empresaId, empresaId));
  const turnos = new Map(ts.map((t) => [t.id, { id: t.id, nombre: t.nombre, horaInicio: t.horaInicio, horaFin: t.horaFin, pausaMinutos: t.pausaMinutos, dias: t.dias ?? [], color: t.color }]));

  const asig = await tx
    .select()
    .from(horAsignaciones)
    .where(and(inArray(horAsignaciones.personaId, ids), lte(horAsignaciones.desde, hasta), or(isNull(horAsignaciones.hasta), gte(horAsignaciones.hasta, desde))))
    .orderBy(asc(horAsignaciones.desde));
  const asignaciones = new Map<string, { turnoId: string; desde: string; hasta: string | null }[]>();
  for (const a of asig) asignaciones.set(a.personaId, [...(asignaciones.get(a.personaId) ?? []), { turnoId: a.turnoId, desde: a.desde, hasta: a.hasta }]);

  const cu = await tx.select().from(horCuadrante).where(and(inArray(horCuadrante.personaId, ids), gte(horCuadrante.fecha, desde), lte(horCuadrante.fecha, hasta)));
  const cuadrante = new Map(cu.map((c) => [`${c.personaId}|${c.fecha}`, { turnoId: c.turnoId, libre: c.libre }]));

  const fest = await tx
    .select({ fecha: festivos.fecha, nombre: festivos.nombre, centroId: festivos.centroId })
    .from(festivos)
    .where(and(eq(festivos.empresaId, empresaId), gte(festivos.fecha, desde), lte(festivos.fecha, hasta)));

  const ausencias = new Map<string, { desde: string; hasta: string; tipo: string; color: string; medioDia: string | null }[]>();
  if (modules.has('aus')) {
    const aus = await tx
      .select({ personaId: ausSolicitudes.personaId, desde: ausSolicitudes.desde, hasta: ausSolicitudes.hasta, medioDia: ausSolicitudes.medioDia, tipo: ausTipos.nombre, color: ausTipos.color })
      .from(ausSolicitudes)
      .innerJoin(ausTipos, eq(ausTipos.id, ausSolicitudes.tipoId))
      .where(and(inArray(ausSolicitudes.personaId, ids), eq(ausSolicitudes.estado, 'aprobada'), lte(ausSolicitudes.desde, hasta), gte(ausSolicitudes.hasta, desde)));
    for (const a of aus) ausencias.set(a.personaId, [...(ausencias.get(a.personaId) ?? []), a]);
  }

  const ps = await tx.select({ id: personas.id, centroId: personas.centroId }).from(personas).where(inArray(personas.id, ids));
  const centro = new Map(ps.map((p) => [p.id, p.centroId]));
  const jornadaSemanal = new Map<string, number>();
  const fic = await tx.select({ personaId: ficTrabajadores.personaId, jornada: ficTrabajadores.jornadaHoras }).from(ficTrabajadores).where(inArray(ficTrabajadores.personaId, ids));
  for (const f of fic) if (f.jornada) jornadaSemanal.set(f.personaId, Number(f.jornada));

  return { fichajes, turnos, asignaciones, cuadrante, festivos: fest, ausencias, centro, jornadaSemanal, cortesia: Number(ajustes.minutosCortesia ?? 10), jornadaMax: Number(ajustes.horasJornadaMax ?? 9) };
}

/** Turno que corresponde a una persona un día concreto (cuadrante > asignación). */
export function turnoDelDia(d: DatosCalculo, personaId: string, fecha: string): { turno: TurnoRow | null; conTurnos: boolean } {
  const ov = d.cuadrante.get(`${personaId}|${fecha}`);
  if (ov) return { turno: ov.libre || !ov.turnoId ? null : (d.turnos.get(ov.turnoId) ?? null), conTurnos: true };
  const asig = (d.asignaciones.get(personaId) ?? []).filter((a) => a.desde <= fecha && (!a.hasta || a.hasta >= fecha));
  if (!asig.length) return { turno: null, conTurnos: false };
  const a = asig[asig.length - 1]!;
  const t = d.turnos.get(a.turnoId);
  if (!t || !t.dias.includes(diaSemana(fecha))) return { turno: null, conTurnos: true };
  return { turno: t, conTurnos: true };
}

/** Agrupa los fichajes en jornadas: una jornada empieza con la entrada y sigue hasta la salida aunque cruce la medianoche. */
function agruparJornadas(fs: FichajeValido[]): Map<string, FichajeValido[]> {
  const out = new Map<string, FichajeValido[]>();
  let estado: EstadoJornada = 'fuera';
  let actual: string | null = null;
  let inicio = 0;
  for (const f of fs) {
    if (f.anulado) {
      const fecha = actual && estado !== 'fuera' ? actual : fechaMadrid(f.momento);
      out.set(fecha, [...(out.get(fecha) ?? []), f]);
      continue;
    }
    const t = f.momento.getTime();
    if (f.tipo === 'entrada' || estado === 'fuera' || !actual || t - inicio > HORAS_JORNADA_ABIERTA * 3600_000) {
      actual = fechaMadrid(f.momento);
      inicio = t;
    }
    out.set(actual, [...(out.get(actual) ?? []), f]);
    estado = estadoTras(f.tipo);
  }
  return out;
}

function nocturnasEntre(a: Date, b: Date): number {
  const off = offsetMadridMin(a) * 60000;
  const la = a.getTime() + off;
  const lb = b.getTime() + off;
  const DAY = 86400000;
  let total = 0;
  for (let k = Math.floor(la / DAY) - 1; k <= Math.floor(lb / DAY); k++) {
    const ws = k * DAY + NOCHE_DESDE * 3600000;
    const we = (k + 1) * DAY + NOCHE_HASTA * 3600000;
    total += Math.max(0, Math.min(lb, we) - Math.max(la, ws));
  }
  return total / 3600000;
}

/** Calcula la jornada día a día de una persona. */
export function calcularDias(d: DatosCalculo, personaId: string, desde: string, hasta: string, ahora = new Date()): DiaJornada[] {
  const hoy = hoyMadrid();
  const porJornada = agruparJornadas(d.fichajes.get(personaId) ?? []);
  const centroId = d.centro.get(personaId) ?? null;
  const ausencias = d.ausencias.get(personaId) ?? [];
  const jornadaDiaria = (d.jornadaSemanal.get(personaId) ?? 40) / 5;
  const out: DiaJornada[] = [];
  for (const fecha of rangoDias(desde, hasta)) {
    const fs = porJornada.get(fecha) ?? [];
    const validos = fs.filter((f) => !f.anulado);
    const fest = d.festivos.find((f) => f.fecha === fecha && (!f.centroId || f.centroId === centroId)) ?? null;
    const aus = ausencias.find((a) => a.desde <= fecha && a.hasta >= fecha) ?? null;
    const { turno, conTurnos } = turnoDelDia(d, personaId, fecha);
    const dow = diaSemana(fecha);

    let previstas = turno ? horasTurno(turno.horaInicio, turno.horaFin, turno.pausaMinutos) : !conTurnos && dow <= 5 ? jornadaDiaria : 0;
    if (fest) previstas = 0;
    if (aus) previstas = aus.medioDia ? previstas / 2 : 0;

    // tramos de trabajo y pausa
    let trabajadas = 0;
    let pausas = 0;
    let nocturnas = 0;
    let estado: EstadoJornada = 'fuera';
    let desdeT: Date | null = null;
    for (const f of validos) {
      if (desdeT) {
        const h = (f.momento.getTime() - desdeT.getTime()) / 3600000;
        if (estado === 'trabajando') {
          trabajadas += h;
          nocturnas += nocturnasEntre(desdeT, f.momento);
        } else if (estado === 'pausa') pausas += h;
      }
      estado = estadoTras(f.tipo);
      desdeT = estado === 'fuera' ? null : f.momento;
    }
    const ultimo = validos[validos.length - 1];
    const abierta = estado !== 'fuera';
    const sigueEnCurso = abierta && !!ultimo && ahora.getTime() - ultimo.momento.getTime() < HORAS_JORNADA_ABIERTA * 3600_000;
    if (abierta && sigueEnCurso && desdeT) {
      const h = (ahora.getTime() - desdeT.getTime()) / 3600000;
      if (estado === 'trabajando') {
        trabajadas += h;
        nocturnas += nocturnasEntre(desdeT, ahora);
      } else pausas += h;
    }

    const incidencias: DiaJornada['incidencias'] = [];
    const ausenteTodoElDia = !!aus && !aus.medioDia;
    const primeraEntrada = validos.find((f) => f.tipo === 'entrada');
    if (!ausenteTodoElDia && !fest) {
      if (turno && primeraEntrada && aus?.medioDia !== 'manana') {
        const llegada = minutos(horaMadrid(primeraEntrada.momento));
        const retraso = llegada - minutos(turno.horaInicio);
        if (retraso > d.cortesia && retraso < 12 * 60) incidencias.push({ tipo: 'retraso', detalle: `Entrada a las ${horaMadrid(primeraEntrada.momento)} (turno de ${turno.horaInicio}): ${retraso} min tarde` });
      }
      if (previstas > 0 && !validos.length) {
        const nowMin = minutos(horaMadrid(ahora));
        const limite = (turno ? minutos(turno.horaInicio) : 10 * 60) + d.cortesia;
        if (fecha < hoy || (fecha === hoy && nowMin > limite)) incidencias.push({ tipo: 'falta_fichaje', detalle: turno ? `Turno ${turno.nombre} (${turno.horaInicio}–${turno.horaFin}) sin fichajes` : 'Día laborable sin fichajes' });
      }
    }
    if (abierta && !sigueEnCurso) incidencias.push({ tipo: 'sin_salida', detalle: `La jornada quedó abierta desde las ${horaMadrid(ultimo!.momento)}` });
    if (trabajadas > d.jornadaMax) incidencias.push({ tipo: 'exceso_jornada', detalle: `${redondear(trabajadas, 1)} h trabajadas (máximo ${d.jornadaMax} h)` });
    if (validos.some((f) => f.dentroGeovalla === false)) incidencias.push({ tipo: 'fuera_geovalla', detalle: 'Algún fichaje se hizo fuera del centro de trabajo' });

    out.push({
      fecha,
      diaSemana: dow,
      fichajes: fs.map((f) => ({ id: f.id, tipo: f.tipo, momento: f.momento.toISOString(), origen: f.origen, anulado: f.anulado, dentroGeovalla: f.dentroGeovalla, nota: f.nota })),
      trabajadas: redondear(trabajadas),
      pausas: redondear(pausas),
      previstas: redondear(previstas),
      extra: redondear(Math.max(0, trabajadas - previstas)),
      nocturnas: redondear(nocturnas),
      festivo: fest?.nombre ?? null,
      ausencia: aus ? { tipo: aus.tipo, color: aus.color, medioDia: aus.medioDia } : null,
      turno: turno ? { id: turno.id, nombre: turno.nombre, horaInicio: turno.horaInicio, horaFin: turno.horaFin, color: turno.color } : null,
      incidencias,
      abierta: abierta && sigueEnCurso,
    });
  }
  return out;
}

export function totales(dias: DiaJornada[]) {
  const sum = (k: 'trabajadas' | 'previstas' | 'extra' | 'nocturnas' | 'pausas') => redondear(dias.reduce((a, d) => a + d[k], 0));
  return {
    trabajadas: sum('trabajadas'),
    previstas: sum('previstas'),
    extra: sum('extra'),
    nocturnas: sum('nocturnas'),
    pausas: sum('pausas'),
    diferencia: redondear(sum('trabajadas') - sum('previstas')),
    diasTrabajados: dias.filter((d) => d.trabajadas > 0).length,
    incidencias: dias.reduce((a, d) => a + d.incidencias.length, 0),
  };
}

/** Jornadas de varias personas en un rango (una sola carga de datos). */
export async function jornadas(tx: DbOrTx, empresaId: string, personaIds: string[], desde: string, hasta: string, modules: Set<string>) {
  const d = await cargarDatos(tx, empresaId, personaIds, desde, hasta, modules);
  return new Map(personaIds.map((id) => [id, calcularDias(d, id, desde, hasta)]));
}

/** Horas extra y nocturnas de un mes por persona (lo usa NOM para las variables de nómina). */
export async function horasMes(tx: DbOrTx, empresaId: string, personaIds: string[], desde: string, hasta: string, modules: Set<string>) {
  const m = await jornadas(tx, empresaId, personaIds, desde, hasta, modules);
  return new Map([...m].map(([id, dias]) => [id, totales(dias)]));
}

/** Huella del registro de un mes: si cambia algún fichaje después de firmar, deja de coincidir. */
export function hashResumen(personaId: string, mes: string, dias: DiaJornada[]) {
  const base = dias.map((d) => [d.fecha, d.fichajes.filter((f) => !f.anulado).map((f) => `${f.tipo}@${f.momento}`).join(','), d.trabajadas]);
  return sha256(JSON.stringify({ personaId, mes, base }));
}
