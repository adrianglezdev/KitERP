import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { DOC_FACTURAS, round, type pryShared } from '@kite/shared';
import type { DbOrTx, Tx } from '../../db/client';
import { articulos } from '../../db/schema/core';
import type { Ctx } from '../../core/context';
import { forbidden, notFound } from '../../core/errors';
import { notify } from '../../core/notify';
import { getAjustes } from '../../core/settings';
import { pryCostesPersona, pryPartidas, pryProyectos } from './schema';

export type Proyecto = typeof pryProyectos.$inferSelect;

/**
 * Personas dentro del alcance de un permiso (null = toda la empresa).
 * Con "propio" ve los proyectos que dirige o en los que está en el equipo; con "equipo" también los de su gente.
 */
export async function personasAlcance(ctx: Ctx, perm: string): Promise<string[] | null | false> {
  const s = ctx.perms.get(perm);
  if (!s) return false;
  if (s === 'todo') return null;
  if (s === 'propio') return ctx.personaId ? [ctx.personaId] : [];
  if (s === 'equipo') return ctx.teamIds();
  return ctx.deptIds();
}

export function condicionProyecto(ids: string[]): SQL {
  if (!ids.length) return sql`false`;
  const arr = sql`ARRAY[${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}]`;
  return sql`(${pryProyectos.responsableId} = ANY(${arr}) OR ${pryProyectos.miembros} && ${arr})`;
}

/** Condición SQL de los proyectos visibles para el usuario (undefined = todos). */
export async function proyectosVisibles(ctx: Ctx): Promise<SQL | undefined> {
  const ver = await personasAlcance(ctx, 'pry.ver');
  const editar = await personasAlcance(ctx, 'pry.editar');
  if (ver === null || editar === null) return undefined;
  const ids = [...new Set([...(ver || []), ...(editar || [])])];
  // quien imputa horas ve los proyectos en los que participa
  if (ctx.personaId && ctx.perms.has('pry.imputar') && !ids.includes(ctx.personaId)) ids.push(ctx.personaId);
  return condicionProyecto(ids);
}

function enAlcance(p: Proyecto, ids: string[]) {
  return (!!p.responsableId && ids.includes(p.responsableId)) || p.miembros.some((m) => ids.includes(m));
}

export async function puedeVerProyecto(ctx: Ctx, p: Proyecto) {
  if (p.empresaId !== ctx.empresaId) return false;
  for (const perm of ['pry.ver', 'pry.editar']) {
    const ids = await personasAlcance(ctx, perm);
    if (ids === null) return true;
    if (ids && enAlcance(p, ids)) return true;
  }
  return !!ctx.personaId && ctx.perms.has('pry.imputar') && enAlcance(p, [ctx.personaId]);
}

export async function puedeEditarProyecto(ctx: Ctx, p: Proyecto) {
  const ids = await personasAlcance(ctx, 'pry.editar');
  if (ids === null) return true;
  return !!ids && enAlcance(p, ids);
}

export async function cargarProyecto(tx: DbOrTx, ctx: Ctx, id: string, modo: 'ver' | 'editar' = 'ver') {
  const [p] = await tx.select().from(pryProyectos).where(and(eq(pryProyectos.id, id), eq(pryProyectos.empresaId, ctx.empresaId)));
  if (!p || !(await puedeVerProyecto(ctx, p))) throw notFound('Proyecto no encontrado');
  if (modo === 'editar' && !(await puedeEditarProyecto(ctx, p))) throw forbidden('No puedes modificar este proyecto');
  return p;
}

/** Coste por hora de una persona: el suyo o el de los ajustes (pryCosteHora, 25 € por defecto). */
export async function costeHoraDe(tx: DbOrTx, empresaId: string, personaId: string) {
  const [c] = await tx.select({ c: pryCostesPersona.costeHora }).from(pryCostesPersona).where(eq(pryCostesPersona.personaId, personaId));
  if (c) return c.c;
  const aj = await getAjustes(empresaId);
  return Number(aj.pryCosteHora ?? 25);
}

/** Coste unitario de un artículo para imputarlo: precio medio del stock si existe, si no el coste del catálogo. */
export async function costeArticulo(tx: DbOrTx, ctx: Ctx, articuloId: string, almacenId: string | null) {
  if (ctx.modules.has('stk')) {
    const rows = await tx.execute<{ cm: number | null }>(sql`
      SELECT CASE WHEN sum(greatest(cantidad, 0)) > 0 THEN (sum(greatest(cantidad, 0) * coste_medio) / sum(greatest(cantidad, 0)))::float ELSE max(coste_medio)::float END AS cm
        FROM stk_saldos WHERE articulo_id = ${articuloId} ${almacenId ? sql`AND almacen_id = ${almacenId}` : sql``}`);
    const cm = rows[0]?.cm;
    if (cm && cm > 0) return round(cm, 4);
  }
  const [a] = await tx.select({ coste: articulos.coste }).from(articulos).where(eq(articulos.id, articuloId));
  return a?.coste ?? 0;
}

/** Rentabilidad prevista frente a real: horas × coste + material + compras frente a lo facturado. */
export async function rentabilidad(tx: DbOrTx, ctx: Ctx, p: Proyecto): Promise<pryShared.Rentabilidad> {
  const aj = await getAjustes(ctx.empresaId);
  const umbral = Number(aj.pryDesviacionPct ?? 10);
  const [h] = await tx.execute<{ horas: number; coste: number }>(sql`SELECT coalesce(sum(horas), 0)::float AS horas, coalesce(sum(horas * coste_hora), 0)::float AS coste FROM pry_imputaciones WHERE proyecto_id = ${p.id}`);
  const [m] = await tx.execute<{ coste: number }>(sql`SELECT coalesce(sum(cantidad * coste_unitario), 0)::float AS coste FROM pry_consumos WHERE proyecto_id = ${p.id}`);
  const [c] = await tx.execute<{ compras: number; comprometido: number }>(sql`
    SELECT coalesce(sum(CASE WHEN tipo = 'factura_proveedor' AND bloqueado THEN base_imponible END), 0)::float AS compras,
           coalesce(sum(CASE WHEN tipo = 'pedido_compra' AND estado IN ('aprobado', 'enviado', 'parcial') THEN base_imponible END), 0)::float AS comprometido
      FROM documentos WHERE empresa_id = ${ctx.empresaId} AND proyecto_id = ${p.id} AND archivado_en IS NULL`);
  const [f] = await tx.execute<{ facturado: number; borrador: number }>(sql`
    SELECT coalesce(sum(CASE WHEN bloqueado THEN base_imponible END), 0)::float AS facturado,
           coalesce(sum(CASE WHEN NOT bloqueado THEN base_imponible END), 0)::float AS borrador
      FROM documentos WHERE empresa_id = ${ctx.empresaId} AND proyecto_id = ${p.id} AND archivado_en IS NULL
       AND tipo IN (${sql.join(DOC_FACTURAS.map((t) => sql`${t}`), sql`, `)})`);
  const partidas = await tx.select().from(pryPartidas).where(eq(pryPartidas.proyectoId, p.id)).orderBy(pryPartidas.orden, pryPartidas.creadoEn);
  const realPartidas = partidas.length
    ? await tx.execute<{ partida_id: string; horas: number; coste: number }>(sql`
        SELECT partida_id, sum(horas)::float AS horas, sum(coste)::float AS coste FROM (
          SELECT partida_id, horas, horas * coste_hora AS coste FROM pry_imputaciones WHERE proyecto_id = ${p.id} AND partida_id IS NOT NULL
          UNION ALL
          SELECT partida_id, 0, cantidad * coste_unitario FROM pry_consumos WHERE proyecto_id = ${p.id} AND partida_id IS NOT NULL
        ) x GROUP BY partida_id`)
    : [];
  const [t] = await tx.execute<{ total: number; hechas: number; horas_est: number }>(sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'hecha')::int AS hechas, coalesce(sum(estimacion_horas), 0)::float AS horas_est FROM pry_tareas WHERE proyecto_id = ${p.id}`);

  const costeHoras = round(h?.coste ?? 0);
  const material = round(m?.coste ?? 0);
  const compras = round(c?.compras ?? 0);
  const coste = round(costeHoras + material + compras);
  const facturado = round(f?.facturado ?? 0);
  const ventaPrev = p.presupuestoVenta ?? partidas.reduce((a, x) => a + x.ventaPrevista, 0);
  const costePrev = p.presupuestoCoste ?? partidas.reduce((a, x) => a + x.costePrevisto, 0);
  const horasPrev = partidas.reduce((a, x) => a + (x.horasPrevistas ?? 0), 0) || (t?.horas_est ?? 0);
  const margen = round(facturado - coste);
  return {
    prevista: { venta: round(ventaPrev), coste: round(costePrev), margen: round(ventaPrev - costePrev), horas: round(horasPrev, 2) },
    real: { horas: round(h?.horas ?? 0, 2), costeHoras, material, compras, coste, facturado, margen, margenPct: facturado ? round((margen / facturado) * 100, 1) : 0 },
    comprometido: round(c?.comprometido ?? 0),
    pendienteFacturar: round(Math.max(0, ventaPrev - facturado)),
    avance: t?.total ? round((t.hechas / t.total) * 100, 0) : 0,
    umbralDesviacion: umbral,
    partidas: partidas.map((x) => {
      const r = realPartidas.find((y) => y.partida_id === x.id);
      const costeReal = round(r?.coste ?? 0);
      const desv = x.costePrevisto > 0 ? round(((costeReal - x.costePrevisto) / x.costePrevisto) * 100, 1) : null;
      return {
        id: x.id,
        nombre: x.nombre,
        tipo: x.tipo,
        horasPrevistas: x.horasPrevistas ?? 0,
        costePrevisto: x.costePrevisto,
        ventaPrevista: x.ventaPrevista,
        horas: round(r?.horas ?? 0, 2),
        costeReal,
        desviacionPct: desv,
        alerta: desv !== null && desv > umbral,
      };
    }),
  };
}

/** Si una partida supera su coste previsto en más del umbral, avisa una vez al responsable del proyecto. */
export async function comprobarDesviacion(tx: Tx, ctx: Ctx, p: Proyecto, partidaIds: (string | null | undefined)[]) {
  const ids = [...new Set(partidaIds.filter(Boolean) as string[])];
  if (!ids.length) return;
  const r = await rentabilidad(tx, ctx, p);
  const alertas = r.partidas.filter((x) => ids.includes(x.id) && x.alerta);
  if (!alertas.length) return;
  const nuevas = await tx
    .update(pryPartidas)
    .set({ alertadaEn: new Date() })
    .where(and(inArray(pryPartidas.id, alertas.map((a) => a.id)), sql`${pryPartidas.alertadaEn} IS NULL`))
    .returning({ id: pryPartidas.id, nombre: pryPartidas.nombre });
  if (!nuevas.length) return;
  await notify(tx, ctx, {
    modulo: 'pry',
    tipo: 'desviacion',
    titulo: `${p.codigo}: la partida "${nuevas[0]!.nombre}" supera su coste previsto`,
    cuerpo: alertas.map((a) => `${a.nombre}: ${a.costeReal.toFixed(2)} € de ${a.costePrevisto.toFixed(2)} € (+${a.desviacionPct} %)`).join(' · '),
    enlace: `/proyectos/${p.id}?tab=partidas`,
    personaIds: [p.responsableId],
    excluirActor: false,
  });
}
