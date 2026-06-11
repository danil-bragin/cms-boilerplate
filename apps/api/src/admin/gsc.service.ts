import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { publishedPages, sites } from '@cms/db';
import { DB, type Db } from '../db/db.module.js';
import { siteOrigin } from '../publish/origin.js';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * Google Search Console URL Inspection. Per-site service-account JSON in
 * site.settings.gsc.serviceAccount (the SA must be added as a user of the GSC
 * property). No-op + clear error when unconfigured. Quota: 2000/day, 600/min
 * per property — callers should refresh on demand, not in bulk.
 */
@Injectable()
export class GscService {
  private readonly logger = new Logger(GscService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async inspectPage(siteId: string, locale: string, path: string) {
    const site = await this.db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) throw new NotFoundException({ code: 'site_not_found', message: 'Site not found' });

    const gsc = (site.settings as { gsc?: { serviceAccount?: ServiceAccount; propertyUrl?: string } }).gsc;
    if (!gsc?.serviceAccount?.client_email || !gsc.serviceAccount.private_key) {
      return { configured: false as const };
    }

    const origin = siteOrigin(site);
    const inspectionUrl = `${origin}/${locale}${path === '/' ? '' : path}`;
    const siteUrl = gsc.propertyUrl ?? `${origin}/`;

    const jwt = new JWT({
      email: gsc.serviceAccount.client_email,
      key: gsc.serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });

    try {
      const res = await jwt.fetch<{
        inspectionResult?: {
          indexStatusResult?: {
            verdict?: string;
            coverageState?: string;
            lastCrawlTime?: string;
            googleCanonical?: string;
            pageFetchState?: string;
          };
        };
      }>({
        url: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
        method: 'POST',
        data: { inspectionUrl, siteUrl, languageCode: locale },
      });
      const idx = res.data.inspectionResult?.indexStatusResult ?? {};
      return {
        configured: true as const,
        url: inspectionUrl,
        verdict: idx.verdict ?? 'UNKNOWN',
        coverageState: idx.coverageState ?? '',
        lastCrawlTime: idx.lastCrawlTime ?? null,
        googleCanonical: idx.googleCanonical ?? null,
        pageFetchState: idx.pageFetchState ?? '',
      };
    } catch (err) {
      this.logger.warn(`GSC inspect failed for ${inspectionUrl}: ${String(err)}`);
      return { configured: true as const, url: inspectionUrl, error: 'inspection_failed' };
    }
  }
}
