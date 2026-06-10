import { eq } from 'drizzle-orm';
import { sites } from '@cms/db';
import type { Db } from '@cms/db';

const INDEXNOW_API = 'https://api.indexnow.org/indexnow';

export interface SeoPingJob {
  siteId: string;
  locale: string;
  path: string;
}

/**
 * IndexNow ping: notifies Bing/Yandex/Seznam/Naver (one submission is shared
 * with all participants) — also feeds ChatGPT search and Copilot, which run
 * on the Bing index. Google does not support IndexNow; it relies on the
 * sitemap with accurate lastmod instead. No-op when the site has no key.
 */
export async function pingIndexNow(db: Db, job: SeoPingJob, schemeOverride?: string): Promise<void> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, job.siteId) });
  if (!site) return;
  const key = (site.settings as { indexNowKey?: string }).indexNowKey;
  const host = site.domains[0];
  if (!key || !host) return;

  const scheme = schemeOverride ?? process.env.SITE_URL_SCHEME ?? 'https';
  if (scheme !== 'https') return; // IndexNow endpoints reject non-https hosts (dev/localhost)

  const url = `https://${host}/${job.locale}${job.path === '/' ? '' : job.path}`;
  const res = await fetch(INDEXNOW_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key,
      keyLocation: `https://${host}/indexnow.txt`,
      urlList: [url],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // 200/202 = accepted; 4xx = config problem worth surfacing in logs
  if (!res.ok && res.status !== 202) {
    throw new Error(`indexnow returned ${res.status} for ${url}`);
  }
}
