import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { empresas, notificaciones, rolPermisos, roles, usuarioEmpresas, usuarios } from '../db/schema';
import { config } from '../config';
import type { Ctx } from './context';
import { emailLayout, queueEmail } from './mail';

export interface NotifyInput {
  modulo: string;
  tipo: string;
  titulo: string;
  cuerpo?: string | null;
  enlace?: string | null;
  /** Destinatarios por persona (se resuelven a sus usuarios). */
  personaIds?: (string | null | undefined)[];
  usuarioIds?: string[];
  /** Todos los usuarios con este permiso (y los administradores). */
  permiso?: string;
  /** Además del aviso en la app, envía email. */
  email?: boolean;
  /** No avisar a quien provoca la acción. */
  excluirActor?: boolean;
}

/** Usuarios (de la empresa) que tienen un permiso a través de su rol. */
export async function usersWithPermission(tx: DbOrTx, empresaId: string, permiso: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ id: usuarioEmpresas.usuarioId })
    .from(usuarioEmpresas)
    .innerJoin(roles, eq(roles.id, usuarioEmpresas.rolId))
    .leftJoin(rolPermisos, and(eq(rolPermisos.rolId, roles.id), eq(rolPermisos.permiso, permiso)))
    .where(and(eq(usuarioEmpresas.empresaId, empresaId), eq(usuarioEmpresas.activo, true), or(eq(roles.clave, 'admin'), isNotNull(rolPermisos.permiso))));
  return rows.map((r) => r.id);
}

export async function notify(tx: DbOrTx, ctx: Ctx, n: NotifyInput) {
  const ids = new Set<string>(n.usuarioIds ?? []);
  const personaIds = (n.personaIds ?? []).filter(Boolean) as string[];
  if (personaIds.length) {
    const rows = await tx
      .select({ id: usuarioEmpresas.usuarioId })
      .from(usuarioEmpresas)
      .where(and(eq(usuarioEmpresas.empresaId, ctx.empresaId), inArray(usuarioEmpresas.personaId, personaIds), eq(usuarioEmpresas.activo, true)));
    rows.forEach((r) => ids.add(r.id));
  }
  if (n.permiso) (await usersWithPermission(tx, ctx.empresaId, n.permiso)).forEach((id) => ids.add(id));
  if (n.excluirActor !== false) ids.delete(ctx.usuarioId);
  if (!ids.size) return;

  const list = [...ids];
  await tx.insert(notificaciones).values(
    list.map((usuarioId) => ({
      empresaId: ctx.empresaId,
      usuarioId,
      modulo: n.modulo,
      tipo: n.tipo,
      titulo: n.titulo,
      cuerpo: n.cuerpo ?? null,
      enlace: n.enlace ?? null,
    })),
  );

  if (n.email) {
    const [emp] = await tx.select({ nombre: empresas.nombre }).from(empresas).where(eq(empresas.id, ctx.empresaId));
    const dest = await tx.select({ email: usuarios.email }).from(usuarios).where(and(inArray(usuarios.id, list), eq(usuarios.activo, true)));
    for (const d of dest) {
      await queueEmail(tx, {
        empresaId: ctx.empresaId,
        para: d.email,
        asunto: n.titulo,
        html: emailLayout({
          empresa: emp?.nombre ?? 'KiteERP',
          titulo: n.titulo,
          cuerpo: n.cuerpo ? `<p>${n.cuerpo.replace(/</g, '&lt;')}</p>` : '',
          boton: n.enlace ? { texto: 'Abrir en KiteERP', url: config.appUrl + n.enlace } : undefined,
        }),
      });
    }
  }
}

export const _unused = sql;
