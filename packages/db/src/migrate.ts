import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Runtime migrator for deploys (the Helm pre-upgrade Job). Uses the
 * drizzle-orm migrator (a prod dependency) — drizzle-kit is dev-only and not
 * in the production image.
 */
const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  await client.end();
  console.log('migrations applied');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
