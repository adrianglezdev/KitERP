import type { DbOrTx } from '../db/client';
import { auditoria } from '../db/schema';
import type { Ctx } from './context';

const IGNORE = new Set(['actualizadoEn', 'creadoEn', 'passwordHash', 'totpSecreto', 'tokenHash']);

/** Diferencias entre dos versiones de un registro (solo los campos que cambian). */
export function diff(before: Record<string, any> | null | undefined, after: Record<string, any> | null | undefined) {
  if (!before) return after ? sanitize(after) : null;
  if (!after) return sanitize(before);
  const out: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORE.has(k)) continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { antes: a, despues: b };
  }
  return out;
}

function sanitize(o: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!IGNORE.has(k)) out[k] = v;
  return out;
}

/** Deja constancia de una acción. Se escribe en la misma transacción que el cambio. */
export async function audit(tx: DbOrTx, ctx: Ctx, accion: string, entidad: string, entidadId: string | null, cambios?: unknown) {
  await tx.insert(auditoria).values({
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId === '00000000-0000-0000-0000-000000000000' ? null : ctx.usuarioId,
    accion,
    entidad,
    entidadId,
    cambios: cambios ?? null,
    ip: ctx.ip,
  });
}
