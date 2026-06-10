import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export interface DbOptions {
  /** Max pool connections. Keep small per replica; multiply by replica count when sizing Postgres. */
  max?: number;
}

export function createDb(url: string, opts: DbOptions = {}) {
  const client = postgres(url, { max: opts.max ?? 10, onnotice: () => {} });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
