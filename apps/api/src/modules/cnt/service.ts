import { and, asc, eq, like, sql } from 'drizzle-orm';
import { cntShared, round } from '@kite/shared';
const { DIGITOS_SUBCUENTA } = cntShared;
import type { DbOrTx, Tx } from '../../db/client';
import { terceros } from '../../db/schema/core';
import { audit } from '../../core/audit';
import type { Ctx } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/errors';
import { cntApuntes, cntAsientos, cntCuentas, cntEjercicios, cntSubcuentasTerceros } from './schema';
import { PGC_CUENTAS, naturalezaDe } from './pgc';

export type Cuenta = typeof cntCuentas.$inferSelect;

/** Bloqueo por empresa para crear cuentas sin carreras (se libera al terminar la transacción). */
async function lock(tx: Tx, empresaId: string, what: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cnt:' + what + ':' + empresaId}))`);
}

/** Crea el plan de cuentas PGC PYMES de la empresa la primera vez que se necesita. */
export async function ensurePlan(tx: Tx, empresaId: string) {
  const [hay] = await tx.select({ id: cntCuentas.id }).from(cntCuentas).where(and(eq(cntCuentas.empresaId, empresaId), eq(cntCuentas.sistema, true))).limit(1);
  if (hay) return;
  await lock(tx, empresaId, 'plan');
  await tx
    .insert(cntCuentas)
    .values(
      PGC_CUENTAS.map(([codigo, nombre]) => ({
        empresaId,
        codigo,
        nombre,
        grupo: codigo[0]!,
        naturaleza: naturalezaDe(codigo),
        subcuenta: codigo.length >= DIGITOS_SUBCUENTA,
        sistema: true,
      })),
    )
    .onConflictDoNothing();
}

/** Normaliza un código a subcuenta de 7 dígitos (700 → 7000000). Los de 7 o más se respetan. */
export function subcodigo(codigo: string) {
  const c = codigo.replace(/\D/g, '');
  if (!c) throw badRequest('Cuenta contable vacía');
  return c.length >= DIGITOS_SUBCUENTA ? c : c.padEnd(DIGITOS_SUBCUENTA, '0');
}

export async function cuentaPorCodigo(tx: DbOrTx, empresaId: string, codigo: string) {
  const [c] = await tx.select().from(cntCuentas).where(and(eq(cntCuentas.empresaId, empresaId), eq(cntCuentas.codigo, codigo)));
  return c ?? null;
}

/** Devuelve la subcuenta; si no existe se crea con el nombre indicado o el de su cuenta madre. */
export async function ensureCuenta(tx: Tx, empresaId: string, codigoIn: string, nombre?: string | null): Promise<Cuenta> {
  await ensurePlan(tx, empresaId);
  const codigo = subcodigo(codigoIn);
  const ya = await cuentaPorCodigo(tx, empresaId, codigo);
  if (ya) return ya;
  let nom = nombre ?? null;
  if (!nom) {
    for (let n = Math.min(codigo.length - 1, 4); n >= 3; n--) {
      const madre = await cuentaPorCodigo(tx, empresaId, codigo.slice(0, n));
      if (madre) {
        nom = madre.nombre;
        break;
      }
    }
  }
  await tx
    .insert(cntCuentas)
    .values({ empresaId, codigo, nombre: nom ?? `Cuenta ${codigo}`, grupo: codigo[0]!, naturaleza: naturalezaDe(codigo), subcuenta: true })
    .onConflictDoNothing();
  return (await cuentaPorCodigo(tx, empresaId, codigo))!;
}

/** Subcuenta 430/400/410 propia de un tercero (se crea la primera vez y se guarda en cnt_subcuentas_terceros). */
export async function subcuentaTercero(tx: Tx, empresaId: string, terceroId: string | null | undefined, tipo: 'cliente' | 'proveedor' | 'acreedor'): Promise<Cuenta> {
  const pref = tipo === 'cliente' ? '430' : tipo === 'proveedor' ? '400' : '410';
  if (!terceroId) return ensureCuenta(tx, empresaId, `${pref}0000`);
  const [map] = await tx
    .select({ c: cntCuentas })
    .from(cntSubcuentasTerceros)
    .innerJoin(cntCuentas, eq(cntCuentas.id, cntSubcuentasTerceros.cuentaId))
    .where(and(eq(cntSubcuentasTerceros.empresaId, empresaId), eq(cntSubcuentasTerceros.terceroId, terceroId), eq(cntSubcuentasTerceros.tipo, tipo)));
  if (map) return map.c;
  await ensurePlan(tx, empresaId);
  await lock(tx, empresaId, 'sub' + pref);
  const [again] = await tx
    .select({ c: cntCuentas })
    .from(cntSubcuentasTerceros)
    .innerJoin(cntCuentas, eq(cntCuentas.id, cntSubcuentasTerceros.cuentaId))
    .where(and(eq(cntSubcuentasTerceros.empresaId, empresaId), eq(cntSubcuentasTerceros.terceroId, terceroId), eq(cntSubcuentasTerceros.tipo, tipo)));
  if (again) return again.c;
  const [t] = await tx.select({ nombre: terceros.nombre, razonSocial: terceros.razonSocial }).from(terceros).where(eq(terceros.id, terceroId));
  const [mx] = await tx
    .select({ m: sql<string | null>`max(${cntCuentas.codigo})` })
    .from(cntCuentas)
    .where(and(eq(cntCuentas.empresaId, empresaId), like(cntCuentas.codigo, `${pref}____`), sql`length(${cntCuentas.codigo}) = 7`));
  const next = Math.max(0, Number(mx?.m?.slice(3) ?? 0)) + 1;
  const codigo = `${pref}${String(next).padStart(4, '0')}`;
  const [c] = await tx
    .insert(cntCuentas)
    .values({ empresaId, codigo, nombre: t?.razonSocial || t?.nombre || codigo, grupo: '4', naturaleza: tipo === 'cliente' ? 'activo' : 'pasivo', subcuenta: true })
    .returning();
  await tx.insert(cntSubcuentasTerceros).values({ empresaId, terceroId, tipo, cuentaId: c!.id });
  return c!;
}

/* ───────────── Ejercicios ───────────── */

export async function ensureEjercicio(tx: Tx, empresaId: string, anio: number) {
  await tx.insert(cntEjercicios).values({ empresaId, anio }).onConflictDoNothing();
  const [e] = await tx.select().from(cntEjercicios).where(and(eq(cntEjercicios.empresaId, empresaId), eq(cntEjercicios.anio, anio)));
  return e!;
}

/* ───────────── Asientos ───────────── */

export interface LineaAsiento {
  cuenta?: string; // código (se normaliza a subcuenta)
  cuentaId?: string;
  nombreCuenta?: string | null;
  debe?: number | null;
  haber?: number | null;
  concepto?: string | null;
  terceroId?: string | null;
  centroCosteId?: string | null;
}

export interface AsientoInput {
  fecha: string;
  concepto: string;
  origen: string;
  refClave?: string | null;
  refTipo?: string | null;
  refId?: string | null;
  documentoId?: string | null;
  lineas: LineaAsiento[];
}

/** Agrupa las líneas por cuenta y lado, quita las de importe cero y ajusta los céntimos. */
function normalizar(lineas: LineaAsiento[]) {
  return lineas
    .map((l) => ({ ...l, debe: round(Number(l.debe) || 0), haber: round(Number(l.haber) || 0) }))
    .filter((l) => l.debe !== 0 || l.haber !== 0);
}

/**
 * Crea un asiento con número correlativo en su ejercicio. Si lleva refClave y ya existe uno con el mismo
 * origen y clave, no hace nada y devuelve el existente (los manejadores de eventos son idempotentes).
 */
export async function crearAsiento(tx: Tx, ctx: Ctx, input: AsientoInput) {
  const empresaId = ctx.empresaId;
  if (input.refClave) {
    const [ya] = await tx.select().from(cntAsientos).where(and(eq(cntAsientos.empresaId, empresaId), eq(cntAsientos.origen, input.origen), eq(cntAsientos.refClave, input.refClave)));
    if (ya) return { asiento: ya, creado: false };
  }
  const lineas = normalizar(input.lineas);
  if (lineas.length < 2) throw badRequest('Un asiento necesita al menos dos líneas con importe');
  const debe = round(lineas.reduce((a, l) => a + l.debe, 0));
  const haber = round(lineas.reduce((a, l) => a + l.haber, 0));
  if (Math.abs(debe - haber) >= 0.005) throw badRequest(`El asiento no cuadra: debe ${debe.toFixed(2)} y haber ${haber.toFixed(2)}`);
  const anio = Number(input.fecha.slice(0, 4));
  const ej = await ensureEjercicio(tx, empresaId, anio);
  const [locked] = await tx.select().from(cntEjercicios).where(eq(cntEjercicios.id, ej.id)).for('update');
  if (locked!.estado === 'cerrado') throw conflict(`El ejercicio ${anio} está cerrado: no se pueden añadir asientos`);
  const numero = locked!.siguienteNumero;
  await tx.update(cntEjercicios).set({ siguienteNumero: numero + 1 }).where(eq(cntEjercicios.id, ej.id));

  const cuentas: Cuenta[] = [];
  for (const l of lineas) {
    if (l.cuentaId) {
      const [c] = await tx.select().from(cntCuentas).where(and(eq(cntCuentas.id, l.cuentaId), eq(cntCuentas.empresaId, empresaId)));
      if (!c) throw badRequest('Una de las cuentas no existe');
      if (!c.subcuenta) throw badRequest(`La cuenta ${c.codigo} no admite apuntes: usa una subcuenta de ${DIGITOS_SUBCUENTA} dígitos`);
      cuentas.push(c);
    } else if (l.cuenta) cuentas.push(await ensureCuenta(tx, empresaId, l.cuenta, l.nombreCuenta));
    else throw badRequest('Falta la cuenta en una línea');
  }
  const [a] = await tx
    .insert(cntAsientos)
    .values({
      empresaId,
      ejercicioId: ej.id,
      numero,
      fecha: input.fecha,
      concepto: input.concepto.slice(0, 300),
      origen: input.origen,
      refClave: input.refClave ?? null,
      refTipo: input.refTipo ?? null,
      refId: input.refId ?? null,
      documentoId: input.documentoId ?? null,
      total: debe,
      creadoPor: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId,
    })
    .returning();
  await tx.insert(cntApuntes).values(
    lineas.map((l, i) => ({
      asientoId: a!.id,
      empresaId,
      orden: i,
      cuentaId: cuentas[i]!.id,
      cuenta: cuentas[i]!.codigo,
      concepto: l.concepto ?? null,
      debe: l.debe,
      haber: l.haber,
      terceroId: l.terceroId ?? null,
      centroCosteId: l.centroCosteId ?? null,
    })),
  );
  await audit(tx, ctx, 'crear', 'cnt_asiento', a!.id, { numero, ejercicio: anio, origen: input.origen, refClave: input.refClave ?? null, total: debe });
  return { asiento: a!, creado: true };
}

export async function cargarAsiento(tx: DbOrTx, ctx: Ctx, id: string) {
  const [a] = await tx.select().from(cntAsientos).where(and(eq(cntAsientos.id, id), eq(cntAsientos.empresaId, ctx.empresaId)));
  if (!a) throw notFound('Asiento no encontrado');
  return a;
}

/** Sustituye las líneas y la cabecera de un asiento manual (el número se mantiene si no cambia de ejercicio). */
export async function editarAsientoManual(tx: Tx, ctx: Ctx, id: string, input: Omit<AsientoInput, 'origen'>) {
  const a = await cargarAsiento(tx, ctx, id);
  if (a.origen !== 'manual') throw conflict('Solo se pueden editar asientos manuales. Los automáticos se corrigen desde su origen o con un asiento de ajuste.');
  const lineas = normalizar(input.lineas);
  if (lineas.length < 2) throw badRequest('Un asiento necesita al menos dos líneas con importe');
  const debe = round(lineas.reduce((x, l) => x + l.debe, 0));
  const haber = round(lineas.reduce((x, l) => x + l.haber, 0));
  if (Math.abs(debe - haber) >= 0.005) throw badRequest(`El asiento no cuadra: debe ${debe.toFixed(2)} y haber ${haber.toFixed(2)}`);
  const [ej] = await tx.select().from(cntEjercicios).where(eq(cntEjercicios.id, a.ejercicioId));
  if (Number(input.fecha.slice(0, 4)) !== ej!.anio) throw badRequest(`La fecha debe ser del ejercicio ${ej!.anio}. Para moverlo a otro año, bórralo y créalo de nuevo.`);
  await tx.delete(cntApuntes).where(eq(cntApuntes.asientoId, id));
  const cuentas: Cuenta[] = [];
  for (const l of lineas) {
    if (l.cuentaId) {
      const [c] = await tx.select().from(cntCuentas).where(and(eq(cntCuentas.id, l.cuentaId), eq(cntCuentas.empresaId, ctx.empresaId)));
      if (!c || !c.subcuenta) throw badRequest('Usa subcuentas de 7 dígitos');
      cuentas.push(c);
    } else cuentas.push(await ensureCuenta(tx, ctx.empresaId, l.cuenta!, l.nombreCuenta));
  }
  await tx.update(cntAsientos).set({ fecha: input.fecha, concepto: input.concepto.slice(0, 300), total: debe }).where(eq(cntAsientos.id, id));
  await tx.insert(cntApuntes).values(
    lineas.map((l, i) => ({ asientoId: id, empresaId: ctx.empresaId, orden: i, cuentaId: cuentas[i]!.id, cuenta: cuentas[i]!.codigo, concepto: l.concepto ?? null, debe: l.debe, haber: l.haber, terceroId: l.terceroId ?? null, centroCosteId: l.centroCosteId ?? null })),
  );
  await audit(tx, ctx, 'editar', 'cnt_asiento', id, { numero: a.numero, total: debe });
}

export async function borrarAsiento(tx: Tx, ctx: Ctx, id: string, opts: { permitirAutomatico?: boolean } = {}) {
  const a = await cargarAsiento(tx, ctx, id);
  if (a.origen !== 'manual' && !opts.permitirAutomatico) throw conflict('Los asientos automáticos no se borran: corrige el origen o registra un asiento de ajuste');
  const lineas = await tx.select().from(cntApuntes).where(eq(cntApuntes.asientoId, id));
  await tx.delete(cntAsientos).where(eq(cntAsientos.id, id));
  await audit(tx, ctx, 'borrar', 'cnt_asiento', id, { numero: a.numero, fecha: a.fecha, concepto: a.concepto, origen: a.origen, lineas: lineas.map((l) => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber })) });
}

/** Renumera los asientos de un ejercicio abierto por orden de fecha (la apertura primero; regularización y cierre al final). */
export async function renumerar(tx: Tx, ctx: Ctx, ejercicioId: string) {
  const [ej] = await tx.select().from(cntEjercicios).where(and(eq(cntEjercicios.id, ejercicioId), eq(cntEjercicios.empresaId, ctx.empresaId))).for('update');
  if (!ej) throw notFound('Ejercicio no encontrado');
  if (ej.estado === 'cerrado') throw conflict(`El ejercicio ${ej.anio} está cerrado`);
  const rows = await tx
    .select({ id: cntAsientos.id })
    .from(cntAsientos)
    .where(eq(cntAsientos.ejercicioId, ejercicioId))
    .orderBy(
      sql`CASE ${cntAsientos.origen} WHEN 'apertura' THEN 0 WHEN 'regularizacion' THEN 2 WHEN 'cierre' THEN 3 ELSE 1 END`,
      asc(cntAsientos.fecha),
      asc(cntAsientos.creadoEn),
      asc(cntAsientos.id),
    );
  await tx.update(cntAsientos).set({ numero: sql`-${cntAsientos.numero}` }).where(eq(cntAsientos.ejercicioId, ejercicioId));
  let n = 1;
  for (const r of rows) await tx.update(cntAsientos).set({ numero: n++ }).where(eq(cntAsientos.id, r.id));
  await tx.update(cntEjercicios).set({ siguienteNumero: n }).where(eq(cntEjercicios.id, ejercicioId));
  await audit(tx, ctx, 'renumerar', 'cnt_ejercicio', ejercicioId, { asientos: rows.length });
  return { asientos: rows.length };
}
