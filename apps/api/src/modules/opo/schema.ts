import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, day, money, pct, pk, ts, updatedAt } from '../../db/helpers';
import { contactos, empresas, personas, terceros } from '../../db/schema/core';

export const opoEtapas = pgTable(
  'opo_etapas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    orden: integer().notNull().default(1),
    probabilidad: pct().notNull().default(20),
    tipo: text().notNull().default('abierta'), // abierta | ganada | perdida
    color: text().notNull().default('#7D2CDD'),
  },
  (t) => [index().on(t.empresaId, t.orden)],
);

export const opoOportunidades = pgTable(
  'opo_oportunidades',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    titulo: text().notNull(),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    contactoId: uuid().references(() => contactos.id),
    etapaId: uuid().references(() => opoEtapas.id),
    importe: money(),
    probabilidad: pct(),
    cierrePrevisto: day(),
    comercialId: uuid().references(() => personas.id),
    origen: text().notNull().default('telefono'),
    descripcion: text(),
    motivoPerdida: text(),
    comentarioPerdida: text(),
    ganadaEn: ts(),
    perdidaEn: ts(),
    presupuestoId: uuid(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId, t.etapaId), index().on(t.comercialId), index().on(t.terceroId)],
);
