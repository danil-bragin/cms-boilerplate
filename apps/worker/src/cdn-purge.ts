import { eq } from 'drizzle-orm';
import { sites, type Db } from '@cms/db';

/**
 * CDN edge purge on publish. Tags carry exact paths
 * (`page:{siteId}:{locale}:{path}`), so we purge precise URLs — no wildcard
 * invalidation storms. Provider chosen by CDN_PROVIDER env.
 */

export interface PurgeTarget {
  urls: string[];
  paths: string[];
}

export async function resolvePurgeTargets(db: Db, tags: string[]): Promise<PurgeTarget> {
  const urls: string[] = [];
  const paths: string[] = [];
  const siteCache = new Map<string, string | null>();

  for (const tag of tags) {
    const match = /^page:([0-9a-f-]{36}):([a-zA-Z-]+):(\/.*)$/.exec(tag);
    if (!match) continue;
    const [, siteId, locale, path] = match as unknown as [string, string, string, string];

    let domain = siteCache.get(siteId);
    if (domain === undefined) {
      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      domain = site?.domains[0] ?? null;
      siteCache.set(siteId, domain);
    }
    const publicPath = `/${locale}${path === '/' ? '' : path}`;
    paths.push(publicPath);
    if (domain) urls.push(`https://${domain}${publicPath}`);
  }
  return { urls: [...new Set(urls)], paths: [...new Set(paths)] };
}

export function cloudflarePurgeRequest(zoneId: string, token: string, urls: string[]) {
  return {
    url: `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    init: {
      method: 'POST' as const,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ files: urls }),
    },
  };
}

export function cloudfrontInvalidationInput(distributionId: string, paths: string[]) {
  return {
    DistributionId: distributionId,
    InvalidationBatch: {
      // unique per call so repeated purges of the same paths are accepted
      CallerReference: `cms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      Paths: { Quantity: paths.length, Items: paths },
    },
  };
}

export async function purgeCdn(db: Db, tags: string[]): Promise<void> {
  const provider = process.env.CDN_PROVIDER;
  const { urls, paths } = await resolvePurgeTargets(db, tags);
  if (paths.length === 0) return;

  if (provider === 'cloudflare') {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!zoneId || !token || urls.length === 0) return;
    const { url, init } = cloudflarePurgeRequest(zoneId, token, urls);
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`cloudflare purge returned ${res.status}`);
    return;
  }

  if (provider === 'cloudfront') {
    const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
    if (!distributionId) return;
    const { CloudFrontClient, CreateInvalidationCommand } = await import('@aws-sdk/client-cloudfront');
    const client = new CloudFrontClient({});
    await client.send(new CreateInvalidationCommand(cloudfrontInvalidationInput(distributionId, paths)));
  }
}
