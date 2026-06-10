import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq, ne } from 'drizzle-orm';
import { pages, pageLocales, pageVersions, publishedPages } from '@cms/db';
import { DB, type Db } from '../db/db.module.js';
import { REVALIDATE_CLIENT, type RevalidateClient } from './revalidate.client.js';

export const SEO_PING_QUEUE = 'seo-ping';

interface RootProps {
  title?: string;
  description?: string;
}

@Injectable()
export class PublishService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REVALIDATE_CLIENT) private readonly revalidate: RevalidateClient,
    @Optional() @InjectQueue(SEO_PING_QUEUE) private readonly seoPing?: Queue,
  ) {}

  async publish(pageLocaleId: string, versionId: string) {
    const ctx = await this.localeContext(pageLocaleId);

    const version = await this.db.query.pageVersions.findFirst({
      where: and(eq(pageVersions.id, versionId), eq(pageVersions.pageLocaleId, pageLocaleId)),
    });
    if (!version) {
      throw new NotFoundException({
        code: 'version_not_found',
        message: 'Version not found for this page locale',
      });
    }

    const path = this.publicPath(ctx.page.path, ctx.locale.slugOverride);
    const rootProps = ((version.puckData as { root?: { props?: RootProps } }).root?.props ?? {});
    const seo = { title: rootProps.title ?? ctx.page.name, description: rootProps.description ?? '' };

    const publishedAt = await this.db.transaction(async (tx) => {
      await tx
        .update(pageVersions)
        .set({ status: 'archived' })
        .where(
          and(
            eq(pageVersions.pageLocaleId, pageLocaleId),
            eq(pageVersions.status, 'published'),
            ne(pageVersions.id, versionId),
          ),
        );
      await tx.update(pageVersions).set({ status: 'published' }).where(eq(pageVersions.id, versionId));

      const [snapshot] = await tx
        .insert(publishedPages)
        .values({
          siteId: ctx.page.siteId,
          locale: ctx.locale.locale,
          path,
          pageId: ctx.page.id,
          versionId,
          puckData: version.puckData,
          seo,
        })
        .onConflictDoUpdate({
          target: [publishedPages.siteId, publishedPages.locale, publishedPages.path],
          set: { versionId, puckData: version.puckData, seo, publishedAt: new Date() },
        })
        .returning();
      return snapshot!.publishedAt;
    });

    // after commit — stale-until-retry on failure, never a failed publish
    await this.revalidate.invalidate(await this.tagsFor(ctx.page.id, ctx.page.siteId, ctx.locale.locale, path));
    await this.enqueueSeoPing(ctx.page.siteId, ctx.locale.locale, path);

    return { versionId, publishedAt };
  }

  async unpublish(pageLocaleId: string) {
    const ctx = await this.localeContext(pageLocaleId);
    const path = this.publicPath(ctx.page.path, ctx.locale.slugOverride);

    await this.db.transaction(async (tx) => {
      await tx
        .update(pageVersions)
        .set({ status: 'archived' })
        .where(and(eq(pageVersions.pageLocaleId, pageLocaleId), eq(pageVersions.status, 'published')));
      await tx
        .delete(publishedPages)
        .where(
          and(
            eq(publishedPages.siteId, ctx.page.siteId),
            eq(publishedPages.locale, ctx.locale.locale),
            eq(publishedPages.path, path),
          ),
        );
    });

    await this.revalidate.invalidate(await this.tagsFor(ctx.page.id, ctx.page.siteId, ctx.locale.locale, path));
    await this.enqueueSeoPing(ctx.page.siteId, ctx.locale.locale, path);
    return { ok: true };
  }

  /** IndexNow notification (Bing/Yandex/Naver + ChatGPT search via Bing index). */
  private async enqueueSeoPing(siteId: string, locale: string, path: string) {
    await this.seoPing?.add(
      'indexnow',
      { siteId, locale, path },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }

  private tag(siteId: string, locale: string, path: string) {
    return `page:${siteId}:${locale}:${path}`;
  }

  /**
   * Publishing one locale changes the hreflang set of every sibling locale,
   * so their cached HTML must be invalidated too, plus the alternates data tag.
   */
  private async tagsFor(pageId: string, siteId: string, locale: string, path: string): Promise<string[]> {
    const siblings = await this.db.query.publishedPages.findMany({
      where: eq(publishedPages.pageId, pageId),
      columns: { locale: true, path: true },
    });
    const tags = new Set<string>([this.tag(siteId, locale, path), `alts:${pageId}`]);
    for (const s of siblings) tags.add(this.tag(siteId, s.locale, s.path));
    return [...tags];
  }

  /** slugOverride replaces the last path segment for localized URLs. */
  private publicPath(pagePath: string, slugOverride: string | null): string {
    if (!slugOverride || pagePath === '/') return pagePath;
    const segments = pagePath.split('/');
    segments[segments.length - 1] = slugOverride;
    return segments.join('/');
  }

  private async localeContext(pageLocaleId: string) {
    const locale = await this.db.query.pageLocales.findFirst({
      where: eq(pageLocales.id, pageLocaleId),
    });
    if (!locale) {
      throw new NotFoundException({ code: 'page_locale_not_found', message: 'Page locale not found' });
    }
    const page = await this.db.query.pages.findFirst({ where: eq(pages.id, locale.pageId) });
    if (!page) {
      throw new NotFoundException({ code: 'page_not_found', message: 'Page not found' });
    }
    return { locale, page };
  }
}
