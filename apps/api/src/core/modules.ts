import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  CORE_MODULE_CODES,
  OPTIONAL_MODULE_CODES,
  type ApprovalItem,
  type DashboardWidget,
  type EventMap,
  type EventName,
  type SearchResult,
  type TimelineEntry,
} from '@kite/shared';
import { db, type DB, type Tx } from '../db/client';
import { modulosEmpresa } from '../db/schema';
import type { Ctx } from './context';
import type { RefTarget } from './refs';
import type { EntityGuard } from './entities';

export type EventHandler<K extends EventName> = (tx: Tx, ctx: Ctx, payload: EventMap[K]) => Promise<void>;

export interface JobDef {
  /** Identificador único, p. ej. "aus.recordatorio_saldos". */
  id: string;
  /** Frecuencia: cada N minutos o una vez al día a la hora indicada (hora de Madrid). */
  every?: number;
  dailyAt?: string; // "07:30"
  run: (empresaId: string, ctx: Ctx) => Promise<string | void>;
}

export interface SeedCtx {
  empresaId: string;
  adminUsuarioId: string;
  /** Personas de ejemplo por clave (direccion, comercial1, tecnico1…). */
  personas: Record<string, string>;
  /** Terceros de ejemplo por clave. */
  terceros: Record<string, string>;
  /** Artículos de ejemplo por referencia. */
  articulos: Record<string, string>;
  departamentos: Record<string, string>;
  centros: Record<string, string>;
}

export interface ModuleDef {
  code: string;
  /** Rutas del módulo; se montan en /api/<code> y solo responden si el módulo está activo. */
  routes?: (app: FastifyInstance) => Promise<void> | void;
  /** Suscripciones a eventos de otros módulos (se ejecutan en la misma transacción). */
  events?: { [K in EventName]?: EventHandler<K> };
  /** Entradas para la línea de tiempo de un tercero, persona u otra entidad. */
  timeline?: (db: DB, ctx: Ctx, entidad: string, id: string) => Promise<TimelineEntry[]>;
  /** Resultados para la búsqueda global. */
  search?: (db: DB, ctx: Ctx, q: string) => Promise<SearchResult[]>;
  /** Indicadores para el panel de inicio. */
  dashboard?: (db: DB, ctx: Ctx) => Promise<DashboardWidget[]>;
  /** Elementos pendientes de aprobar por el usuario. */
  approvals?: (db: DB, ctx: Ctx) => Promise<ApprovalItem[]>;
  /** Tareas programadas. */
  jobs?: JobDef[];
  /** Destinos para los selectores de referencias (GET /api/refs/:target). */
  refTargets?: Record<string, RefTarget>;
  /** Entidades del módulo que admiten comentarios, adjuntos y tareas (con su control de acceso). */
  entities?: Record<string, EntityGuard>;
  /** Datos de ejemplo. */
  seed?: (tx: Tx, s: SeedCtx) => Promise<void>;
}

export function defineModule(def: ModuleDef): ModuleDef {
  return def;
}

/* ── Módulos activos por empresa (con caché corta; se invalida al cambiar) ── */

const cache = new Map<string, { at: number; set: Set<string> }>();
const TTL = 30_000;

export async function activeModules(empresaId: string): Promise<Set<string>> {
  const hit = cache.get(empresaId);
  if (hit && Date.now() - hit.at < TTL) return hit.set;
  const rows = await db
    .select({ modulo: modulosEmpresa.modulo })
    .from(modulosEmpresa)
    .where(and(eq(modulosEmpresa.empresaId, empresaId), eq(modulosEmpresa.activo, true)));
  const set = new Set<string>([...CORE_MODULE_CODES, ...rows.map((r) => r.modulo).filter((m) => OPTIONAL_MODULE_CODES.includes(m as never))]);
  cache.set(empresaId, { at: Date.now(), set });
  return set;
}

export function invalidateModules(empresaId: string) {
  cache.delete(empresaId);
}

export function isActive(ctx: Ctx, code: string) {
  return ctx.modules.has(code);
}
