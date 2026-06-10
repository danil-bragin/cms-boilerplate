import 'server-only';
import { createDb, type Db } from '@cms/db';

const globalForDb = globalThis as unknown as { __cmsDb?: Db };

/** Singleton across HMR reloads in dev; one small pool per replica in prod. */
export function db(): Db {
  if (!globalForDb.__cmsDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.__cmsDb = createDb(url, { max: 10 });
  }
  return globalForDb.__cmsDb;
}
