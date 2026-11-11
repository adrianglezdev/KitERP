import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  articulos,
  centros,
  contactos,
  departamentos,
  documentos,
  familias,
  formasPago,
  personas,
  roles,
  series,
  tarifas,
  terceros,
} from '../db/schema';
import { registerEntity } from '../core/entities';
import { can, canOnOwner } from '../core/permissions';
import { registerRefTarget } from '../core/refs';
import { DOC_MODULO, type DocTipo } from '@kite/shared';

const nombrePersona = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

export function registerCoreRefTargets() {
  registerRefTarget('personas', {
    table: personas,
    id: personas.id,
    label: nombrePersona,
    sub: sql<string>`${personas.puesto}`,
    search: [personas.nombre, personas.apellidos, personas.email, personas.codigoEmpleado],
    empresaCol: personas.empresaId,
    archivedCol: personas.archivadoEn,
    where: (_ctx, f) => (f.todas ? undefined : eq(personas.activo, true)),
    filterCols: { departamentoId: personas.departamentoId, centroId: personas.centroId },
    order: nombrePersona,
  });
  registerRefTarget('departamentos', {
    table: departamentos,
    id: departamentos.id,
    label: sql<string>`${departamentos.nombre}`,
    search: [departamentos.nombre],
    empresaCol: departamentos.empresaId,
    archivedCol: departamentos.archivadoEn,
  });
  registerRefTarget('centros', {
    table: centros,
    id: centros.id,
    label: sql<string>`${centros.nombre}`,
    sub: sql<string>`${centros.localidad}`,
    search: [centros.nombre, centros.localidad],
    empresaCol: centros.empresaId,
    archivedCol: centros.archivadoEn,
  });
  const terceroLabel = sql<string>`${terceros.nombre}`;
  const terceroSub = sql<string>`coalesce(${terceros.nif}, '') || CASE WHEN ${terceros.localidad} IS NOT NULL THEN ' · ' || ${terceros.localidad} ELSE '' END`;
  const terceroSearch = [terceros.nombre, terceros.razonSocial, terceros.nif, terceros.email, terceros.telefono];
  registerRefTarget('terceros', {
    table: terceros,
    id: terceros.id,
    label: terceroLabel,
    sub: terceroSub,
    search: terceroSearch,
    empresaCol: terceros.empresaId,
    archivedCol: terceros.archivadoEn,
    perm: ['terceros.ver', 'sat.ver', 'cpr.ver', 'pry.ver', 'fac.ver'],
    scopeCol: terceros.comercialId,
  });
  registerRefTarget('clientes', {
    table: terceros,
    id: terceros.id,
    label: terceroLabel,
    sub: terceroSub,
    search: terceroSearch,
    empresaCol: terceros.empresaId,
    archivedCol: terceros.archivadoEn,
    perm: ['terceros.ver', 'sat.planificar', 'sat.contratos', 'fac.ver'],
    scopeCol: terceros.comercialId,
    where: () => eq(terceros.esCliente, true),
  });
  registerRefTarget('proveedores', {
    table: terceros,
    id: terceros.id,
    label: terceroLabel,
    sub: terceroSub,
    search: terceroSearch,
    empresaCol: terceros.empresaId,
    archivedCol: terceros.archivadoEn,
    where: () => eq(terceros.esProveedor, true),
  });
  registerRefTarget('contactos', {
    table: contactos,
    id: contactos.id,
    label: sql<string>`trim(${contactos.nombre} || ' ' || coalesce(${contactos.apellidos}, ''))`,
    sub: sql<string>`coalesce(${contactos.cargo}, ${contactos.email})`,
    search: [contactos.nombre, contactos.apellidos, contactos.email],
    empresaCol: contactos.empresaId,
    archivedCol: contactos.archivadoEn,
    filterCols: { terceroId: contactos.terceroId },
  });
  registerRefTarget('articulos', {
    table: articulos,
    id: articulos.id,
    label: sql<string>`${articulos.referencia} || ' · ' || ${articulos.nombre}`,
    sub: sql<string>`${articulos.tipo}`,
    search: [articulos.referencia, articulos.nombre, articulos.ean, articulos.marca, articulos.modelo],
    empresaCol: articulos.empresaId,
    archivedCol: articulos.archivadoEn,
    where: (_c, f) => and(eq(articulos.activo, true), f.tipo ? eq(articulos.tipo, f.tipo) : undefined),
    order: articulos.referencia,
  });
  registerRefTarget('familias', {
    table: familias,
    id: familias.id,
    label: sql<string>`${familias.nombre}`,
    search: [familias.nombre],
    empresaCol: familias.empresaId,
    archivedCol: familias.archivadoEn,
  });
  registerRefTarget('tarifas', {
    table: tarifas,
    id: tarifas.id,
    label: sql<string>`${tarifas.nombre}`,
    search: [tarifas.nombre],
    empresaCol: tarifas.empresaId,
  });
  registerRefTarget('formas_pago', {
    table: formasPago,
    id: formasPago.id,
    label: sql<string>`${formasPago.nombre}`,
    search: [formasPago.nombre],
    empresaCol: formasPago.empresaId,
    where: () => eq(formasPago.activo, true),
  });
  registerRefTarget('roles', {
    table: roles,
    id: roles.id,
    label: sql<string>`${roles.nombre}`,
    search: [roles.nombre],
    empresaCol: roles.empresaId,
    perm: 'usr.gestionar',
  });
  registerRefTarget('series', {
    table: series,
    id: series.id,
    label: sql<string>`${series.nombre} || ' (' || ${series.codigo} || ' ' || ${series.anio} || ')'`,
    search: [series.nombre, series.codigo],
    empresaCol: series.empresaId,
    filterCols: { tipo: series.tipo },
    where: () => eq(series.activo, true),
  });
  registerRefTarget('documentos', {
    table: documentos,
    id: documentos.id,
    label: sql<string>`coalesce(${documentos.codigo}, 'Borrador') || coalesce(' · ' || ${documentos.titulo}, '')`,
    sub: sql<string>`${documentos.tipo}`,
    search: [documentos.codigo, documentos.titulo, documentos.referenciaExterna],
    empresaCol: documentos.empresaId,
    archivedCol: documentos.archivadoEn,
    filterCols: { tipo: documentos.tipo, terceroId: documentos.terceroId },
  });

  /* ── Entidades del núcleo para comentarios, adjuntos y tareas ── */
  registerEntity('tercero', {
    label: 'Cliente o proveedor',
    module: 'core',
    canView: async (ctx, id) => {
      const [t] = await db.select({ c: terceros.comercialId, e: terceros.empresaId }).from(terceros).where(eq(terceros.id, id));
      return !!t && t.e === ctx.empresaId && (await canOnOwner(ctx, 'terceros.ver', t.c));
    },
    canEdit: async (ctx, id) => {
      const [t] = await db.select({ c: terceros.comercialId, e: terceros.empresaId }).from(terceros).where(eq(terceros.id, id));
      return !!t && t.e === ctx.empresaId && (await canOnOwner(ctx, 'terceros.gestionar', t.c));
    },
    title: async (id) => (await db.select({ n: terceros.nombre }).from(terceros).where(eq(terceros.id, id)))[0]?.n ?? null,
    url: (id) => `/terceros/${id}`,
    watchers: async (id) => {
      const [t] = await db.select({ c: terceros.comercialId }).from(terceros).where(eq(terceros.id, id));
      return t?.c ? [t.c] : [];
    },
  });
  registerEntity('persona', {
    label: 'Persona',
    module: 'core',
    canView: async (ctx, id) => id === ctx.personaId || (await canOnOwner(ctx, 'fic.ver', id)) || can(ctx, 'personas.gestionar'),
    canEdit: async (ctx, id) => (await canOnOwner(ctx, 'fic.editar', id)) || can(ctx, 'personas.gestionar'),
    title: async (id) => (await db.select({ n: nombrePersona }).from(personas).where(eq(personas.id, id)))[0]?.n ?? null,
    url: (id) => `/personas/${id}`,
  });
  registerEntity('articulo', {
    label: 'Artículo',
    module: 'core',
    canView: async (ctx) => can(ctx, 'catalogo.ver'),
    canEdit: async (ctx) => can(ctx, 'catalogo.gestionar'),
    title: async (id) => (await db.select({ n: articulos.nombre }).from(articulos).where(eq(articulos.id, id)))[0]?.n ?? null,
    url: (id) => `/catalogo/${id}`,
  });
  registerEntity('documento', {
    label: 'Documento comercial',
    module: 'core',
    canView: async (ctx, id) => {
      const [d] = await db.select({ tipo: documentos.tipo, c: documentos.comercialId, e: documentos.empresaId }).from(documentos).where(eq(documentos.id, id));
      if (!d || d.e !== ctx.empresaId) return false;
      const mod = DOC_MODULO[d.tipo as DocTipo];
      return ctx.modules.has(mod) && (await canOnOwner(ctx, `${mod}.ver`, d.c));
    },
    title: async (id) => (await db.select({ c: documentos.codigo }).from(documentos).where(eq(documentos.id, id)))[0]?.c ?? 'Borrador',
    url: (id) => `/documentos/${id}`,
    watchers: async (id) => {
      const [d] = await db.select({ c: documentos.comercialId }).from(documentos).where(eq(documentos.id, id));
      return d?.c ? [d.c] : [];
    },
  });
}
