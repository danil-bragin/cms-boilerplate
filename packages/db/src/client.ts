import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export interface DbOptions {
  /** Max pool connections. Keep small per replica; multiply by replica count when sizing Postgres. */
  max?: number;
}

export function createDb(url: string, opts: DbOptions = {}) {
  // PG_POOL_MAX caps per-pool connections. Multiply by (replicas × pools-per-pod)
  // when sizing Postgres max_connections; add PgBouncer past ~7 web replicas.
  const max = opts.max ?? (process.env.PG_POOL_MAX ? Number(process.env.PG_POOL_MAX) : 10);
  const client = postgres(url, { max, onnotice: () => {} });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
