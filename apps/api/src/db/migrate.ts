import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sqlClient } from './client';

const SQL_DIR = process.env.SQL_DIR ?? path.resolve(process.cwd(), 'src/db/sql');
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');

async function runSqlDir(dir: string) {
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return;
  }
  for (const f of files) {
    const sql = await readFile(path.join(dir, f), 'utf8');
    await sqlClient.unsafe(sql);
  }
}

/**
 * Migraciones:
 *  1. extensiones (sql/pre)
 *  2. migraciones versionadas de drizzle (carpeta drizzle/, se guardan en el repositorio)
 *  3. funciones y disparadores de integridad (sql/post, idempotentes)
 * Se ejecuta con un cerrojo para que dos instancias no migren a la vez.
 */
export async function runMigrations() {
  await sqlClient`SELECT pg_advisory_lock(727274)`;
  try {
    await runSqlDir(path.join(SQL_DIR, 'pre'));
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    await runSqlDir(path.join(SQL_DIR, 'post'));
  } finally {
    await sqlClient`SELECT pg_advisory_unlock(727274)`;
  }
}

const isMain = process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  runMigrations()
    .then(async () => {
      console.log('Migraciones aplicadas');
      await sqlClient.end();
    })
    .catch(async (e) => {
      console.error(e);
      await sqlClient.end();
      process.exit(1);
    });
}
