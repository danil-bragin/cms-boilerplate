import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { pageLocales, pageVersions } from '@cms/db';
import type { AuthContext } from '@cms/auth';
import { DB, type Db } from '../db/db.module.js';
import { SiteAccessService } from '../auth/site-access.service.js';
import { PublishService } from '../publish/publish.service.js';
import { PagesService } from './pages.service.js';

interface ItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

/** Bulk page operations. Site access asserted per resolved siteId; items run
 *  with a small concurrency cap; each item's outcome reported independently. */
@Injectable()
export class BulkService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SiteAccessService) private readonly access: SiteAccessService,
    @Inject(PublishService) private readonly publish: PublishService,
    @Inject(PagesService) private readonly pages: PagesService,
  ) {}

  async run(
    user: AuthContext,
    action: 'publish' | 'unpublish' | 'delete' | 'add-locale',
    ids: string[],
    locale: string | undefined,
  ): Promise<ItemResult[]> {
    const limit = 8;
    const results: ItemResult[] = [];
    for (let i = 0; i < ids.length; i += limit) {
      const batch = ids.slice(i, i + limit);
      const settled = await Promise.all(
        batch.map((id) => this.runOne(user, action, id, locale)),
      );
      results.push(...settled);
    }
    return results;
  }

  private async runOne(
    user: AuthContext,
    action: 'publish' | 'unpublish' | 'delete' | 'add-locale',
    id: string,
    locale: string | undefined,
  ): Promise<ItemResult> {
    try {
      if (action === 'publish') {
        const siteId = await this.access.siteForPageLocale(id);
        await this.access.assertSiteAccess(user, siteId);
        const latest = await this.db.query.pageVersions.findFirst({
          where: eq(pageVersions.pageLocaleId, id),
          orderBy: [desc(pageVersions.versionNo)],
        });
        if (!latest) return { id, ok: false, error: 'no version' };
        await this.publish.publish(id, latest.id);
      } else if (action === 'unpublish') {
        const siteId = await this.access.siteForPageLocale(id);
        await this.access.assertSiteAccess(user, siteId);
        await this.publish.unpublish(id);
      } else if (action === 'delete') {
        const siteId = await this.access.siteForPage(id);
        await this.access.assertSiteAccess(user, siteId);
        await this.pages.deletePage(id);
      } else {
        // add-locale: id = pageId, locale required
        if (!locale) return { id, ok: false, error: 'locale required' };
        const siteId = await this.access.siteForPage(id);
        await this.access.assertSiteAccess(user, siteId);
        const exists = await this.db.query.pageLocales.findFirst({
          where: eq(pageLocales.pageId, id),
        });
        void exists;
        await this.pages.addLocale(id, locale, user.sub);
      }
      return { id, ok: true };
    } catch (err) {
      const message = (err as { response?: { message?: string }; message?: string }).response?.message
        ?? (err as { message?: string }).message
        ?? 'failed';
      return { id, ok: false, error: message };
    }
  }
}
