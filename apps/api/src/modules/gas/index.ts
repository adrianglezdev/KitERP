import { and, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { MODULE_CODES, fmtMoney, gasShared, optionLabel } from '@kite/shared';
import { db, type Tx } from '../../db/client';
import { personas } from '../../db/schema/core';
import { systemCtx, type Ctx } from '../../core/context';
import { saveFile } from '../../core/files';
import { defineModule, type SeedCtx } from '../../core/modules';
import { can, canOnOwner, scopeCondition } from '../../core/permissions';
import { gasGastos, gasTarjetas } from './schema';
import { gasRoutes, importarCargosTarjeta } from './routes';
import { aprobarGasto, calcularImportes, enviarGasto, liquidar, puedeVerGasto, rechazarGasto } from './service';
import { ensureEjercicio, renumerar } from '../cnt/service';

const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;
const hoy = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);

/** Imagen sencilla de un ticket para los datos de ejemplo. */
function ticketSvg(comercio: string, nif: string, fecha: string, lineas: [string, number][], total: number) {
  const rows = lineas.map(([d, i], k) => `<text x="20" y="${150 + k * 22}" font-size="14">${d}</text><text x="260" y="${150 + k * 22}" font-size="14" text-anchor="end">${i.toFixed(2).replace('.', ',')}</text>`).join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="${260 + lineas.length * 22}" font-family="monospace"><rect width="100%" height="100%" fill="#fffef8"/><text x="140" y="40" font-size="16" font-weight="bold" text-anchor="middle">${comercio}</text><text x="140" y="62" font-size="12" text-anchor="middle">CIF ${nif}</text><text x="140" y="84" font-size="12" text-anchor="middle">${fecha.split('-').reverse().join('/')}</text><line x1="20" y1="110" x2="260" y2="110" stroke="#999" stroke-dasharray="4"/>${rows}<line x1="20" y1="${170 + lineas.length * 22}" x2="260" y2="${170 + lineas.length * 22}" stroke="#999" stroke-dasharray="4"/><text x="20" y="${200 + lineas.length * 22}" font-size="16" font-weight="bold">TOTAL</text><text x="260" y="${200 + lineas.length * 22}" font-size="16" font-weight="bold" text-anchor="end">${total.toFixed(2).replace('.', ',')} EUR</text><text x="140" y="${236 + lineas.length * 22}" font-size="11" text-anchor="middle">IVA incluido. Gracias por su visita</text></svg>`,
  );
}

async function seed(tx: Tx, s: SeedCtx) {
  const base: Ctx = { ...systemCtx(s.empresaId, MODULE_CODES), usuarioId: s.adminUsuarioId };
  const como = (key: string): Ctx => ({ ...base, personaId: s.personas[key]!, isAdmin: true });
  const h = hoy();
  const [tarjeta] = await tx.insert(gasTarjetas).values({ empresaId: s.empresaId, nombre: 'Visa empresa Marta Gómez', ultimos4: '4417', personaId: s.personas.comercial1!, cuentaContable: '5720001', limiteMensual: 1500 }).returning();
  const precioKm = 0.26;
  const crear = async (persona: string, g: Partial<typeof gasGastos.$inferInsert> & { tipo: string; total?: number; ivaTipo?: number; km?: number }, ticket?: { lineas: [string, number][] }) => {
    const imp = calcularImportes({ tipo: g.tipo, total: g.total, ivaTipo: g.ivaTipo, km: g.km }, precioKm);
    let archivoId: string | null = null;
    if (ticket) {
      const f = await saveFile(tx, { empresaId: s.empresaId, nombre: `ticket-${(g.comercio ?? 'gasto').toLowerCase().replace(/\W+/g, '-')}.svg`, mime: 'image/svg+xml', data: ticketSvg(g.comercio ?? 'Comercio', g.nifComercio ?? '', g.fecha!, ticket.lineas, imp.total), subidoPor: s.adminUsuarioId });
      archivoId = f.id;
    }
    const [row] = await tx
      .insert(gasGastos)
      .values({ empresaId: s.empresaId, personaId: s.personas[persona]!, concepto: '', ...g, ...imp, archivoId, creadoPor: s.adminUsuarioId } as typeof gasGastos.$inferInsert)
      .returning();
    return row!;
  };
  // Marta (comercial1, responde a dirección)
  const g1 = await crear('comercial1', { tipo: 'ticket', categoria: 'comida', fecha: addDays(h, -3), comercio: 'Restaurante El Puerto', nifComercio: 'B46123453', concepto: 'Comida con el cliente Hotel Mar Azul', total: 64.9, ivaTipo: 10, terceroId: s.terceros.hotel }, { lineas: [['Menú del día x2', 39], ['Bebidas', 14], ['Cafés', 5.9], ['Postres', 6]] });
  const g2 = await crear('comercial1', { tipo: 'kilometraje', fecha: addDays(h, -12), concepto: 'Visita a Supermercados Huerta', origen: 'Valencia', destino: 'Torrent', km: 46, terceroId: s.terceros.super });
  const g3 = await crear('comercial1', { tipo: 'ticket', categoria: 'combustible', fecha: addDays(h, -25), comercio: 'Estación de Servicio Pista Silla', nifComercio: 'B46888889', concepto: 'Gasóleo coche de empresa', total: 72.4, ivaTipo: 21 }, { lineas: [['Gasóleo A 47,2 l', 72.4]] });
  const g4 = await crear('comercial1', { tipo: 'tarjeta', categoria: 'alojamiento', fecha: addDays(h, -8), comercio: 'Hotel Centro Alicante', nifComercio: 'B03123459', concepto: 'Feria de climatización Alicante', total: 98, ivaTipo: 10, tarjetaId: tarjeta!.id }, { lineas: [['Habitación individual', 89.09], ['Tasa turística', 0]] });
  // Javier (comercial2, responde a Marta)
  const g5 = await crear('comercial2', { tipo: 'ticket', categoria: 'parking', fecha: addDays(h, -2), comercio: 'Parking Plaza de la Reina', nifComercio: 'A46013456', concepto: 'Aparcamiento visita Coworking Ruzafa', total: 8.6, ivaTipo: 21, terceroId: s.terceros.oficinas }, { lineas: [['Estacionamiento 2 h 15 min', 8.6]] });
  await crear('comercial2', { tipo: 'dieta', fecha: addDays(h, -1), concepto: 'Media dieta jornada en Castellón', total: 26.67 });
  const g7 = await crear('comercial2', { tipo: 'kilometraje', fecha: addDays(h, -15), concepto: 'Visitas zona sur', origen: 'Valencia', destino: 'Gandía', km: 140 });
  // Sergio (técnico, responde a la jefa del SAT) y David (almacén)
  const g8 = await crear('tecnico1', { tipo: 'ticket', categoria: 'parking', fecha: addDays(h, -4), comercio: 'Aparcamiento Hospital La Fe', nifComercio: 'B46234564', concepto: 'Parking aviso urgente', total: 6.4, ivaTipo: 21 }, { lineas: [['Estancia 1 h 30 min', 6.4]] });
  const g9 = await crear('tecnico1', { tipo: 'ticket', categoria: 'material', fecha: addDays(h, -20), comercio: 'Ferretería Industrial Turia', nifComercio: 'B46777777', concepto: 'Silicona y bridas para avería', total: 18.15, ivaTipo: 21 }, { lineas: [['Silicona neutra', 7.9], ['Bridas 200 mm', 10.25]] });
  const g10 = await crear('operario', { tipo: 'ticket', categoria: 'transporte', fecha: addDays(h, -6), comercio: 'Autopistas AP-7', nifComercio: 'A08209769', concepto: 'Peaje recogida de material en Castellón', total: 11.3, ivaTipo: 21 }, { lineas: [['Peaje Sagunto-Castellón', 11.3]] });

  for (const [g, p] of [[g1, 'comercial1'], [g2, 'comercial1'], [g3, 'comercial1'], [g4, 'comercial1'], [g5, 'comercial2'], [g7, 'comercial2'], [g8, 'tecnico1'], [g9, 'tecnico1'], [g10, 'operario']] as const) await enviarGasto(tx, como(p), g.id);
  // aprobaciones: dirección aprueba a Marta, Marta a Javier, la jefa del SAT a Sergio, almacén a David
  await aprobarGasto(tx, como('direccion'), g2.id);
  await aprobarGasto(tx, como('direccion'), g3.id);
  await aprobarGasto(tx, como('direccion'), g4.id);
  await rechazarGasto(tx, como('comercial1'), g7.id, 'Faltan las visitas concretas del día: indícalas en el concepto');
  await aprobarGasto(tx, como('jefesat'), g9.id);
  await aprobarGasto(tx, como('almacen'), g10.id);
  // liquidación: el combustible de Marta en nómina y el material de Sergio por transferencia
  await liquidar(tx, base, { ids: [g3.id], via: 'nomina', fecha: addDays(h, -10) });
  await liquidar(tx, base, { ids: [g9.id], via: 'transferencia', fecha: addDays(h, -9) });
  // extracto de la tarjeta: el hotel tiene ticket; la cena no
  await importarCargosTarjeta(tx, s.empresaId, tarjeta!, [
    { fecha: addDays(h, -8), comercio: 'HOTEL CENTRO ALICANTE', importe: 98 },
    { fecha: addDays(h, -8), comercio: 'BAR LA LONJA ALICANTE', importe: 23.5 },
  ]);
  // los asientos de gastos se crean después de la semilla de contabilidad: se renumera el diario por fechas
  const ej = await ensureEjercicio(tx, s.empresaId, Number(h.slice(0, 4)));
  await renumerar(tx, base, ej.id);
}

export default defineModule({
  code: 'gas',
  routes: gasRoutes,

  approvals: async (_db, ctx) => {
    const s = ctx.perms.get('gas.aprobar');
    if (!s) return [];
    const rows = await db
      .select({ g: gasGastos, persona: nombrePersona })
      .from(gasGastos)
      .innerJoin(personas, eq(personas.id, gasGastos.personaId))
      .where(and(eq(gasGastos.empresaId, ctx.empresaId), eq(gasGastos.estado, 'enviado'), await scopeCondition(ctx, s, gasGastos.personaId), !ctx.isAdmin && ctx.personaId ? ne(gasGastos.personaId, ctx.personaId) : undefined))
      .orderBy(gasGastos.enviadoEn)
      .limit(100);
    return rows.map((r) => ({
      id: r.g.id,
      modulo: 'gas',
      tipo: 'Gasto',
      titulo: `${optionLabel(gasShared.GASTO_TIPOS, r.g.tipo)?.label ?? 'Gasto'} · ${fmtMoney(r.g.total)}`,
      detalle: [r.g.comercio, r.g.concepto].filter(Boolean).join(' · ') || null,
      solicitante: r.persona,
      fecha: (r.g.enviadoEn ?? r.g.creadoEn).toISOString(),
      enlace: '/gastos/aprobar',
      aprobarUrl: `/api/gas/gastos/${r.g.id}/aprobar`,
      rechazarUrl: `/api/gas/gastos/${r.g.id}/rechazar`,
    }));
  },

  dashboard: async (_db, ctx) => {
    const out = [];
    const s = ctx.perms.get('gas.aprobar');
    if (s) {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int`, t: sql<string>`coalesce(sum(${gasGastos.total}), 0)` })
        .from(gasGastos)
        .where(and(eq(gasGastos.empresaId, ctx.empresaId), eq(gasGastos.estado, 'enviado'), await scopeCondition(ctx, s, gasGastos.personaId), !ctx.isAdmin && ctx.personaId ? ne(gasGastos.personaId, ctx.personaId) : undefined));
      if ((r?.n ?? 0) > 0) out.push({ id: 'gas.por_aprobar', modulo: 'gas', titulo: 'Gastos pendientes de aprobar', size: 'sm' as const, data: { kind: 'stat' as const, value: r!.n, format: 'number' as const, hint: `${fmtMoney(Number(r!.t))} en total`, enlace: '/gastos/aprobar' } });
    }
    if (can(ctx, 'gas.liquidar')) {
      const [r] = await db.select({ n: sql<number>`count(*)::int`, t: sql<string>`coalesce(sum(${gasGastos.total}), 0)` }).from(gasGastos).where(and(eq(gasGastos.empresaId, ctx.empresaId), eq(gasGastos.estado, 'aprobado')));
      if ((r?.n ?? 0) > 0) out.push({ id: 'gas.por_liquidar', modulo: 'gas', titulo: 'Gastos aprobados por pagar', size: 'sm' as const, data: { kind: 'stat' as const, value: Number(r!.t), format: 'money' as const, hint: `${r!.n} gastos`, enlace: '/gastos/liquidar' } });
    }
    if (ctx.personaId && can(ctx, 'gas.crear')) {
      const [r] = await db
        .select({ t: sql<string>`coalesce(sum(${gasGastos.total}) FILTER (WHERE ${gasGastos.estado} IN ('enviado','aprobado') AND ${gasGastos.tipo} <> 'tarjeta'), 0)`, b: sql<number>`count(*) FILTER (WHERE ${gasGastos.estado} IN ('borrador','rechazado'))::int` })
        .from(gasGastos)
        .where(and(eq(gasGastos.empresaId, ctx.empresaId), eq(gasGastos.personaId, ctx.personaId)));
      if (Number(r?.t ?? 0) > 0 || (r?.b ?? 0) > 0)
        out.push({ id: 'gas.mis_gastos', modulo: 'gas', titulo: 'Mis gastos por cobrar', size: 'sm' as const, data: { kind: 'stat' as const, value: Number(r!.t), format: 'money' as const, hint: r!.b ? `${r!.b} sin enviar` : 'Todo enviado', enlace: '/gastos' } });
    }
    return out;
  },

  timeline: async (_db, ctx, entidad, id) => {
    if (entidad !== 'persona' || !(await puedeVerGasto(ctx, { personaId: id }))) return [];
    const rows = await db.select().from(gasGastos).where(and(eq(gasGastos.empresaId, ctx.empresaId), eq(gasGastos.personaId, id))).orderBy(desc(gasGastos.fecha)).limit(30);
    return rows.map((g) => {
      const e = optionLabel(gasShared.GASTO_ESTADOS, g.estado);
      return { id: `gas-${g.id}`, modulo: 'gas', tipo: 'gasto', icono: 'ReceiptEuro', titulo: `${optionLabel(gasShared.GASTO_TIPOS, g.tipo)?.label} · ${fmtMoney(g.total)}`, detalle: [g.comercio || g.concepto, e?.label].filter(Boolean).join(' · '), fecha: `${g.fecha}T10:00:00.000Z`, enlace: id === ctx.personaId ? '/gastos' : '/gastos/informe', tone: e?.tone };
    });
  },

  search: async (_db, ctx, q) => {
    const s = ctx.perms.get('gas.ver');
    if (!s) return [];
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = await db
      .select({ g: gasGastos, persona: nombrePersona })
      .from(gasGastos)
      .innerJoin(personas, eq(personas.id, gasGastos.personaId))
      .where(and(eq(gasGastos.empresaId, ctx.empresaId), can(ctx, 'gas.liquidar') ? undefined : await scopeCondition(ctx, s, gasGastos.personaId), or(ilike(gasGastos.comercio, like), ilike(gasGastos.concepto, like))))
      .orderBy(desc(gasGastos.fecha))
      .limit(5);
    return rows.map((r) => ({ id: r.g.id, modulo: 'gas', tipo: 'Gasto', titulo: `${r.g.comercio || r.g.concepto || 'Gasto'} · ${fmtMoney(r.g.total)}`, subtitulo: `${r.persona} · ${r.g.fecha.split('-').reverse().join('/')}`, enlace: r.g.personaId === ctx.personaId ? `/gastos?id=${r.g.id}` : `/gastos/informe?id=${r.g.id}`, icono: 'ReceiptEuro' }));
  },

  entities: {
    gasto: {
      label: 'Gasto',
      module: 'gas',
      canView: async (ctx, id) => {
        const [g] = await db.select({ p: gasGastos.personaId, e: gasGastos.empresaId }).from(gasGastos).where(eq(gasGastos.id, id));
        return !!g && g.e === ctx.empresaId && (await puedeVerGasto(ctx, { personaId: g.p }));
      },
      canEdit: async (ctx, id) => {
        const [g] = await db.select({ p: gasGastos.personaId, e: gasGastos.empresaId }).from(gasGastos).where(eq(gasGastos.id, id));
        return !!g && g.e === ctx.empresaId && (g.p === ctx.personaId || (await canOnOwner(ctx, 'gas.aprobar', g.p)));
      },
      title: async (id) => (await db.select({ c: gasGastos.concepto, m: gasGastos.comercio }).from(gasGastos).where(eq(gasGastos.id, id)))[0]?.m ?? 'Gasto',
      url: () => '/gastos',
      watchers: async (id) => (await db.select({ p: gasGastos.personaId }).from(gasGastos).where(eq(gasGastos.id, id))).map((r) => r.p),
    },
  },

  seed,
});
