import { sqlClient } from './client';
import { runMigrations } from './migrate';
import { seed } from '../seed';

/** Borra TODA la base de datos y la vuelve a crear con datos de ejemplo. Solo para desarrollo. */
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('db:reset está desactivado en producción');
  await sqlClient.unsafe('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await runMigrations();
  await seed();
  await sqlClient.end();
  console.log('Base de datos reiniciada con datos de ejemplo');
}
main().catch(async (e) => {
  console.error(e);
  await sqlClient.end();
  process.exit(1);
});
