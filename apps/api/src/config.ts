import path from 'node:path';

function env(name: string, def?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (def !== undefined) return def;
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return v;
}

export const config = {
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  port: Number(env('API_PORT', '4000')),
  databaseUrl: env('DATABASE_URL', 'postgres://kite:kite_dev_password@localhost:5433/kite'),
  appUrl: env('APP_URL', 'http://localhost:5173'),
  sessionSecret: env('SESSION_SECRET', 'dev-secret-change-me-dev-secret-change-me'),
  storageDir: path.resolve(env('STORAGE_DIR', './storage')),
  sessionDays: Number(env('SESSION_DAYS', '14')),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'KiteERP <no-responder@example.com>',
  },
  verifactuEntorno: (process.env.VERIFACTU_ENTORNO || 'pruebas') as 'pruebas' | 'produccion',
  jobsEnabled: process.env.JOBS_ENABLED !== 'false',
};
