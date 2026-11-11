import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { MODULE_CODES, type DashboardWidget, type SearchResult, type TimelineEntry } from '@kite/shared';
import { systemCtx } from '../../core/context';
import { defineModule } from '../../core/modules';
import { canOnOwner, scopeCondition } from '../../core/permissions';
import { actRoutes, codigoActivo } from './routes';
import { actActivos, actAmortizaciones, actAsignaciones, actRegistros, actVencimientos } from './schema';
import { amortizarPeriodo, avisarVencimientos, periodoAnterior, planAmortizacion, sumarMeses } from './service';

const fechaRel = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const mesesAtras = (n: number) => sumarMeses(new Date().toISOString().slice(0, 10), -n);

export default defineModule({
  code: 'act',
  routes: actRoutes,

  refTargets: {
    activos: {
      table: actActivos,
      id: actActivos.id,
      label: sql<string>`${actActivos.codigo} || ' · ' || ${actActivos.nombre}`,
      sub: sql<string>`coalesce(${actActivos.matricula}, ${actActivos.numeroSerie}, ${actActivos.marca})`,
      search: [actActivos.codigo, actActivos.nombre, actActivos.matricula, actActivos.numeroSerie],
      empresaCol: actActivos.empresaId,
      archivedCol: actActivos.archivadoEn,
      perm: 'act.ver',
      scopeCol: actActivos.asignadoId,
      filterCols: { tipo: actActivos.tipo, asignadoId: actActivos.asignadoId },
      order: actActivos.codigo,
    },
  },

  entities: {
    act_activo: {
      label: 'Activo',
      module: 'act',
      canView: async (ctx, id) => {
        const { db } = await import('../../db/client');
        const [a] = await db.select({ p: actActivos.asignadoId, e: actActivos.empresaId }).from(actActivos).where(eq(actActivos.id, id));
        return !!a && a.e === ctx.empresaId && (await canOnOwner(ctx, 'act.ver', a.p));
      },
      canEdit: async (ctx) => ctx.perms.has('act.gestionar'),
      title: async (id) => {
        const { db } = await import('../../db/client');
        const [a] = await db.select({ c: actActivos.codigo, n: actActivos.nombre }).from(actActivos).where(eq(actActivos.id, id));
        return a ? `${a.c} · ${a.n}` : null;
      },
      url: (id) => `/activos/${id}`,
    },
  },

  dashboard: async (db, ctx) => {
    const s = ctx.perms.get('act.ver');
    if (!s) return [];
    const scope = await scopeCondition(ctx, s, actActivos.asignadoId);
    const lim = fechaRel(30);
    const rows = await db
      .select({ v: actVencimientos, activo: actActivos.nombre, matricula: actActivos.matricula })
      .from(actVencimientos)
      .innerJoin(actActivos, eq(actActivos.id, actVencimientos.activoId))
      .where(and(eq(actVencimientos.empresaId, ctx.empresaId), eq(actVencimientos.estado, 'pendiente'), sql`${actVencimientos.fecha} <= ${lim}`, isNull(actActivos.archivadoEn), scope))
      .orderBy(asc(actVencimientos.fecha))
      .limit(6);
    const hoy = new Date().toISOString().slice(0, 10);
    if (!rows.length && s !== 'todo') return [];
    const out: DashboardWidget[] = [
      {
        id: 'act.vencimientos',
        modulo: 'act',
        titulo: 'Próximos vencimientos',
        size: 'md',
        data: {
          kind: 'list',
          vacio: 'Nada vence en los próximos 30 días',
          enlace: '/activos/vencimientos',
          items: rows.map((r) => ({ titulo: `${r.v.descripcion || r.v.tipo.toUpperCase()} · ${r.activo}`, subtitulo: r.matricula ?? undefined, valor: r.v.fecha.split('-').reverse().join('/'), tone: r.v.fecha < hoy ? 'red' : r.v.fecha <= fechaRel(7) ? 'orange' : undefined, enlace: `/activos/${r.v.activoId}?tab=vencimientos` })),
        },
      },
    ];
    return out;
  },

  search: async (db, ctx, q) => {
    const s = ctx.perms.get('act.ver');
    if (!s) return [];
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = await db
      .select({ id: actActivos.id, codigo: actActivos.codigo, nombre: actActivos.nombre, matricula: actActivos.matricula, tipo: actActivos.tipo })
      .from(actActivos)
      .where(and(eq(actActivos.empresaId, ctx.empresaId), isNull(actActivos.archivadoEn), await scopeCondition(ctx, s, actActivos.asignadoId), or(ilike(actActivos.codigo, like), ilike(actActivos.nombre, like), ilike(actActivos.matricula, like), ilike(actActivos.numeroSerie, like))))
      .limit(6);
    return rows.map((r): SearchResult => ({ id: r.id, modulo: 'act', tipo: r.tipo === 'vehiculo' ? 'Vehículo' : 'Activo', titulo: `${r.codigo} · ${r.nombre}`, subtitulo: r.matricula, enlace: `/activos/${r.id}`, icono: r.tipo === 'vehiculo' ? 'Truck' : 'Hammer' }));
  },

  timeline: async (db, ctx, entidad, id) => {
    if (entidad !== 'persona' || !(await canOnOwner(ctx, 'act.ver', id))) return [];
    const rows = await db
      .select({ x: actAsignaciones, codigo: actActivos.codigo, nombre: actActivos.nombre })
      .from(actAsignaciones)
      .innerJoin(actActivos, eq(actActivos.id, actAsignaciones.activoId))
      .where(and(eq(actAsignaciones.personaId, id), eq(actAsignaciones.empresaId, ctx.empresaId)))
      .limit(30);
    const out: TimelineEntry[] = [];
    for (const r of rows) {
      out.push({ id: `act-e-${r.x.id}`, modulo: 'act', tipo: 'entrega', icono: 'Truck', titulo: `Recibe ${r.codigo} · ${r.nombre}`, fecha: `${r.x.desde}T09:00:00.000Z`, enlace: `/activos/${r.x.activoId}`, tone: 'blue' });
      if (r.x.hasta) out.push({ id: `act-d-${r.x.id}`, modulo: 'act', tipo: 'devolucion', icono: 'Truck', titulo: `Devuelve ${r.codigo} · ${r.nombre}`, fecha: `${r.x.hasta}T18:00:00.000Z`, enlace: `/activos/${r.x.activoId}`, tone: 'gray' });
    }
    return out;
  },

  jobs: [
    { id: 'act.vencimientos', dailyAt: '07:30', run: async (empresaId, ctx) => `${await avisarVencimientos(empresaId, ctx)} avisos de vencimiento` },
    {
      // cada día intenta amortizar el mes anterior: solo crea (y contabiliza) las cuotas que falten
      id: 'act.amortizacion',
      dailyAt: '03:00',
      run: async (_empresaId, ctx) => {
        const { db } = await import('../../db/client');
        const r = await db.transaction((tx) => amortizarPeriodo(tx, ctx, periodoAnterior()));
        return `${r.periodo}: ${r.creadas} cuotas (${r.importe} €)`;
      },
    },
  ],

  seed: async (tx, s) => {
    const sys = systemCtx(s.empresaId, MODULE_CODES);
    const P = s.personas;
    type Def = { nombre: string; tipo: string; marca?: string; modelo?: string; matricula?: string; serie?: string; km?: number; asignado?: string; centro?: string; mesesCompra: number; valor: number; vida: number; residual?: number; cuenta: string; proveedor?: string };
    const defs: Def[] = [
      { nombre: 'Furgoneta Renault Kangoo', tipo: 'vehiculo', marca: 'Renault', modelo: 'Kangoo Furgón dCi 95', matricula: '4821 KLM', km: 84520, asignado: 'tecnico1', centro: 'sede', mesesCompra: 38, valor: 18500, vida: 96, residual: 3000, cuenta: '218' },
      { nombre: 'Furgoneta Citroën Berlingo', tipo: 'vehiculo', marca: 'Citroën', modelo: 'Berlingo Talla M BlueHDi 100', matricula: '1937 LNB', km: 41260, asignado: 'tecnico2', centro: 'sede', mesesCompra: 19, valor: 21300, vida: 96, residual: 3500, cuenta: '218' },
      { nombre: 'Turismo comercial Seat León', tipo: 'vehiculo', marca: 'Seat', modelo: 'León 1.5 TSI', matricula: '7764 LCF', km: 63140, asignado: 'comercial1', centro: 'sede', mesesCompra: 26, valor: 24100, vida: 72, residual: 6000, cuenta: '218' },
      { nombre: 'Carretilla elevadora Linde', tipo: 'maquinaria', marca: 'Linde', modelo: 'E16', serie: 'LND-E16-55421', centro: 'almacen', asignado: 'almacen', mesesCompra: 50, valor: 14800, vida: 120, residual: 1500, cuenta: '213', proveedor: 'ferreteria' },
      { nombre: 'Bomba de vacío Value', tipo: 'herramienta', marca: 'Value', modelo: 'VE-280N', serie: 'VE280-2291', centro: 'almacen', mesesCompra: 14, valor: 640, vida: 60, cuenta: '214', proveedor: 'climafrio' },
      { nombre: 'Detector electrónico de fugas', tipo: 'herramienta', marca: 'Testo', modelo: '316-4', serie: 'T3164-88120', asignado: 'tecnico2', mesesCompra: 9, valor: 560, vida: 48, cuenta: '214', proveedor: 'climafrio' },
      { nombre: 'Portátil de administración', tipo: 'informatica', marca: 'Lenovo', modelo: 'ThinkPad E14', serie: 'PF4KQ2ZD', asignado: 'administracion', centro: 'sede', mesesCompra: 20, valor: 1150, vida: 48, cuenta: '217' },
      { nombre: 'Tableta para partes de trabajo', tipo: 'informatica', marca: 'Samsung', modelo: 'Galaxy Tab Active5', serie: 'R52W70ABCD', asignado: 'tecnico1', mesesCompra: 7, valor: 520, vida: 36, cuenta: '217' },
    ];
    const ids: Record<string, string> = {};
    for (const d of defs) {
      const codigo = await codigoActivo(tx, s.empresaId, d.tipo);
      const [a] = await tx
        .insert(actActivos)
        .values({
          empresaId: s.empresaId,
          codigo,
          nombre: d.nombre,
          tipo: d.tipo,
          estado: 'activo',
          marca: d.marca,
          modelo: d.modelo,
          matricula: d.matricula ?? null,
          numeroSerie: d.serie ?? null,
          km: d.km ?? null,
          asignadoId: d.asignado ? P[d.asignado] : null,
          centroId: d.centro ? s.centros[d.centro] : null,
          proveedorId: d.proveedor ? s.terceros[d.proveedor] : null,
          fechaCompra: mesesAtras(d.mesesCompra),
          valorCompra: d.valor,
          vidaUtilMeses: d.vida,
          valorResidual: d.residual ?? 0,
          cuentaActivo: d.cuenta,
          cuentaAmortizacion: `281${d.cuenta.slice(2)}`,
          cuentaGasto: '681',
        })
        .returning();
      ids[d.nombre] = a!.id;
      if (d.asignado && P[d.asignado]) await tx.insert(actAsignaciones).values({ empresaId: s.empresaId, activoId: a!.id, personaId: P[d.asignado]!, desde: mesesAtras(Math.min(d.mesesCompra, 12)), kmEntrega: d.km ? d.km - 15000 : null, notasEntrega: 'Entrega con llaves y documentación' });
      // cuotas ya contabilizadas en meses anteriores (sin repetir el asiento): hasta hace dos meses
      const plan = planAmortizacion({ valorCompra: d.valor, valorResidual: d.residual ?? 0, vidaUtilMeses: d.vida, fechaCompra: mesesAtras(d.mesesCompra) });
      if (plan) {
        const hastaPeriodo = mesesAtras(2).slice(0, 7);
        let acumulado = 0;
        const filas = [];
        for (let p = plan.inicio; p <= hastaPeriodo && p <= plan.fin; p = sumarMeses(p + '-01', 1).slice(0, 7)) {
          acumulado = Math.round((acumulado + plan.cuota) * 100) / 100;
          const [y, m] = p.split('-').map(Number);
          filas.push({ empresaId: s.empresaId, activoId: a!.id, periodo: p, fecha: new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10), importe: plan.cuota, acumulado, contabilizada: 'historico' });
        }
        if (filas.length) await tx.insert(actAmortizaciones).values(filas);
      }
    }
    // la Kangoo la llevó antes Lucía
    if (P.tecnico2) await tx.insert(actAsignaciones).values({ empresaId: s.empresaId, activoId: ids['Furgoneta Renault Kangoo']!, personaId: P.tecnico2, desde: mesesAtras(38), hasta: mesesAtras(12), kmEntrega: 12, kmDevolucion: 69520, notasEntrega: 'Vehículo nuevo', notasDevolucion: 'Golpe leve en el paragolpes trasero' });

    // Vencimientos (uno en aviso, otro vencido, el resto más adelante)
    const v = (activo: string, tipo: string, descripcion: string, dias: number, periodicidad: number | null, aviso = 15, coste?: number) =>
      tx.insert(actVencimientos).values({ empresaId: s.empresaId, activoId: ids[activo]!, tipo, descripcion, fecha: fechaRel(dias), periodicidadMeses: periodicidad, avisoDias: aviso, costeEstimado: coste ?? null });
    await v('Furgoneta Renault Kangoo', 'itv', 'ITV periódica', 9, 12, 20, 45);
    await v('Furgoneta Renault Kangoo', 'revision', 'Revisión de los 90.000 km', 32, 12, 15, 320);
    await v('Furgoneta Citroën Berlingo', 'seguro', 'Renovación del seguro a todo riesgo', 41, 12, 30, 780);
    await v('Turismo comercial Seat León', 'itv', 'Primera ITV', 128, 24, 30, 45);
    await v('Turismo comercial Seat León', 'seguro', 'Renovación del seguro', 66, 12, 30, 640);
    await v('Carretilla elevadora Linde', 'mantenimiento', 'Mantenimiento anual de la carretilla', -4, 12, 15, 260);
    await v('Detector electrónico de fugas', 'calibracion', 'Calibración del detector', 58, 12, 20, 90);

    // Registros de uso: repostajes semanales y algún mantenimiento
    for (const [nombre, kmActual, gasolinera] of [
      ['Furgoneta Renault Kangoo', 84520, true],
      ['Furgoneta Citroën Berlingo', 41260, true],
    ] as const) {
      let km = kmActual - 4200;
      const filas = [];
      for (let semana = 8; semana >= 1; semana--) {
        km += 520;
        const litros = 31 + (semana % 3) * 2.5;
        filas.push({ empresaId: s.empresaId, activoId: ids[nombre]!, tipo: 'combustible', fecha: fechaRel(-semana * 7), descripcion: 'Repostaje diésel', litros, coste: Math.round(litros * 1.42 * 100) / 100, km, proveedorId: gasolinera ? s.terceros.gasolinera : null });
      }
      await tx.insert(actRegistros).values(filas);
    }
    await tx.insert(actRegistros).values([
      { empresaId: s.empresaId, activoId: ids['Furgoneta Renault Kangoo']!, tipo: 'reparacion', fecha: fechaRel(-45), descripcion: 'Cambio de pastillas y discos delanteros', coste: 286.4, km: 80800 },
      { empresaId: s.empresaId, activoId: ids['Furgoneta Renault Kangoo']!, tipo: 'preventivo', fecha: fechaRel(-120), descripcion: 'Revisión de los 75.000 km', coste: 245, km: 75100 },
      { empresaId: s.empresaId, activoId: ids['Turismo comercial Seat León']!, tipo: 'multa', fecha: fechaRel(-33), descripcion: 'Estacionamiento en zona ORA', coste: 60 },
      { empresaId: s.empresaId, activoId: ids['Carretilla elevadora Linde']!, tipo: 'correctivo', fecha: fechaRel(-70), descripcion: 'Sustitución de la batería de tracción', coste: 1840 },
    ]);
    void sys;
  },
});

export { amortizarPeriodo, actRegistros };
