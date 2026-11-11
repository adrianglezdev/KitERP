import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { config } from '../config';
import type { DbOrTx } from '../db/client';
import { archivos } from '../db/schema';
import { sha256, signFileUrl } from './auth';
import { notFound } from './errors';

const MAX_SIZE = 50 * 1024 * 1024;

/**
 * Guarda un archivo en disco usando su huella SHA-256 como nombre (storage/ab/cd/<hash>).
 * Si el mismo contenido ya existe no se duplica. La huella permite comprobar más tarde que el archivo no se ha alterado.
 */
export async function saveFile(
  tx: DbOrTx,
  input: { empresaId: string; nombre: string; mime: string; data: Buffer; subidoPor?: string | null },
) {
  if (input.data.length > MAX_SIZE) throw new Error('El archivo supera el máximo de 50 MB');
  const hash = sha256(input.data);
  const rel = path.join(hash.slice(0, 2), hash.slice(2, 4), hash);
  const abs = path.join(config.storageDir, rel);
  try {
    await stat(abs);
  } catch {
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, input.data, { flag: 'wx' }).catch((e) => {
      if (e.code !== 'EEXIST') throw e;
    });
  }
  const [row] = await tx
    .insert(archivos)
    .values({
      empresaId: input.empresaId,
      nombre: input.nombre.slice(0, 250),
      mime: input.mime || 'application/octet-stream',
      tamano: input.data.length,
      sha256: hash,
      ruta: rel.replace(/\\/g, '/'),
      subidoPor: input.subidoPor ?? null,
    })
    .returning();
  return row!;
}

export async function getFile(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(archivos).where(eq(archivos.id, id));
  if (!row) throw notFound('Archivo no encontrado');
  return row;
}

export function fileStream(ruta: string) {
  return createReadStream(path.join(config.storageDir, ruta));
}

export async function fileBuffer(ruta: string) {
  return readFile(path.join(config.storageDir, ruta));
}

/** Comprueba que el contenido en disco coincide con su huella. */
export async function verifyIntegrity(ruta: string, hash: string) {
  try {
    return sha256(await fileBuffer(ruta)) === hash;
  } catch {
    return false;
  }
}

export function fileUrl(id: string | null | undefined, ttl = 3600) {
  return id ? signFileUrl(id, ttl) : null;
}
