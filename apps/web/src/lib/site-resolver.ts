import 'server-only';
import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { sites } from '@cms/db';
import { db } from './db';

export interface ResolvedSite {
  id: string;
  slug: string;
  domains: string[];
  defaultLocale: string;
  locales: string[];
  settings: Record<string, unknown>;
}

/**
 * Host → site, cached and tagged `sites` (invalidated on any site change).
 * Replaces per-request `SELECT * FROM sites` + JS `.find` on the SEO endpoints.
 * Uses an indexed `= ANY(domains)` lookup.
 */
export const resolveSiteByHost = (host: string) =>
  unstable_cache(
    async (): Promise<ResolvedSite | null> => {
      const bare = host.split(':')[0] ?? host;
      const rows = await db()
        .select()
        .from(sites)
        .where(sql`${bare} = ANY(${sites.domains})`)
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        slug: row.slug,
        domains: row.domains,
        defaultLocale: row.defaultLocale,
        locales: row.locales,
        settings: row.settings as Record<string, unknown>,
      };
    },
    ['site-by-host', host],
    { tags: ['sites'] },
  )();
