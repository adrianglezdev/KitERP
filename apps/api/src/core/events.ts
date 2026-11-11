import type { EventMap, EventName } from '@kite/shared';
import type { Tx } from '../db/client';
import type { Ctx } from './context';
import type { EventHandler, ModuleDef } from './modules';

/**
 * Bus de eventos entre módulos.
 * Los manejadores se ejecutan en la misma transacción que el cambio que los provoca:
 * si uno falla, se deshace todo. Solo se ejecutan los de módulos activos.
 */
const handlers = new Map<EventName, { module: string; fn: EventHandler<any> }[]>();

export function registerEventHandlers(defs: ModuleDef[]) {
  handlers.clear();
  for (const def of defs) {
    if (!def.events) continue;
    for (const [name, fn] of Object.entries(def.events)) {
      if (!fn) continue;
      const list = handlers.get(name as EventName) ?? [];
      list.push({ module: def.code, fn: fn as EventHandler<any> });
      handlers.set(name as EventName, list);
    }
  }
}

export async function emit<K extends EventName>(tx: Tx, ctx: Ctx, name: K, payload: EventMap[K]): Promise<void> {
  const list = handlers.get(name) ?? [];
  for (const h of list) {
    if (!ctx.modules.has(h.module)) continue;
    await h.fn(tx, ctx, payload);
  }
}

export function subscribers(name: EventName): string[] {
  return (handlers.get(name) ?? []).map((h) => h.module);
}
