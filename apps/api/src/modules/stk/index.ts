import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { MODULE_CODES, fmtMoney, fmtNumber, optionLabel, stkShared, type DashboardWidget, type SearchResult } from '@kite/shared';
import { articulos, personas } from '../../db/schema/core';
import { systemCtx } from '../../core/context';
import { defineModule } from '../../core/modules';
import { notify, usersWithPermission } from '../../core/notify';
import { can } from '../../core/permissions';
import { stkEvents } from './events';
import { movimientosQuery, stkRoutes } from './routes';
import { stkAlmacenes, stkArticuloConfig, stkAvisos, stkInventarioLineas, stkInventarios, stkKitComponentes, stkSaldos, stkSeries, stkTraspasos, stkUbicaciones } from './schema';
import { bajoMinimo, registrarMovimientos } from './service';

const personaNombre = sql<string>`(SELECT trim(p.nombre || ' ' || coalesce(p.apellidos, '')) FROM personas p WHERE p.id = ${stkAlmacenes.personaId})`;
const diasAtras = (n: number) => new Date(Date.now() - n * 86400_000);
const fechaAtras = (n: number) => diasAtras(n).toISOString().slice(0, 10);

export default defineModule({
  code: 'stk',
  routes: stkRoutes,
  events: stkEvents,

  refTargets: {
    almacenes: {
      table: stkAlmacenes,
      id: stkAlmacenes.id,
      label: sql<string>`${stkAlmacenes.nombre}`,
      sub: sql<string>`CASE WHEN ${stkAlmacenes.tipo} = 'furgoneta' THEN 'Furgoneta' || coalesce(' · ' || ${personaNombre}, '') ELSE 'Almacén' || CASE WHEN ${stkAlmacenes.porDefecto} THEN ' principal' ELSE '' END END`,
      search: [stkAlmacenes.nombre],
      empresaCol: stkAlmacenes.empresaId,
      archivedCol: stkAlmacenes.archivadoEn,
      where: (_ctx, f) => (f.todos ? undefined : eq(stkAlmacenes.activo, true)),
      filterCols: { tipo: stkAlmacenes.tipo, personaId: stkAlmacenes.personaId, centroId: stkAlmacenes.centroId },
      order: sql`${stkAlmacenes.porDefecto} DESC, ${stkAlmacenes.tipo}, ${stkAlmacenes.nombre}`,
    },
    ubicaciones: {
      table: stkUbicaciones,
      id: stkUbicaciones.id,
      label: sql<string>`${stkUbicaciones.codigo}`,
      sub: sql<string>`${stkUbicaciones.descripcion}`,
      search: [stkUbicaciones.codigo, stkUbicaciones.descripcion],
      empresaCol: stkUbicaciones.empresaId,
      filterCols: { almacenId: stkUbicaciones.almacenId },
      order: stkUbicaciones.codigo,
    },
  },

  dashboard: async (db, ctx) => {
    const out: DashboardWidget[] = [];
    if (can(ctx, 'stk.gestionar') || can(ctx, 'cpr.editar')) {
      const bajo = await bajoMinimo(db, ctx.empresaId, 50);
      out.push({
        id: 'stk.bajo_minimo',
        modulo: 'stk',
        titulo: 'Artículos bajo mínimo',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'Todo el stock está por encima del mínimo',
          enlace: '/stock?estado=bajo_minimo',
          items: bajo.slice(0, 6).map((b) => ({ titulo: `${b.referencia} · ${b.nombre}`, subtitulo: `Mínimo ${fmtNumber(b.stockMin)}`, valor: fmtNumber(b.fisico), tone: b.fisico <= 0 ? 'red' : 'orange', enlace: `/catalogo/${b.articuloId}?tab=stk-stock` })),
        },
      });
      const [v] = await db.select({ v: sql<number>`coalesce(sum(${stkSaldos.cantidad} * ${stkSaldos.costeMedio}), 0)::float` }).from(stkSaldos).where(eq(stkSaldos.empresaId, ctx.empresaId));
      out.push({ id: 'stk.valor', modulo: 'stk', titulo: 'Valor del stock', size: 'sm', data: { kind: 'stat', value: Math.round((v?.v ?? 0) * 100) / 100, format: 'money', hint: 'a precio medio ponderado', enlace: '/stock/valoracion' } });
    }
    if (ctx.perms.get('stk.mover') === 'todo') {
      const m = await movimientosQuery(ctx, {}, 1, 6);
      out.push({
        id: 'stk.ultimos',
        modulo: 'stk',
        titulo: 'Últimos movimientos de stock',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'Sin movimientos',
          enlace: '/stock/movimientos',
          items: m.items.map((x) => ({ titulo: `${x.referencia} · ${x.articulo}`, subtitulo: `${optionLabel(stkShared.MOVIMIENTO_TIPOS, x.tipo)?.label ?? x.tipo} · ${x.almacen}`, valor: `${x.cantidad > 0 ? '+' : ''}${fmtNumber(x.cantidad)}`, tone: x.cantidad > 0 ? 'green' : undefined })),
        },
      });
    }
    if (ctx.personaId) {
      const [f] = await db
        .select({ id: stkAlmacenes.id, nombre: stkAlmacenes.nombre, n: sql<number>`(SELECT count(*)::int FROM stk_saldos s WHERE s.almacen_id = ${stkAlmacenes.id} AND s.cantidad > 0)` })
        .from(stkAlmacenes)
        .where(and(eq(stkAlmacenes.empresaId, ctx.empresaId), eq(stkAlmacenes.personaId, ctx.personaId), eq(stkAlmacenes.tipo, 'furgoneta'), isNull(stkAlmacenes.archivadoEn)))
        .limit(1);
      if (f) out.push({ id: 'stk.furgoneta', modulo: 'stk', titulo: f.nombre, size: 'sm', data: { kind: 'stat', value: f.n, format: 'number', hint: 'artículos con stock', enlace: '/mi-furgoneta' } });
    }
    return out;
  },

  search: async (db, ctx, q) => {
    if (!can(ctx, 'stk.ver')) return [];
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const out: SearchResult[] = [];
    const alm = await db.select({ id: stkAlmacenes.id, nombre: stkAlmacenes.nombre, tipo: stkAlmacenes.tipo }).from(stkAlmacenes).where(and(eq(stkAlmacenes.empresaId, ctx.empresaId), isNull(stkAlmacenes.archivadoEn), ilike(stkAlmacenes.nombre, like))).limit(4);
    out.push(...alm.map((a) => ({ id: a.id, modulo: 'stk', tipo: a.tipo === 'furgoneta' ? 'Furgoneta' : 'Almacén', titulo: a.nombre, subtitulo: 'Ver su stock', enlace: `/stock?almacenId=${a.id}`, icono: a.tipo === 'furgoneta' ? 'Truck' : 'Boxes' })));
    if (q.length >= 3) {
      const ser = await db
        .select({ id: stkSeries.id, numero: stkSeries.numeroSerie, ref: articulos.referencia, nombre: articulos.nombre })
        .from(stkSeries)
        .innerJoin(articulos, eq(articulos.id, stkSeries.articuloId))
        .where(and(eq(stkSeries.empresaId, ctx.empresaId), ilike(stkSeries.numeroSerie, like)))
        .limit(4);
      out.push(...ser.map((s) => ({ id: s.id, modulo: 'stk', tipo: 'Nº de serie', titulo: s.numero, subtitulo: `${s.ref} · ${s.nombre}`, enlace: `/stock/trazabilidad?q=${encodeURIComponent(s.numero)}`, icono: 'History' })));
    }
    return out;
  },

  jobs: [
    {
      id: 'stk.bajo_minimo',
      dailyAt: '07:00',
      run: async (empresaId, ctx) => {
        const { db } = await import('../../db/client');
        const lista = await bajoMinimo(db, empresaId);
        if (!lista.length) return 'Sin artículos bajo mínimo';
        const usuarios = new Set([...(await usersWithPermission(db, empresaId, 'stk.gestionar')), ...(await usersWithPermission(db, empresaId, 'catalogo.gestionar'))]);
        await db.transaction(async (tx) => {
          await notify(tx, ctx, {
            modulo: 'stk',
            tipo: 'bajo_minimo',
            titulo: lista.length === 1 ? `${lista[0]!.referencia} está bajo mínimo` : `${lista.length} artículos bajo el stock mínimo`,
            cuerpo: lista
              .slice(0, 8)
              .map((l) => `${l.referencia}: ${fmtNumber(l.fisico)} (mín. ${fmtNumber(l.stockMin)})`)
              .join(' · '),
            enlace: '/stock?estado=bajo_minimo',
            usuarioIds: [...usuarios],
            email: true,
          });
          await tx
            .insert(stkAvisos)
            .values(lista.map((l) => ({ empresaId, articuloId: l.articuloId, almacenId: '00000000-0000-0000-0000-000000000000', tipo: 'minimo', fecha: new Date().toISOString().slice(0, 10) })))
            .onConflictDoNothing();
        });
        return `${lista.length} artículos bajo mínimo`;
      },
    },
  ],

  entities: {
    stk_inventario: {
      label: 'Recuento de inventario',
      module: 'stk',
      canView: async (ctx) => can(ctx, 'stk.ver') || can(ctx, 'stk.mover'),
      canEdit: async (ctx) => can(ctx, 'stk.mover'),
      url: (id) => `/stock/inventarios/${id}`,
    },
  },

  seed: async (tx, s) => {
    const ctx = { ...systemCtx(s.empresaId, MODULE_CODES), personaId: s.personas.almacen ?? null };
    const [central] = await tx.insert(stkAlmacenes).values({ empresaId: s.empresaId, nombre: 'Almacén central', tipo: 'almacen', centroId: s.centros.almacen, personaId: s.personas.almacen, porDefecto: true }).returning();
    const [furgo1] = await tx.insert(stkAlmacenes).values({ empresaId: s.empresaId, nombre: 'Furgoneta 1 · Sergio', tipo: 'furgoneta', centroId: s.centros.sede, personaId: s.personas.tecnico1 }).returning();
    const [furgo2] = await tx.insert(stkAlmacenes).values({ empresaId: s.empresaId, nombre: 'Furgoneta 2 · Lucía', tipo: 'furgoneta', centroId: s.centros.sede, personaId: s.personas.tecnico2 }).returning();
    await tx.insert(stkAlmacenes).values({ empresaId: s.empresaId, nombre: 'Sede · cuarto de material', tipo: 'almacen', centroId: s.centros.sede, personaId: s.personas.jefesat });

    const ubic: Record<string, string> = {};
    for (const [codigo, descripcion] of [
      ['A-01', 'Climatización: equipos'],
      ['A-02', 'Climatización: repuestos'],
      ['B-01', 'Tubería y cable'],
      ['C-01', 'Electricidad'],
      ['C-02', 'Fijaciones y soportes'],
    ]) {
      const [u] = await tx.insert(stkUbicaciones).values({ empresaId: s.empresaId, almacenId: central!.id, codigo: codigo!, descripcion }).returning();
      ubic[codigo!] = u!.id;
    }

    // Kit de instalación (artículo de tipo kit con su escandallo)
    const [kit] = await tx
      .insert(articulos)
      .values({ empresaId: s.empresaId, referencia: 'KIT-SPLIT-35', nombre: 'Kit split 3,5 kW con soporte y 3 m de tubería', tipo: 'kit', unidad: 'ud', precioVenta: 1020, coste: 585, ivaTipo: 21, controlaStock: true, marca: 'Daikin' })
      .returning();
    s.articulos['KIT-SPLIT-35'] = kit!.id;
    const A = s.articulos;
    await tx.insert(stkKitComponentes).values(
      (
        [
          ['AC-SPLIT-35', 1],
          ['SOP-AC-PARED', 1],
          ['TUB-CU-14', 3],
          ['TUB-CU-38', 3],
          ['TACO-8', 1],
        ] as const
      )
        .filter(([r]) => A[r])
        .map(([r, c]) => ({ empresaId: s.empresaId, kitId: kit!.id, componenteId: A[r]!, cantidad: c })),
    );

    // Configuración y stock inicial: [ref, mínimo, punto de pedido, cantidad a pedir, stock central, ubicación, lotes, series]
    const conf: [string, number, number, number, number, string, boolean, boolean][] = [
      ['AC-SPLIT-35', 4, 6, 10, 9, 'A-01', false, true],
      ['AC-SPLIT-50', 2, 3, 5, 4, 'A-01', false, true],
      ['AC-CASS-71', 1, 1, 2, 2, 'A-01', false, false],
      ['BC-AERO-200', 1, 1, 2, 1, 'A-01', false, false],
      ['FIL-AC-STD', 30, 40, 100, 22, 'A-02', false, false],
      ['GAS-R32-3', 6, 8, 12, 0, 'A-02', true, false],
      ['TUB-CU-14', 100, 150, 250, 320, 'B-01', false, false],
      ['TUB-CU-38', 100, 150, 250, 180, 'B-01', false, false],
      ['CAB-3X25', 200, 300, 500, 640, 'B-01', false, false],
      ['MAG-16A', 10, 15, 30, 24, 'C-01', false, false],
      ['DIF-40A', 5, 8, 15, 9, 'C-01', false, false],
      ['LED-PAN-60', 10, 12, 24, 6, 'C-01', false, false],
      ['SOP-AC-PARED', 8, 10, 20, 14, 'C-02', false, false],
      ['BOMBA-COND', 3, 4, 6, 2, 'A-02', false, false],
      ['TACO-8', 5, 6, 10, 11, 'C-02', false, false],
    ];
    const costes = new Map((await tx.select({ id: articulos.id, coste: articulos.coste }).from(articulos).where(eq(articulos.empresaId, s.empresaId))).map((a) => [a.id, a.coste]));
    const inicio = diasAtras(60);
    const movsIniciales = [];
    for (const [ref, min, pp, cant, stock, u, lotes, series] of conf) {
      const id = A[ref];
      if (!id) continue;
      await tx.insert(stkArticuloConfig).values({ articuloId: id, empresaId: s.empresaId, stockMin: min, puntoPedido: pp, cantidadPedido: cant, controlaLotes: lotes, controlaSeries: series, ubicacionId: ubic[u], ultimoRecuento: fechaAtras(60) });
      if (stock > 0) {
        const sers = series ? Array.from({ length: stock }, (_, i) => `${ref.replace(/-/g, '')}-${2600 + i}`) : null;
        movsIniciales.push({ tipo: 'inventario' as const, articuloId: id, almacenId: central!.id, cantidad: stock, costeUnitario: costes.get(id) ?? 0, origenTipo: 'inventario', motivo: 'Inventario inicial', momento: inicio, series: sers });
        if (sers) await tx.insert(stkSeries).values(sers.map((n) => ({ empresaId: s.empresaId, articuloId: id, numeroSerie: n, almacenId: central!.id, estado: 'en_stock', fechaEntrada: fechaAtras(60) })));
      }
    }
    // Gas refrigerante con dos lotes
    if (A['GAS-R32-3']) {
      const anio = new Date().getFullYear();
      const { stkLotes } = await import('./schema');
      await tx.insert(stkLotes).values([
        { empresaId: s.empresaId, articuloId: A['GAS-R32-3']!, lote: `R32-${String(anio - 1).slice(2)}11`, caducidad: `${anio + 2}-11-30`, proveedorId: s.terceros.climafrio },
        { empresaId: s.empresaId, articuloId: A['GAS-R32-3']!, lote: `R32-${String(anio).slice(2)}04`, caducidad: `${anio + 3}-04-30`, proveedorId: s.terceros.climafrio },
      ]);
      movsIniciales.push(
        { tipo: 'inventario' as const, articuloId: A['GAS-R32-3']!, almacenId: central!.id, cantidad: 4, costeUnitario: 79, lote: `R32-${String(anio - 1).slice(2)}11`, origenTipo: 'inventario', motivo: 'Inventario inicial', momento: inicio, series: null },
        { tipo: 'inventario' as const, articuloId: A['GAS-R32-3']!, almacenId: central!.id, cantidad: 6, costeUnitario: 84, lote: `R32-${String(anio).slice(2)}04`, origenTipo: 'inventario', motivo: 'Inventario inicial', momento: inicio, series: null },
      );
    }
    await registrarMovimientos(tx, ctx, movsIniciales);

    // Carga de las furgonetas (traspasos desde el almacén central)
    const cargar = async (destino: string, persona: string, dias: number, lineas: [string, number][]) => {
      const codigo = `TR${String(new Date().getFullYear()).slice(2)}-${String(dias).padStart(5, '0')}`;
      const [t] = await tx.insert(stkTraspasos).values({ empresaId: s.empresaId, codigo, fecha: fechaAtras(dias), origenId: central!.id, destinoId: destino, notas: 'Reposición semanal de la furgoneta', lineas: lineas.length, personaId: persona }).returning();
      const ls = lineas.filter(([r]) => A[r]);
      const sal = await registrarMovimientos(
        tx,
        { ...ctx, personaId: persona },
        ls.map(([r, c]) => ({ tipo: 'traspaso_salida' as const, articuloId: A[r]!, almacenId: central!.id, cantidad: -c, origenTipo: 'traspaso', origenId: t!.id, motivo: `${codigo}: carga de furgoneta`, momento: diasAtras(dias) })),
      );
      await registrarMovimientos(
        tx,
        { ...ctx, personaId: persona },
        sal.map((m) => ({ tipo: 'traspaso_entrada' as const, articuloId: m.articuloId, almacenId: destino, cantidad: -m.cantidad, costeUnitario: m.costeUnitario, origenTipo: 'traspaso', origenId: t!.id, motivo: `${codigo}: carga de furgoneta`, momento: diasAtras(dias) })),
      );
    };
    await cargar(furgo1!.id, s.personas.tecnico1!, 20, [
      ['FIL-AC-STD', 6],
      ['TUB-CU-14', 20],
      ['TUB-CU-38', 20],
      ['CAB-3X25', 50],
      ['MAG-16A', 4],
      ['TACO-8', 2],
    ]);
    await cargar(furgo2!.id, s.personas.tecnico2!, 18, [
      ['FIL-AC-STD', 4],
      ['TUB-CU-14', 15],
      ['DIF-40A', 2],
      ['SOP-AC-PARED', 2],
      ['BOMBA-COND', 1],
    ]);
    // Un ajuste por rotura
    if (A['LED-PAN-60'])
      await registrarMovimientos(tx, ctx, [{ tipo: 'ajuste', articuloId: A['LED-PAN-60']!, almacenId: central!.id, cantidad: -1, origenTipo: 'ajuste', motivo: 'Panel roto al descargar', momento: diasAtras(9) }]);

    // Recuento cíclico abierto en el almacén central con dos líneas contadas
    const [inv] = await tx.insert(stkInventarios).values({ empresaId: s.empresaId, codigo: `INV${String(new Date().getFullYear()).slice(2)}-00001`, almacenId: central!.id, tipo: 'ciclico', fecha: fechaAtras(1), notas: 'Recuento de la estantería C' }).returning();
    for (const [ref, teorico, contado] of [
      ['MAG-16A', 20, 20],
      ['DIF-40A', 7, 6],
      ['LED-PAN-60', 5, null],
      ['TACO-8', 9, null],
    ] as const) {
      if (!A[ref]) continue;
      await tx.insert(stkInventarioLineas).values({ inventarioId: inv!.id, articuloId: A[ref]!, teorico, contado: contado ?? null, contadoEn: contado !== null ? diasAtras(1) : null });
    }
    void personas;
    void desc;
    void fmtMoney;
  },
});
