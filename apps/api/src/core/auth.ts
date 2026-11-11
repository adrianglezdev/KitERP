import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config';
import { db } from '../db/client';
import { apiClaves, personas, sesiones, usuarioEmpresas, usuarios } from '../db/schema';
import type { Ctx } from './context';
import { unauthorized } from './errors';
import { activeModules } from './modules';
import { departmentOf, loadPermissions, teamOf } from './permissions';
import type { Scope } from '@kite/shared';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

export const SESSION_COOKIE = 'kite_session';

/* ── Contraseñas (scrypt, sin dependencias nativas) ── */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = await scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe combinar letras y números';
  return null;
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/* ── Sesiones ── */

export async function createSession(usuarioId: string, empresaId: string, req: FastifyRequest) {
  const token = randomToken();
  const expiraEn = new Date(Date.now() + config.sessionDays * 86400_000);
  await db.insert(sesiones).values({
    id: sha256(token),
    usuarioId,
    empresaId,
    expiraEn,
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
  });
  return { token, expiraEn };
}

export function sessionCookieOptions(expires?: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProd,
    expires,
  };
}

/* ── TOTP (RFC 6238) para el doble factor ── */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(buf).digest();
  const o = h[h.length - 1]! & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}
export function verifyTotp(secretB32: string, code: string): boolean {
  const secret = base32Decode(secretB32);
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => hotp(secret, step + d) === code.replace(/\s/g, ''));
}
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/* ── Firma de URLs de archivos (descarga sin exponer rutas internas) ── */

export function signFileUrl(archivoId: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', config.sessionSecret).update(`${archivoId}.${exp}`).digest('base64url');
  return `/api/archivos/${archivoId}?exp=${exp}&sig=${sig}`;
}
export function verifyFileSignature(archivoId: string, exp: string, sig: string): boolean {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = createHmac('sha256', config.sessionSecret).update(`${archivoId}.${exp}`).digest('base64url');
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/* ── Construcción del contexto de la petición ── */

async function buildCtx(opts: {
  usuarioId: string;
  empresaId: string;
  ip: string | null;
  apiPerms?: Record<string, Scope>;
}): Promise<Ctx> {
  const [ue] = await db
    .select()
    .from(usuarioEmpresas)
    .where(and(eq(usuarioEmpresas.usuarioId, opts.usuarioId), eq(usuarioEmpresas.empresaId, opts.empresaId), eq(usuarioEmpresas.activo, true)));
  if (!ue) throw unauthorized('Tu usuario no tiene acceso a esta empresa');
  if (ue.accesoHasta && ue.accesoHasta < new Date().toISOString().slice(0, 10)) throw unauthorized('Tu acceso ha caducado');

  let persona: { nombre: string; apellidos: string | null; departamentoId: string | null } | undefined;
  if (ue.personaId) {
    [persona] = await db
      .select({ nombre: personas.nombre, apellidos: personas.apellidos, departamentoId: personas.departamentoId })
      .from(personas)
      .where(eq(personas.id, ue.personaId));
  }
  const { perms, isAdmin } = await loadPermissions(ue);
  const modules = await activeModules(opts.empresaId);
  let team: string[] | null = null;
  let dept: string[] | null = null;
  const personaId = ue.personaId;
  const departamentoId = persona?.departamentoId ?? null;
  return {
    empresaId: opts.empresaId,
    usuarioId: opts.usuarioId,
    usuarioEmpresaId: ue.id,
    personaId,
    departamentoId,
    nombre: persona ? `${persona.nombre} ${persona.apellidos ?? ''}`.trim() : 'Usuario',
    perms: opts.apiPerms ? new Map(Object.entries(opts.apiPerms)) : perms,
    modules,
    isAdmin: opts.apiPerms ? false : isAdmin,
    ip: opts.ip,
    teamIds: async () => (team ??= personaId ? await teamOf(personaId) : []),
    deptIds: async () => (dept ??= await departmentOf(departamentoId, personaId)),
  };
}

/** Registra el hook que autentica todas las rutas /api salvo las marcadas como públicas. */
export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('ctx', null as unknown as Ctx);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    const cfg = (req.routeOptions?.config ?? {}) as { public?: boolean };
    if (cfg.public) return;

    // 1) Clave de API (integraciones)
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer kite_')) {
      const token = auth.slice(7);
      const [, prefijo] = token.split('_');
      const [clave] = await db
        .select()
        .from(apiClaves)
        .where(and(eq(apiClaves.prefijo, prefijo ?? ''), isNull(apiClaves.revocadaEn)));
      if (!clave || clave.hash !== sha256(token)) throw unauthorized('Clave de API no válida');
      if (!clave.creadoPor) throw unauthorized('Clave de API sin propietario');
      req.ctx = await buildCtx({ usuarioId: clave.creadoPor, empresaId: clave.empresaId, ip: req.ip, apiPerms: clave.permisos as Record<string, Scope> });
      db.update(apiClaves).set({ ultimoUso: new Date() }).where(eq(apiClaves.id, clave.id)).catch(() => {});
      return;
    }

    // 2) Cookie de sesión
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw unauthorized();
    const id = sha256(token);
    const [s] = await db
      .select({ s: sesiones, activo: usuarios.activo })
      .from(sesiones)
      .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
      .where(and(eq(sesiones.id, id), gt(sesiones.expiraEn, new Date())));
    if (!s || !s.activo) throw unauthorized('Tu sesión ha caducado. Vuelve a entrar.');
    req.sessionId = id;
    req.ctx = await buildCtx({ usuarioId: s.s.usuarioId, empresaId: s.s.empresaId, ip: req.ip });
    if (Date.now() - new Date(s.s.ultimoUso).getTime() > 3600_000) {
      const expiraEn = new Date(Date.now() + config.sessionDays * 86400_000);
      db.update(sesiones).set({ ultimoUso: new Date(), expiraEn }).where(eq(sesiones.id, id)).catch(() => {});
    }
  });
}
