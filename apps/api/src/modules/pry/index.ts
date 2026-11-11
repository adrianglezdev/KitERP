import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { MODULE_CODES, fmtHours, fmtMoney, type DashboardWidget, type SearchResult, type TimelineEntry } from '@kite/shared';
import type { Tx } from '../../db/client';
import { terceros } from '../../db/schema/core';
import { systemCtx } from '../../core/context';
import { defineModule } from '../../core/modules';
import { can } from '../../core/permissions';
import { crearDocumento, ejecutarAccion } from '../../services/documentos';
import { stkAlmacenes } from '../stk/schema';
import { crearProyecto, pryRoutes, registrarMaterial } from './routes';
import { pryCostesPersona, pryFases, pryHitos, pryImputaciones, pryPartidas, pryProyectos, pryTareas } from './schema';
import { cargarProyecto, proyectosVisibles, rentabilidad } from './service';

const fechaRel = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

export default defineModule({
  code: 'pry',
  routes: pryRoutes,

  refTargets: {
    proyectos: {
      table: pryProyectos,
      id: pryProyectos.id,
      label: sql<string>`${pryProyectos.codigo} || ' · ' || ${pryProyectos.nombre}`,
      sub: sql<string>`(SELECT t.nombre FROM terceros t WHERE t.id = ${pryProyectos.clienteId})`,
      search: [pryProyectos.codigo, pryProyectos.nombre],
      empresaCol: pryProyectos.empresaId,
      archivedCol: pryProyectos.archivadoEn,
      where: (_ctx, f) => (f.todos ? undefined : inArray(pryProyectos.estado, ['planificado', 'en_curso', 'pausado'])),
      filterCols: { clienteId: pryProyectos.clienteId, responsableId: pryProyectos.responsableId },
      order: sql`${pryProyectos.codigo} DESC`,
    },
    pry_tareas: {
      table: pryTareas,
      id: pryTareas.id,
      label: sql<string>`${pryTareas.titulo}`,
      sub: sql<string>`${pryTareas.estado}`,
      search: [pryTareas.titulo],
      empresaCol: pryTareas.empresaId,
      filterCols: { proyectoId: pryTareas.proyectoId, asignadoId: pryTareas.asignadoId },
      order: pryTareas.orden,
    },
    pry_fases: {
      table: pryFases,
      id: pryFases.id,
      label: sql<string>`${pryFases.nombre}`,
      search: [pryFases.nombre],
      filterCols: { proyectoId: pryFases.proyectoId },
      // las fases no llevan empresa: se limita a los proyectos de la empresa de la sesión
      where: (ctx) => sql`EXISTS (SELECT 1 FROM pry_proyectos p WHERE p.id = ${pryFases.proyectoId} AND p.empresa_id = ${ctx.empresaId})`,
      order: pryFases.orden,
    },
    pry_partidas: {
      table: pryPartidas,
      id: pryPartidas.id,
      label: sql<string>`${pryPartidas.nombre}`,
      search: [pryPartidas.nombre],
      filterCols: { proyectoId: pryPartidas.proyectoId },
      where: (ctx) => sql`EXISTS (SELECT 1 FROM pry_proyectos p WHERE p.id = ${pryPartidas.proyectoId} AND p.empresa_id = ${ctx.empresaId})`,
      order: pryPartidas.orden,
    },
  },

  entities: {
    pry_proyecto: {
      label: 'Proyecto',
      module: 'pry',
      canView: async (ctx, id) => {
        const { db } = await import('../../db/client');
        try {
          await cargarProyecto(db, ctx, id);
          return true;
        } catch {
          return false;
        }
      },
      canEdit: async (ctx, id) => {
        const { db } = await import('../../db/client');
        try {
          await cargarProyecto(db, ctx, id, 'editar');
          return true;
        } catch {
          return false;
        }
      },
      title: async (id) => {
        const { db } = await import('../../db/client');
        const [p] = await db.select({ c: pryProyectos.codigo, n: pryProyectos.nombre }).from(pryProyectos).where(eq(pryProyectos.id, id));
        return p ? `${p.c} · ${p.n}` : null;
      },
      url: (id) => `/proyectos/${id}`,
      watchers: async (id) => {
        const { db } = await import('../../db/client');
        const [p] = await db.select({ r: pryProyectos.responsableId }).from(pryProyectos).where(eq(pryProyectos.id, id));
        return p?.r ? [p.r] : [];
      },
    },
  },

  dashboard: async (db, ctx) => {
    const out: DashboardWidget[] = [];
    if (ctx.personaId && ctx.perms.has('pry.imputar')) {
      const d = new Date();
      const lunes = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400_000).toISOString().slice(0, 10);
      const [h] = await db.select({ h: sql<number>`coalesce(sum(${pryImputaciones.horas}), 0)::float` }).from(pryImputaciones).where(and(eq(pryImputaciones.personaId, ctx.personaId), sql`${pryImputaciones.fecha} >= ${lunes}`));
      const [tiene] = await db.select({ n: sql<number>`count(*)::int` }).from(pryProyectos).where(and(isNull(pryProyectos.archivadoEn), eq(pryProyectos.empresaId, ctx.empresaId), inArray(pryProyectos.estado, ['en_curso', 'planificado']), or(eq(pryProyectos.responsableId, ctx.personaId), sql`${ctx.personaId}::uuid = ANY(${pryProyectos.miembros})`)));
      if ((tiene?.n ?? 0) > 0 || (h?.h ?? 0) > 0) out.push({ id: 'pry.mis_horas', modulo: 'pry', titulo: 'Mis horas en proyectos', size: 'sm', data: { kind: 'stat', value: h?.h ?? 0, format: 'hours', hint: 'esta semana', enlace: '/mis-horas' } });
    }
    if (can(ctx, 'pry.ver') || can(ctx, 'pry.editar')) {
      const vis = await proyectosVisibles(ctx);
      const activos = await db.select().from(pryProyectos).where(and(eq(pryProyectos.empresaId, ctx.empresaId), isNull(pryProyectos.archivadoEn), eq(pryProyectos.estado, 'en_curso'), vis)).limit(40);
      const items = [];
      for (const p of activos) {
        const r = await rentabilidad(db as unknown as Tx, ctx, p);
        const desviadas = r.partidas.filter((x) => x.alerta).length;
        const sobreCoste = r.prevista.coste > 0 && r.real.coste > r.prevista.coste * (1 + r.umbralDesviacion / 100);
        if (desviadas || sobreCoste) items.push({ titulo: `${p.codigo} · ${p.nombre}`, subtitulo: desviadas ? `${desviadas} partida${desviadas > 1 ? 's' : ''} por encima de lo previsto` : 'Coste por encima de lo previsto', valor: fmtMoney(r.real.coste), tone: 'red', enlace: `/proyectos/${p.id}` });
      }
      if (activos.length) out.push({ id: 'pry.desviaciones', modulo: 'pry', titulo: 'Proyectos con desviación', size: 'md', data: { kind: 'list', vacio: `${activos.length} proyecto${activos.length > 1 ? 's' : ''} en curso dentro de lo previsto`, enlace: '/proyectos', items: items.slice(0, 6) } });
    }
    return out;
  },

  search: async (db, ctx, q) => {
    if (!ctx.perms.has('pry.ver') && !ctx.perms.has('pry.imputar')) return [];
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = await db
      .select({ id: pryProyectos.id, codigo: pryProyectos.codigo, nombre: pryProyectos.nombre, cliente: terceros.nombre })
      .from(pryProyectos)
      .leftJoin(terceros, eq(terceros.id, pryProyectos.clienteId))
      .where(and(eq(pryProyectos.empresaId, ctx.empresaId), isNull(pryProyectos.archivadoEn), await proyectosVisibles(ctx), or(ilike(pryProyectos.codigo, like), ilike(pryProyectos.nombre, like))))
      .limit(6);
    return rows.map((r): SearchResult => ({ id: r.id, modulo: 'pry', tipo: 'Proyecto', titulo: `${r.codigo} · ${r.nombre}`, subtitulo: r.cliente, enlace: `/proyectos/${r.id}`, icono: 'KanbanSquare' }));
  },

  timeline: async (db, ctx, entidad, id) => {
    if (entidad !== 'tercero' || (!ctx.perms.has('pry.ver') && !ctx.perms.has('pry.editar'))) return [];
    const rows = await db.select().from(pryProyectos).where(and(eq(pryProyectos.clienteId, id), eq(pryProyectos.empresaId, ctx.empresaId), await proyectosVisibles(ctx))).orderBy(desc(pryProyectos.creadoEn)).limit(20);
    return rows.map((p): TimelineEntry => ({ id: `pry-${p.id}`, modulo: 'pry', tipo: 'proyecto', icono: 'KanbanSquare', titulo: `Proyecto ${p.codigo} · ${p.nombre}`, detalle: p.estado.replace('_', ' '), fecha: p.creadoEn.toISOString(), enlace: `/proyectos/${p.id}`, tone: p.estado === 'en_curso' ? 'blue' : p.estado === 'terminado' ? 'green' : 'gray' }));
  },

  seed: async (tx, s) => {
    const sys = systemCtx(s.empresaId, MODULE_CODES);
    const P = s.personas;
    const A = s.articulos;
    for (const [k, c] of Object.entries({ tecnico1: 28, tecnico2: 26, jefesat: 36, operario: 20, almacen: 27 })) if (P[k]) await tx.insert(pryCostesPersona).values({ personaId: P[k]!, empresaId: s.empresaId, costeHora: c });

    /* Proyecto 1: en curso, con horas, material e hitos */
    const p1 = await crearProyecto(tx, { ...sys, personaId: P.jefesat ?? null }, {
      nombre: 'Climatización de aulas · Colegio San Vicente',
      clienteId: s.terceros.colegio,
      responsableId: P.jefesat,
      miembros: [P.tecnico1, P.tecnico2].filter(Boolean),
      estado: 'en_curso',
      tipoFacturacion: 'hitos',
      fechaInicio: fechaRel(-21),
      fechaFin: fechaRel(24),
      presupuestoVenta: 18600,
      presupuestoCoste: 11900,
      color: '#35AE29',
      descripcion: 'Instalación de 12 equipos split en las aulas de primaria y puesta en marcha antes de primavera.',
    });
    const fases: Record<string, string> = {};
    for (const [i, [n, a, b]] of [
      ['Replanteo', -21, -15],
      ['Instalación', -14, 14],
      ['Puesta en marcha', 15, 24],
    ].entries() as IterableIterator<[number, [string, number, number]]>) {
      const [f] = await tx.insert(pryFases).values({ proyectoId: p1.id, nombre: n, orden: i, fechaInicio: fechaRel(a), fechaFin: fechaRel(b) }).returning();
      fases[n] = f!.id;
    }
    const partidas: Record<string, string> = {};
    for (const [i, [n, tipo, horas, coste, venta]] of [
      ['Equipos y material', 'material', null, 8100, 12300],
      ['Mano de obra de instalación', 'mano_obra', 120, 3300, 5100],
      ['Puesta en marcha y formación', 'mano_obra', 16, 500, 1200],
    ].entries() as IterableIterator<[number, [string, string, number | null, number, number]]>) {
      const [pa] = await tx.insert(pryPartidas).values({ proyectoId: p1.id, nombre: n, tipo, horasPrevistas: horas, costePrevisto: coste, ventaPrevista: venta, orden: i }).returning();
      partidas[n] = pa!.id;
    }
    const tareas: Record<string, string> = {};
    const tdefs: [string, string, string | undefined, string, number, number, number, string?][] = [
      ['Medición de aulas y recorridos de tubería', 'Replanteo', P.jefesat, 'hecha', -21, -19, 8],
      ['Pedido de equipos al proveedor', 'Replanteo', P.jefesat, 'hecha', -18, -17, 2],
      ['Instalar soportes y líneas frigoríficas (aulas 1-6)', 'Instalación', P.tecnico1, 'hecha', -14, -6, 40, 'Pedido de equipos al proveedor'],
      ['Instalar soportes y líneas frigoríficas (aulas 7-12)', 'Instalación', P.tecnico2, 'en_curso', -5, 6, 40, 'Pedido de equipos al proveedor'],
      ['Conexión eléctrica de unidades exteriores', 'Instalación', P.tecnico1, 'en_curso', -3, 10, 24],
      ['Revisión de desagües y bombas de condensados', 'Instalación', P.tecnico2, 'pendiente', 8, 13, 12],
      ['Carga de gas y prueba de estanqueidad', 'Puesta en marcha', P.tecnico1, 'pendiente', 15, 19, 10, 'Conexión eléctrica de unidades exteriores'],
      ['Formación al personal de mantenimiento', 'Puesta en marcha', P.jefesat, 'pendiente', 22, 24, 4],
    ];
    let orden = 0;
    for (const [titulo, fase, asignado, estado, a, b, horas, dep] of tdefs) {
      const [t] = await tx
        .insert(pryTareas)
        .values({ empresaId: s.empresaId, proyectoId: p1.id, faseId: fases[fase], partidaId: fase === 'Puesta en marcha' ? partidas['Puesta en marcha y formación'] : partidas['Mano de obra de instalación'], titulo, asignadoId: asignado, estado, prioridad: estado === 'en_curso' ? 'alta' : 'normal', fechaInicio: fechaRel(a), fechaFin: fechaRel(b), estimacionHoras: horas, dependeDeId: dep ? tareas[dep] : null, orden: orden++, completadaEn: estado === 'hecha' ? new Date(Date.now() + b * 86400_000) : null })
        .returning();
      tareas[titulo] = t!.id;
    }
    // Partes de horas de los últimos días laborables
    const imput = [];
    for (let d = -20; d <= -1; d++) {
      const dia = new Date(Date.now() + d * 86400_000);
      if (dia.getDay() === 0 || dia.getDay() === 6) continue;
      const fecha = dia.toISOString().slice(0, 10);
      if (d < -14) imput.push({ personaId: P.jefesat!, horas: 2, tarea: 'Medición de aulas y recorridos de tubería', coste: 36, fecha });
      else {
        imput.push({ personaId: P.tecnico1!, horas: d < -6 ? 7.5 : 4, tarea: d < -6 ? 'Instalar soportes y líneas frigoríficas (aulas 1-6)' : 'Conexión eléctrica de unidades exteriores', coste: 28, fecha });
        if (d >= -5) imput.push({ personaId: P.tecnico2!, horas: 6.5, tarea: 'Instalar soportes y líneas frigoríficas (aulas 7-12)', coste: 26, fecha });
      }
    }
    if (imput.length)
      await tx.insert(pryImputaciones).values(
        imput.map((i) => ({ empresaId: s.empresaId, proyectoId: p1.id, tareaId: tareas[i.tarea], partidaId: partidas['Mano de obra de instalación'], personaId: i.personaId, fecha: i.fecha, horas: i.horas, costeHora: i.coste, descripcion: i.tarea })),
      );
    // Material consumido (descuenta stock si STK está activo)
    const mat = (
      [
        ['TUB-CU-14', 36],
        ['TUB-CU-38', 36],
        ['CAB-3X25', 60],
        ['SOP-AC-PARED', 6],
        ['TACO-8', 2],
      ] as const
    ).filter(([r]) => A[r]);
    const [central] = await tx.select({ id: stkAlmacenes.id }).from(stkAlmacenes).where(and(eq(stkAlmacenes.empresaId, s.empresaId), eq(stkAlmacenes.porDefecto, true))).limit(1);
    if (mat.length) await registrarMaterial(tx, { ...sys, personaId: P.tecnico1 ?? null }, p1.id, { fecha: fechaRel(-10), partidaId: partidas['Equipos y material'], almacenId: central?.id ?? null, lineas: mat.map(([r, c]) => ({ articuloId: A[r]!, cantidad: c })) });
    // Hitos de facturación
    const h1 = await tx.insert(pryHitos).values({ proyectoId: p1.id, nombre: 'Anticipo a la firma', fecha: fechaRel(-20), porcentaje: 30, importe: 5580, estado: 'pendiente', orden: 0 }).returning();
    await tx.insert(pryHitos).values([
      { proyectoId: p1.id, nombre: 'Fin de la instalación', fecha: fechaRel(14), porcentaje: 50, importe: 9300, estado: 'pendiente', orden: 1 },
      { proyectoId: p1.id, nombre: 'Puesta en marcha y entrega', fecha: fechaRel(24), porcentaje: 20, importe: 3720, estado: 'pendiente', orden: 2 },
    ]);
    if (s.terceros.colegio) {
      // el anticipo ya está facturado (se intenta emitir; si la serie no lo permite queda en borrador)
      const f = await crearDocumento(tx, sys, {
        tipo: 'factura',
        fecha: new Date().toISOString().slice(0, 10),
        terceroId: s.terceros.colegio,
        proyectoId: p1.id,
        titulo: `${p1.nombre} · Anticipo a la firma`,
        origenTipo: 'pry_hito',
        origenId: h1[0]!.id,
        descuentoGlobal: 0,
        lineas: [{ tipoLinea: 'articulo', descripcion: `Anticipo a la firma (30 %) · Proyecto ${p1.codigo}`, cantidad: 1, precio: 5580, descuento: 0, ivaTipo: 21, retencion: 0, coste: 0 }],
      });
      try {
        await tx.transaction(async (sp) => {
          await ejecutarAccion(sp, sys, f.id, 'emitir');
        });
      } catch {
        /* queda en borrador */
      }
      await tx.update(pryHitos).set({ estado: 'facturado', documentoId: f.id }).where(eq(pryHitos.id, h1[0]!.id));
    }

    /* Proyecto 2: planificado */
    const p2 = await crearProyecto(tx, { ...sys, personaId: P.jefesat ?? null }, {
      nombre: 'Renovación de iluminación LED · Coworking Ruzafa',
      clienteId: s.terceros.oficinas,
      responsableId: P.jefesat,
      miembros: [P.tecnico2].filter(Boolean),
      estado: 'planificado',
      tipoFacturacion: 'hitos',
      fechaInicio: fechaRel(10),
      fechaFin: fechaRel(30),
      presupuestoVenta: 4200,
      presupuestoCoste: 2350,
      color: '#7D2CDD',
    });
    await tx.insert(pryPartidas).values([
      { proyectoId: p2.id, nombre: 'Paneles LED y material eléctrico', tipo: 'material', costePrevisto: 1450, ventaPrevista: 2600, orden: 0 },
      { proyectoId: p2.id, nombre: 'Montaje', tipo: 'mano_obra', horasPrevistas: 32, costePrevisto: 900, ventaPrevista: 1600, orden: 1 },
    ]);
    await tx.insert(pryTareas).values([
      { empresaId: s.empresaId, proyectoId: p2.id, titulo: 'Retirar pantallas fluorescentes', asignadoId: P.tecnico2, estado: 'pendiente', fechaInicio: fechaRel(10), fechaFin: fechaRel(14), estimacionHoras: 12, orden: 0 },
      { empresaId: s.empresaId, proyectoId: p2.id, titulo: 'Montar paneles LED 60x60', asignadoId: P.tecnico2, estado: 'pendiente', fechaInicio: fechaRel(15), fechaFin: fechaRel(25), estimacionHoras: 20, orden: 1 },
    ]);
    await tx.insert(pryHitos).values({ proyectoId: p2.id, nombre: 'Factura única a la entrega', fecha: fechaRel(30), porcentaje: 100, importe: 4200, orden: 0 });

    /* Proyecto 3: terminado */
    const p3 = await crearProyecto(tx, { ...sys, personaId: P.jefesat ?? null }, {
      nombre: 'Revisión de climatización · Ayuntamiento de Alboraia',
      clienteId: s.terceros.ayto,
      responsableId: P.jefesat,
      miembros: [P.tecnico1].filter(Boolean),
      estado: 'terminado',
      tipoFacturacion: 'horas',
      fechaInicio: fechaRel(-75),
      fechaFin: fechaRel(-60),
      presupuestoVenta: 1500,
      presupuestoCoste: 900,
      color: '#B28574',
    });
    await tx.insert(pryImputaciones).values([
      { empresaId: s.empresaId, proyectoId: p3.id, personaId: P.tecnico1!, fecha: fechaRel(-70), horas: 8, costeHora: 28, descripcion: 'Revisión de equipos de la planta baja' },
      { empresaId: s.empresaId, proyectoId: p3.id, personaId: P.tecnico1!, fecha: fechaRel(-69), horas: 7, costeHora: 28, descripcion: 'Revisión de equipos de la primera planta' },
    ]);
  },
});
