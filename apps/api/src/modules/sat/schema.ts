// Tablas del módulo SAT (prefijo sat_)
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { satShared } from '@kite/shared';
import { archivedAt, createdAt, day, flag, money, pk, price, qty, ts, updatedAt } from '../../db/helpers';
import { archivos, articulos, contactos, direcciones, empresas, personas, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';

/** Plantillas de checklist para las órdenes (puntos a revisar en una visita). */
export const satChecklists = pgTable(
  'sat_checklists',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    tipo: text(),
    items: jsonb().$type<satShared.ChecklistItem[]>().notNull().default([]),
    activo: flag(true),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId)],
);

/** Contratos de mantenimiento: visitas preventivas periódicas, SLA y cuota. */
export const satContratos = pgTable(
  'sat_contratos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    nombre: text().notNull(),
    estado: text().notNull().default('activo'),
    inicio: day().notNull(),
    fin: day(),
    periodicidadMeses: integer().notNull().default(6),
    proximaVisita: day(),
    tecnicoId: uuid().references(() => personas.id),
    checklistId: uuid().references(() => satChecklists.id),
    slaRespuestaHoras: integer(),
    slaResolucionHoras: integer(),
    cuota: money(),
    cuotaPeriodicidad: text().notNull().default('trimestral'),
    /** Fila de facturación periódica del núcleo (documentos_recurrentes). */
    recurrenteId: uuid(),
    notas: text(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId, t.estado, t.proximaVisita), index().on(t.terceroId), uniqueIndex().on(t.empresaId, t.codigo)],
);

/** Equipos instalados en casa del cliente. */
export const satEquipos = pgTable(
  'sat_equipos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    articuloId: uuid().references(() => articulos.id),
    nombre: text().notNull(),
    marca: text(),
    modelo: text(),
    numeroSerie: text(),
    ubicacion: text(),
    direccionId: uuid().references(() => direcciones.id, { onDelete: 'set null' }),
    fechaInstalacion: day(),
    garantiaHasta: day(),
    contratoId: uuid().references(() => satContratos.id),
    notas: text(),
    /** Token del código QR de la etiqueta (portal público del equipo). */
    portalToken: text(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.empresaId),
    index().on(t.terceroId),
    index().on(t.contratoId),
    index().on(t.articuloId),
    uniqueIndex('sat_equipos_token_uq').on(t.portalToken),
    index('sat_equipos_busqueda_trgm').using('gin', sql`(coalesce(${t.nombre},'') || ' ' || coalesce(${t.numeroSerie},'') || ' ' || coalesce(${t.modelo},'')) gin_trgm_ops`),
  ],
);

/** Avisos e incidencias de los clientes. */
export const satTickets = pgTable(
  'sat_tickets',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    contactoId: uuid().references(() => contactos.id),
    equipoId: uuid().references(() => satEquipos.id),
    contratoId: uuid().references(() => satContratos.id),
    asunto: text().notNull(),
    descripcion: text(),
    prioridad: text().notNull().default('normal'),
    canal: text().notNull().default('telefono'),
    estado: text().notNull().default('nuevo'),
    responsableId: uuid().references(() => personas.id),
    /** Quien avisó (cuando llega por el portal o el QR). */
    reportadoPor: text(),
    reportadoContacto: text(),
    slaRespuestaHoras: integer().notNull(),
    slaResolucionHoras: integer().notNull(),
    venceRespuesta: ts().notNull(),
    venceResolucion: ts().notNull(),
    primeraRespuestaEn: ts(),
    resueltoEn: ts(),
    cerradoEn: ts(),
    slaIncumplido: flag(false),
    valoracion: integer(),
    valoracionComentario: text(),
    valoradoEn: ts(),
    portalToken: text().notNull(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    index().on(t.terceroId, t.creadoEn),
    index().on(t.responsableId),
    index().on(t.equipoId),
    uniqueIndex().on(t.empresaId, t.codigo),
    uniqueIndex('sat_tickets_token_uq').on(t.portalToken),
    index('sat_tickets_busqueda_trgm').using('gin', sql`(coalesce(${t.codigo},'') || ' ' || coalesce(${t.asunto},'')) gin_trgm_ops`),
  ],
);

/** Órdenes de trabajo (lo que hace un técnico en una visita). */
export const satOrdenes = pgTable(
  'sat_ordenes',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    ticketId: uuid().references(() => satTickets.id),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    direccionId: uuid().references(() => direcciones.id, { onDelete: 'set null' }),
    /** Copia de la dirección de la visita en el momento de crear la orden. */
    direccion: jsonb().$type<{ nombre?: string | null; direccion?: string | null; codigoPostal?: string | null; localidad?: string | null; provincia?: string | null; telefono?: string | null; lat?: number | null; lng?: number | null }>(),
    equipoId: uuid().references(() => satEquipos.id),
    contratoId: uuid().references(() => satContratos.id),
    tecnicoId: uuid().references(() => personas.id),
    tipo: text().notNull().default('correctivo'),
    prioridad: text().notNull().default('normal'),
    estado: text().notNull().default('pendiente'),
    descripcion: text(),
    planificadaInicio: ts(),
    planificadaFin: ts(),
    /** Fecha de la visita preventiva que generó la orden (evita duplicados). */
    visitaFecha: day(),
    checklistId: uuid().references(() => satChecklists.id),
    checklist: jsonb().$type<satShared.ChecklistItem[]>().notNull().default([]),
    trabajoRealizado: text(),
    facturable: flag(true),
    desplazamiento: flag(true),
    firmaArchivoId: uuid().references(() => archivos.id),
    firmaNombre: text(),
    enRutaEn: ts(),
    iniciadaEn: ts(),
    finalizadaEn: ts(),
    canceladaMotivo: text(),
    /** Identificador del parte enviado desde el móvil (reenvíos sin duplicar). */
    cierreUid: text(),
    albaranId: uuid().references(() => documentos.id),
    presupuestoId: uuid().references(() => documentos.id),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    index().on(t.tecnicoId, t.planificadaInicio),
    index().on(t.terceroId, t.creadoEn),
    index().on(t.ticketId),
    index().on(t.equipoId),
    uniqueIndex().on(t.empresaId, t.codigo),
    uniqueIndex('sat_ordenes_visita_uq').on(t.contratoId, t.visitaFecha),
    index('sat_ordenes_busqueda_trgm').using('gin', sql`(coalesce(${t.codigo},'') || ' ' || coalesce(${t.descripcion},'')) gin_trgm_ops`),
  ],
);

export const satOrdenMateriales = pgTable(
  'sat_orden_materiales',
  {
    id: pk(),
    ordenId: uuid()
      .notNull()
      .references(() => satOrdenes.id, { onDelete: 'cascade' }),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id),
    descripcion: text(),
    cantidad: qty().notNull(),
    /** Almacén de salida (STK). Referencia simple, sin clave foránea entre módulos. */
    almacenId: uuid(),
    precio: price(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.ordenId)],
);

export const satOrdenTiempos = pgTable(
  'sat_orden_tiempos',
  {
    id: pk(),
    ordenId: uuid()
      .notNull()
      .references(() => satOrdenes.id, { onDelete: 'cascade' }),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    inicio: ts().notNull(),
    fin: ts(),
    minutos: integer(),
    origen: text().notNull().default('cronometro'),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.ordenId), index().on(t.personaId, t.inicio)],
);
