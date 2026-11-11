import { buildApp } from './app';
import { config } from './config';
import { startJobs } from './core/jobs';
import { runMigrations } from './db/migrate';
import { moduleDefs } from './modules/registry';

async function main() {
  if (process.env.MIGRATE_ON_START !== 'false') await runMigrations();
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`KiteERP API escuchando en http://localhost:${config.port}`);
  if (config.jobsEnabled) startJobs(moduleDefs, (m) => app.log.warn(m));

  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
