import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema/*.ts', './src/modules/*/schema.ts'],
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://kite:kite_dev_password@localhost:5433/kite' },
  strict: true,
  verbose: false,
});
