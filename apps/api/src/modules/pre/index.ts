import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { MODULE_CODES, fmtMoney, type ApprovalItem } from '@kite/shared';
import { db } from '../../db/client';
import { documentos } from '../../db/schema/documentos';
import { personas, terceros } from '../../db/schema/core';
import { audit } from '../../core/audit';
import { defineModule } from '../../core/modules';
import { notify } from '../../core/notify';
import { can, scopeCondition } from '../../core/permissions';
import { crearDocumento, ejecutarAccion, marcarAceptado } from '../../services/documentos';
import { systemCtx } from '../../core/context';

const nombre = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

export default defineModule({
  code: 'pre',

  approvals: async (_db, ctx): Promise<ApprovalItem[]> => {
    if (!can(ctx, 'pre.aprobar')) return [];
    const rows = await db
      .select({ id: documentos.id, codigo: documentos.codigo, total: documentos.total, margen: documentos.margen, base: documentos.baseImponible, fecha: documentos.creadoEn, tercero: terceros.nombre, comercial: nombre })
      .from(documentos)
      .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
      .leftJoin(personas, eq(personas.id, documentos.comercialId))
      .where(and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'presupuesto'), eq(documentos.estado, 'pendiente_aprobacion')));
    return rows.map((r) => ({
      id: r.id,
      modulo: 'pre',
      tipo: 'Presupuesto con margen bajo',
      titulo: `${r.codigo} · ${r.tercero} · ${fmtMoney(r.total)}`,
      detalle: `Margen ${r.base ? ((r.margen / r.base) * 100).toFixed(1) : 0} %`,
      solicitante: r.comercial,
      fecha: r.fecha.toISOString(),
      enlace: `/documentos/${r.id}`,
      aprobarUrl: `/api/documentos/${r.id}/accion/aprobar`,
      rechazarUrl: `/api/documentos/${r.id}/accion/rechazar`,
    }));
  },

  dashboard: async (_db, ctx) => {
    const s = ctx.perms.get('pre.ver');
    if (!s) return [];
    const scope = await scopeCondition(ctx, s, documentos.comercialId);
    const base = and(eq(documentos.empresaId, ctx.empresaId), eq(documentos.tipo, 'presupuesto'), isNull(documentos.archivadoEn), scope);
    const [abiertos] = await db
      .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${documentos.baseImponible}),0)::float` })
      .from(documentos)
      .where(and(base, inArray(documentos.estado, ['enviado', 'visto'])));
    const [tasa] = await db
      .select({
        aceptados: sql<number>`count(*) FILTER (WHERE ${documentos.estado} = 'aceptado')::int`,
        cerrados: sql<number>`count(*) FILTER (WHERE ${documentos.estado} IN ('aceptado','rechazado','caducado'))::int`,
      })
      .from(documentos)
      .where(and(base, sql`${documentos.fecha} >= current_date - interval '180 days'`, sql`${documentos.version} = (SELECT max(d2.version) FROM documentos d2 WHERE d2.grupo_id = ${documentos.grupoId})`));
    const vistos = await db
      .select({ id: documentos.id, codigo: documentos.codigo, tercero: terceros.nombre, total: documentos.total, vistoEn: documentos.vistoEn })
      .from(documentos)
      .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
      .where(and(base, eq(documentos.estado, 'visto')))
      .orderBy(asc(documentos.vistoEn))
      .limit(5);
    return [
      { id: 'pre.abiertos', modulo: 'pre', titulo: 'Presupuestos esperando respuesta', size: 'sm', data: { kind: 'stat', value: abiertos?.total ?? 0, format: 'money', hint: `${abiertos?.n ?? 0} enviados o vistos`, enlace: '/presupuestos' } },
      { id: 'pre.tasa', modulo: 'pre', titulo: 'Tasa de aceptación (6 meses)', size: 'sm', data: { kind: 'stat', value: tasa?.cerrados ? Math.round((tasa.aceptados / tasa.cerrados) * 1000) / 10 : 0, format: 'percent', hint: `${tasa?.aceptados ?? 0} aceptados de ${tasa?.cerrados ?? 0} cerrados` } },
      ...(vistos.length
        ? [{ id: 'pre.vistos', modulo: 'pre', titulo: 'Vistos por el cliente, sin respuesta', size: 'md' as const, data: { kind: 'list' as const, items: vistos.map((v) => ({ titulo: `${v.codigo} · ${v.tercero}`, valor: fmtMoney(v.total), enlace: `/documentos/${v.id}` })) } }]
        : []),
    ];
  },

  jobs: [
    {
      id: 'pre.caducar',
      dailyAt: '06:30',
      run: async (empresaId, ctx) => {
        const hoy = new Date().toISOString().slice(0, 10);
        const vencidos = await db
          .select({ id: documentos.id, codigo: documentos.codigo, comercialId: documentos.comercialId })
          .from(documentos)
          .where(and(eq(documentos.empresaId, empresaId), eq(documentos.tipo, 'presupuesto'), inArray(documentos.estado, ['enviado', 'visto']), lt(documentos.fechaValidez, hoy)));
        for (const v of vencidos)
          await db.transaction(async (tx) => {
            await tx.update(documentos).set({ estado: 'caducado' }).where(eq(documentos.id, v.id));
            await audit(tx, ctx, 'caducar', 'documento', v.id);
            await notify(tx, ctx, { modulo: 'pre', tipo: 'caducado', titulo: `El presupuesto ${v.codigo} ha caducado sin respuesta`, cuerpo: 'Puedes crear una nueva versión con la validez actualizada.', enlace: `/documentos/${v.id}`, personaIds: [v.comercialId] });
          });
        return `${vencidos.length} caducados`;
      },
    },
  ],

  seed: async (tx, s) => {
    const ctx = systemCtx(s.empresaId, MODULE_CODES);
    const dia = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    const A = s.articulos;
    const linea = (ref: string, cantidad: number, precio: number, coste: number, descripcion: string) => ({ tipoLinea: 'articulo' as const, articuloId: A[ref] ?? null, referencia: ref, descripcion, cantidad, precio, descuento: 0, ivaTipo: 21, retencion: 0, coste });
    const pres = [
      { t: 'hotel', c: 'comercial1', titulo: 'Renovación climatización recepción', f: -12, lineas: [linea('AC-CASS-71', 2, 2150, 1380, 'Cassette 7,1 kW con mando'), linea('SRV-INST-SPLIT', 2, 450, 240, 'Instalación de cassette'), linea('TUB-CU-38', 30, 8.4, 3.9, 'Tubo de cobre 3/8" aislado')], estado: 'visto' },
      { t: 'clinica', c: 'comercial2', titulo: 'Aerotermia ACS 200 L', f: -5, lineas: [linea('BC-AERO-200', 1, 1850, 1150, 'Aerotermia ACS 200 L'), linea('SRV-HORA', 8, 42, 24, 'Horas de instalación')], estado: 'enviado' },
      { t: 'colegio', c: 'comercial1', titulo: 'Climatización de aulas (fase 1)', f: -25, lineas: [linea('AC-SPLIT-50', 6, 1290, 760, 'Split 5 kW'), linea('SRV-INST-SPLIT', 6, 280, 150, 'Instalación')], estado: 'aceptado' },
      { t: 'particular', c: 'comercial2', titulo: 'Aire acondicionado vivienda', f: -1, lineas: [linea('AC-SPLIT-35', 3, 890, 520, 'Split 3,5 kW'), linea('SRV-INST-SPLIT', 3, 280, 150, 'Instalación')], estado: 'borrador' },
      { t: 'oficinas', c: 'comercial1', titulo: 'Paneles LED planta segunda', f: -2, lineas: [linea('LED-PAN-60', 40, 17.5, 14.2, 'Panel LED 60x60 (precio especial)'), linea('SRV-HORA', 10, 42, 24, 'Horas de montaje')], estado: 'pendiente' },
      { t: 'restaurante', c: 'comercial2', titulo: 'Cámara frigorífica', f: -40, lineas: [linea('SRV-HORA', 20, 42, 24, 'Montaje de cámara')], estado: 'rechazado' },
    ];
    for (const p of pres) {
      const d = await crearDocumento(tx, ctx, { tipo: 'presupuesto', fecha: dia(p.f), terceroId: s.terceros[p.t]!, comercialId: s.personas[p.c]!, titulo: p.titulo, descuentoGlobal: 0, lineas: p.lineas }, { sinPermisos: true });
      if (p.estado === 'enviado' || p.estado === 'visto') {
        await tx.update(documentos).set({ estado: p.estado, enviadoEn: new Date(Date.now() + (p.f + 1) * 86400_000), vistoEn: p.estado === 'visto' ? new Date(Date.now() + (p.f + 2) * 86400_000) : null, tokenPublico: `demo-${d.id.slice(-12)}` }).where(eq(documentos.id, d.id));
      } else if (p.estado === 'aceptado') await marcarAceptado(tx, ctx, d.id, { nombre: 'Rosa García', interno: true });
      else if (p.estado === 'rechazado') await tx.update(documentos).set({ estado: 'rechazado', rechazoMotivo: 'Precio por encima de otra oferta' }).where(eq(documentos.id, d.id));
      else if (p.estado === 'pendiente') {
        // margen muy bajo: lo envía un comercial sin permiso de aprobar → queda pendiente
        await tx.update(documentos).set({ estado: 'pendiente_aprobacion' }).where(eq(documentos.id, d.id));
      }
    }
    void ejecutarAccion;
  },
});
