import { and, desc, eq, gte, ilike, inArray, ne, sql } from 'drizzle-orm';
import { MODULE_CODES, fmtMoney, type ApprovalItem, type DashboardWidget, type Scope, type SearchResult, type TimelineEntry } from '@kite/shared';
import type { Tx } from '../../db/client';
import { personas, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { systemCtx, type Ctx } from '../../core/context';
import { defineModule } from '../../core/modules';
import { can, canOnOwner, scopeCondition } from '../../core/permissions';
import { actualizarDocumento, convertir, crearDocumento, ejecutarAccion, lineasDe } from '../../services/documentos';
import { cprRoutes } from './routes';
import { cprArticuloProveedor, cprIncidencias, cprSolicitudes } from './schema';

const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;
const fechaAtras = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

export default defineModule({
  code: 'cpr',
  routes: cprRoutes,

  approvals: async (db, ctx) => {
    const s = ctx.perms.get('cpr.aprobar') as Scope | undefined;
    if (!s) return [];
    const out: ApprovalItem[] = [];
    const scopeSol = await scopeCondition(ctx, s, cprSolicitudes.solicitanteId);
    const sols = await db
      .select({ s: cprSolicitudes, solicitante: nombrePersona })
      .from(cprSolicitudes)
      .innerJoin(personas, eq(personas.id, cprSolicitudes.solicitanteId))
      .where(and(eq(cprSolicitudes.empresaId, ctx.empresaId), eq(cprSolicitudes.estado, 'pendiente'), scopeSol, s !== 'todo' && ctx.personaId ? ne(cprSolicitudes.solicitanteId, ctx.personaId) : undefined))
      .orderBy(cprSolicitudes.creadoEn)
      .limit(100);
    out.push(
      ...sols.map((r) => ({
        id: r.s.id,
        modulo: 'cpr',
        tipo: 'solicitud_compra',
        titulo: `Compra: ${r.s.descripcion}`,
        detalle: [`${r.s.cantidad} ud.`, r.s.importeEstimado ? fmtMoney(r.s.importeEstimado) : null, r.s.motivo].filter(Boolean).join(' · '),
        solicitante: r.solicitante,
        fecha: r.s.creadoEn.toISOString(),
        enlace: '/compras/solicitudes',
        aprobarUrl: `/api/cpr/solicitudes/${r.s.id}/aprobar`,
        rechazarUrl: `/api/cpr/solicitudes/${r.s.id}/rechazar`,
      })),
    );
    // pedidos a proveedor que superan el umbral de aprobación
    const scopePed = await scopeCondition(ctx, s, documentos.comercialId);
    const peds = await db
      .select({ d: documentos, proveedor: terceros.nombre, solicitante: nombrePersona })
      .from(documentos)
      .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
      .leftJoin(personas, eq(personas.id, documentos.comercialId))
      .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'pedido_compra'), eq(documentos.estado, 'pendiente_aprobacion'), scopePed, s !== 'todo' && ctx.personaId ? ne(documentos.comercialId, ctx.personaId) : undefined))
      .orderBy(documentos.creadoEn)
      .limit(100);
    out.push(
      ...peds.map((r) => ({
        id: r.d.id,
        modulo: 'cpr',
        tipo: 'pedido_compra',
        titulo: `Pedido ${r.d.codigo} a ${r.proveedor}`,
        detalle: `${fmtMoney(r.d.total)}${r.d.titulo ? ` · ${r.d.titulo}` : ''}`,
        solicitante: r.solicitante,
        fecha: r.d.creadoEn.toISOString(),
        enlace: `/documentos/${r.d.id}`,
        aprobarUrl: `/api/documentos/${r.d.id}/accion/aprobar`,
        rechazarUrl: `/api/documentos/${r.d.id}/accion/rechazar`,
      })),
    );
    return out;
  },

  dashboard: async (db, ctx) => {
    const out: DashboardWidget[] = [];
    if (can(ctx, 'cpr.editar') || can(ctx, 'cpr.recibir')) {
      const hoy = new Date().toISOString().slice(0, 10);
      const peds = await db
        .select({ id: documentos.id, codigo: documentos.codigo, fechaEntrega: documentos.fechaEntrega, proveedor: terceros.nombre, total: documentos.total })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'pedido_compra'), inArray(documentos.estado, ['aprobado', 'enviado', 'parcial'])))
        .orderBy(sql`${documentos.fechaEntrega} NULLS LAST`)
        .limit(6);
      out.push({
        id: 'cpr.por_recibir',
        modulo: 'cpr',
        titulo: 'Mercancía por recibir',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'No hay pedidos pendientes de recibir',
          enlace: '/compras/recepciones',
          items: peds.map((p) => ({ titulo: p.proveedor, subtitulo: `${p.codigo}${p.fechaEntrega ? ` · llega el ${p.fechaEntrega.split('-').reverse().join('/')}` : ''}`, valor: fmtMoney(p.total), tone: p.fechaEntrega && p.fechaEntrega < hoy ? 'red' : undefined, enlace: `/documentos/${p.id}` })),
        },
      });
    }
    if (can(ctx, 'cpr.editar') && can(ctx, 'cpr.ver', 'todo')) {
      const desde = new Date().toISOString().slice(0, 8) + '01';
      const [c] = await db
        .select({ v: sql<number>`coalesce(sum(${documentos.baseImponible}), 0)::float` })
        .from(documentos)
        .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'factura_proveedor'), eq(documentos.bloqueado, true), gte(documentos.fecha, desde)));
      out.push({ id: 'cpr.compras_mes', modulo: 'cpr', titulo: 'Compras del mes', size: 'sm', data: { kind: 'stat', value: c?.v ?? 0, format: 'money', hint: 'facturas de proveedor registradas', enlace: '/compras/facturas' } });
    }
    if (ctx.personaId) {
      const mias = await db
        .select({ id: cprSolicitudes.id, descripcion: cprSolicitudes.descripcion, estado: cprSolicitudes.estado })
        .from(cprSolicitudes)
        .where(and(eq(cprSolicitudes.solicitanteId, ctx.personaId), inArray(cprSolicitudes.estado, ['pendiente', 'aprobada'])))
        .orderBy(desc(cprSolicitudes.creadoEn))
        .limit(5);
      if (mias.length)
        out.push({
          id: 'cpr.mis_solicitudes',
          modulo: 'cpr',
          titulo: 'Mis solicitudes de compra',
          size: 'sm',
          data: { kind: 'list', enlace: '/compras/solicitudes', items: mias.map((m) => ({ titulo: m.descripcion, valor: m.estado === 'pendiente' ? 'Pendiente' : 'Aprobada', tone: m.estado === 'pendiente' ? 'orange' : 'violet' })) },
        });
    }
    return out;
  },

  search: async (db, ctx, q) => {
    const s = ctx.perms.get('cpr.ver');
    if (!s) return [];
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const scope = await scopeCondition(ctx, s, cprSolicitudes.solicitanteId);
    const rows = await db
      .select({ id: cprSolicitudes.id, descripcion: cprSolicitudes.descripcion, estado: cprSolicitudes.estado })
      .from(cprSolicitudes)
      .where(and(eq(cprSolicitudes.empresaId, ctx.empresaId), scope, ilike(cprSolicitudes.descripcion, like)))
      .limit(5);
    return rows.map((r): SearchResult => ({ id: r.id, modulo: 'cpr', tipo: 'Solicitud de compra', titulo: r.descripcion, subtitulo: r.estado, enlace: '/compras/solicitudes', icono: 'ShoppingCart' }));
  },

  timeline: async (db, ctx, entidad, id) => {
    if (entidad !== 'tercero' || !can(ctx, 'cpr.ver')) return [];
    const inc = await db.select().from(cprIncidencias).where(and(eq(cprIncidencias.terceroId, id), eq(cprIncidencias.empresaId, ctx.empresaId))).orderBy(desc(cprIncidencias.creadoEn)).limit(20);
    return inc.map((i): TimelineEntry => ({ id: `inc-${i.id}`, modulo: 'cpr', tipo: 'incidencia', icono: 'AlertTriangle', titulo: `Incidencia de recepción: ${i.descripcion}`, detalle: i.estado === 'abierta' ? 'Abierta' : 'Resuelta', fecha: i.creadoEn.toISOString(), enlace: `/documentos/${i.documentoId}`, tone: i.estado === 'abierta' ? 'orange' : 'green' }));
  },

  entities: {
    cpr_solicitud: {
      label: 'Solicitud de compra',
      module: 'cpr',
      canView: async (ctx, id) => {
        const { db } = await import('../../db/client');
        const [s] = await db.select({ p: cprSolicitudes.solicitanteId, e: cprSolicitudes.empresaId }).from(cprSolicitudes).where(eq(cprSolicitudes.id, id));
        return !!s && s.e === ctx.empresaId && ((await canOnOwner(ctx, 'cpr.ver', s.p)) || (await canOnOwner(ctx, 'cpr.aprobar', s.p)));
      },
      url: () => '/compras/solicitudes',
    },
  },

  seed: async (tx, s) => {
    const sys = systemCtx(s.empresaId, MODULE_CODES);
    const A = s.articulos;
    const T = s.terceros;
    const P = s.personas;
    // Precios por proveedor (algunos artículos con dos proveedores para comparar)
    const precios: [string, string, number, number, boolean, string | null][] = [
      ['AC-SPLIT-35', 'climafrio', 520, 4, true, 'DK-TXF35C'],
      ['AC-SPLIT-50', 'climafrio', 760, 4, true, 'DK-TXF50C'],
      ['AC-CASS-71', 'climafrio', 1380, 7, true, 'MT-PLAM71'],
      ['BC-AERO-200', 'climafrio', 1150, 6, true, 'AR-NUOS200'],
      ['FIL-AC-STD', 'climafrio', 6.5, 2, true, 'FIL-UNI'],
      ['FIL-AC-STD', 'ferreteria', 7.2, 1, false, 'F-AC-01'],
      ['GAS-R32-3', 'climafrio', 82, 2, true, 'R32-3KG'],
      ['TUB-CU-14', 'climafrio', 3.1, 2, true, 'CU14-AIS'],
      ['TUB-CU-14', 'ferreteria', 3.45, 1, false, 'TCU-1/4'],
      ['TUB-CU-38', 'climafrio', 3.9, 2, true, 'CU38-AIS'],
      ['CAB-3X25', 'electro', 0.95, 2, true, 'MNG-3G25'],
      ['MAG-16A', 'electro', 5.8, 2, true, 'SCH-A9F16'],
      ['DIF-40A', 'electro', 21, 2, true, 'SCH-A9R40'],
      ['LED-PAN-60', 'electro', 14.2, 3, true, 'LED-6060-40'],
      ['SOP-AC-PARED', 'ferreteria', 11, 1, true, 'SOP-450'],
      ['SOP-AC-PARED', 'climafrio', 12.4, 2, false, 'SOP-EXT'],
      ['BOMBA-COND', 'climafrio', 41, 3, true, 'SI-MINI'],
      ['TACO-8', 'ferreteria', 9.5, 1, true, 'TQ-M8'],
    ];
    for (const [ref, prov, precio, plazo, pref, refProv] of precios) {
      if (!A[ref] || !T[prov]) continue;
      await tx.insert(cprArticuloProveedor).values({ empresaId: s.empresaId, articuloId: A[ref]!, proveedorId: T[prov]!, precio, plazoDias: plazo, preferente: pref, referenciaProveedor: refProv });
    }

    const comprador: Ctx = { ...sys, personaId: P.almacen ?? null, nombre: 'Pablo Sánchez', perms: new Map([['cpr.editar', 'todo'], ['cpr.ver', 'todo'], ['cpr.recibir', 'todo']]) };
    const linea = (ref: string, cantidad: number, precio: number) => ({ tipoLinea: 'articulo' as const, articuloId: A[ref]!, referencia: ref, descripcion: ref, cantidad, precio, descuento: 0, ivaTipo: 21, retencion: 0, coste: 0 });

    // 1. Pedido recibido (con retraso de un día) y facturado
    const p1 = await crearDocumento(tx, sys, { tipo: 'pedido_compra', fecha: fechaAtras(14), fechaEntrega: fechaAtras(10), terceroId: T.climafrio!, comercialId: P.almacen, descuentoGlobal: 0, titulo: 'Reposición de gas y filtros', lineas: [linea('GAS-R32-3', 12, 82), linea('FIL-AC-STD', 100, 6.5), linea('BOMBA-COND', 4, 41)] });
    await ejecutarAccion(tx, sys, p1.id, 'confirmar');
    await ejecutarAccion(tx, sys, p1.id, 'marcar_enviado');
    const r1 = await recibir(tx, sys, p1.id, fechaAtras(9), (l) => (l.referencia === 'GAS-R32-3' ? { lote: `R32-${String(new Date().getFullYear()).slice(2)}10`, caducidad: `${new Date().getFullYear() + 3}-10-31` } : {}));
    await tx.insert(cprIncidencias).values({ empresaId: s.empresaId, documentoId: r1, terceroId: T.climafrio!, articuloId: A['GAS-R32-3']!, tipo: 'danado', cantidad: 1, descripcion: 'Una botella llegó con la válvula golpeada. Se ha apartado para devolverla.', estado: 'abierta' });
    const f1 = await convertir(tx, sys, r1, 'factura_proveedor');
    await fijar(tx, sys, f1.id, { fecha: fechaAtras(8), referenciaExterna: `CF-${new Date().getFullYear()}-0871` });
    await ejecutarAccion(tx, sys, f1.id, 'registrar');

    // 2. Pedido recibido a tiempo
    const p2 = await crearDocumento(tx, sys, { tipo: 'pedido_compra', fecha: fechaAtras(30), fechaEntrega: fechaAtras(27), terceroId: T.ferreteria!, comercialId: P.almacen, descuentoGlobal: 0, titulo: 'Fijaciones', lineas: [linea('SOP-AC-PARED', 10, 11), linea('TACO-8', 6, 9.5)] });
    await ejecutarAccion(tx, sys, p2.id, 'confirmar');
    await recibir(tx, sys, p2.id, fechaAtras(28));

    // 3. Pedido enviado pendiente de recibir
    const p3 = await crearDocumento(tx, sys, { tipo: 'pedido_compra', fecha: fechaAtras(3), fechaEntrega: fechaAtras(-2), terceroId: T.electro!, comercialId: P.almacen, descuentoGlobal: 0, titulo: 'Material eléctrico', lineas: [linea('LED-PAN-60', 24, 14.2), linea('MAG-16A', 30, 5.8)] });
    await ejecutarAccion(tx, sys, p3.id, 'confirmar');
    await ejecutarAccion(tx, sys, p3.id, 'marcar_enviado');

    // 4. Pedido grande pendiente de aprobación de dirección
    const p4 = await crearDocumento(tx, comprador, { tipo: 'pedido_compra', fecha: fechaAtras(1), terceroId: T.climafrio!, comercialId: P.almacen, descuentoGlobal: 0, titulo: 'Equipos para la obra del colegio', lineas: [linea('AC-SPLIT-35', 6, 520), linea('AC-SPLIT-50', 2, 760)] });
    await ejecutarAccion(tx, comprador, p4.id, 'confirmar');

    // Solicitudes internas
    const sol = (persona: string, descripcion: string, extra: Partial<typeof cprSolicitudes.$inferInsert>) =>
      tx.insert(cprSolicitudes).values({ empresaId: s.empresaId, solicitanteId: P[persona]!, descripcion, cantidad: 1, estado: 'pendiente', ...extra });
    await sol('operario', 'Guantes de trabajo anticorte (talla L)', { cantidad: 6, importeEstimado: 42, proveedorId: T.ferreteria, motivo: 'Los actuales están rotos', creadoEn: new Date(Date.now() - 2 * 86400_000) });
    await sol('comercial2', 'Tóner para la impresora de la oficina comercial', { importeEstimado: 65, motivo: 'Se ha agotado', creadoEn: new Date(Date.now() - 86400_000) });
    await sol('tecnico1', 'Bomba de vacío de dos etapas', { importeEstimado: 310, proveedorId: T.climafrio, motivo: 'La de la furgoneta 1 pierde aceite', estado: 'aprobada', aprobadorId: P.jefesat, resueltoEn: new Date(Date.now() - 86400_000) });
    await sol('tecnico2', 'Escalera telescópica de 3,8 m', { importeEstimado: 145, motivo: 'Para trabajos en techos altos', estado: 'rechazada', aprobadorId: P.jefesat, resueltoEn: new Date(Date.now() - 5 * 86400_000), motivoRechazo: 'Usa la del almacén central' });
    await sol('almacen', 'Paneles LED de repuesto', { articuloId: A['LED-PAN-60'], cantidad: 24, importeEstimado: 340.8, proveedorId: T.electro, estado: 'pedida', aprobadorId: P.direccion, resueltoEn: new Date(Date.now() - 4 * 86400_000), documentoId: p3.id });
  },
});

/** Convierte un pedido en recepción con fecha y lotes, y la confirma (entra el stock). */
async function recibir(tx: Tx, ctx: Ctx, pedidoId: string, fecha: string, extra: (l: { referencia: string | null }) => { lote?: string; caducidad?: string } = () => ({})) {
  const r = await convertir(tx, ctx, pedidoId, 'recepcion');
  const ls = await lineasDe(tx, r.id);
  await fijar(tx, ctx, r.id, { fecha }, ls.map((l) => ({ ...l, ...extra(l) })));
  await ejecutarAccion(tx, ctx, r.id, 'confirmar');
  return r.id;
}

async function fijar(tx: Tx, ctx: Ctx, id: string, cambios: { fecha?: string; referenciaExterna?: string }, lineas?: any[]) {
  const [d] = await tx.select().from(documentos).where(eq(documentos.id, id));
  const ls = lineas ?? (await lineasDe(tx, id));
  await actualizarDocumento(tx, ctx, id, {
    fecha: cambios.fecha ?? d!.fecha,
    terceroId: d!.terceroId,
    comercialId: d!.comercialId,
    almacenId: d!.almacenId,
    proyectoId: d!.proyectoId,
    descuentoGlobal: d!.descuentoGlobal,
    titulo: d!.titulo,
    referenciaExterna: cambios.referenciaExterna ?? d!.referenciaExterna,
    documentoOrigenId: d!.documentoOrigenId,
    origenTipo: d!.origenTipo,
    origenId: d!.origenId,
    lineas: ls.map((l: any) => ({ ...l, tipoLinea: l.tipoLinea, series: l.series ?? null })),
  });
}
