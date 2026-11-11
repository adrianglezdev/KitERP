import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sqlClient } from './client';
import { seed } from '../seed';

/**
 * Desarrollo: recrea la base de datos indicada en DATABASE_URL a partir del esquema actual
 * (sin generar migraciones) y carga los datos de ejemplo.
 *   DATABASE_URL=postgres://kite:kite_dev_password@localhost:5433/kite_x npx tsx src/db/push-reset.ts
 * Si la base de datos no existe, se crea.
 */
async function runDir(dir: string) {
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await sqlClient.unsafe(await readFile(path.join(dir, f), 'utf8'));
}

async function ensureDatabase(url: string) {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  u.pathname = '/postgres';
  const postgres = (await import('postgres')).default;
  const admin = postgres(u.toString(), { max: 1, onnotice: () => {} });
  const [r] = await admin`SELECT 1 AS ok FROM pg_database WHERE datname = ${name}`;
  if (!r) await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.end();
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('No disponible en producción');
  const url = process.env.DATABASE_URL!;
  await ensureDatabase(url);
  await sqlClient.unsafe('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await runDir(path.resolve('src/db/sql/pre'));
  const r = spawnSync('npx', ['drizzle-kit', 'push', '--force'], { stdio: 'inherit', shell: true, env: process.env });
  if (r.status !== 0) throw new Error('drizzle-kit push ha fallado');
  await runDir(path.resolve('src/db/sql/post'));
  if (process.argv.includes('--sin-datos')) return;
  await seed();
}

main()
  .then(() => sqlClient.end())
  .then(() => console.log('Base de datos lista'))
  .catch(async (e) => {
    console.error(e);
    await sqlClient.end();
    process.exit(1);
  });
