import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

/** Pool de conexiones. Las fechas `date` llegan como texto (AAAA-MM-DD) para no sufrir desfases de zona horaria. */
export const sqlClient = postgres(config.databaseUrl, {
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idle_timeout: 30,
  connect_timeout: 15,
  prepare: true,
  onnotice: () => {},
  types: {
    // clave propia: no sustituye al tipo "date" de postgres.js, que serializa los Date de fecha y hora
    fechaSinHora: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
  },
});

export const db = drizzle(sqlClient, { schema, casing: 'snake_case' });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type DbOrTx = DB | Tx;
