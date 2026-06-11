import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq, ne, sql } from 'drizzle-orm';
import { pages, pageLocales, pageVersions, publishedPages, redirects, webhooks } from '@cms/db';
import { DB, type Db } from '../db/db.module.js';
import { REVALIDATE_CLIENT, type RevalidateClient } from './revalidate.client.js';

export const SEO_PING_QUEUE = 'seo-ping';
export const WEBHOOK_QUEUE = 'webhook';

interface RootProps {
  title?: string;
  description?: string;
  ogImage?: { s3Key?: string };
  noindex?: boolean;
}

/** Full flattened text content for full-text search. */
export function extractSearchText(puckData: unknown): string {
  return collectTexts(puckData).join(' ').replace(/\s+/g, ' ');
}

/** First ~155 chars of textual content (Text/Heading props), for meta description fallback. */
export function extractDescription(puckData: unknown): string {
  const joined = collectTexts(puckData).join(' ').replace(/\s+/g, ' ');
  return joined.length > 155 ? `${joined.slice(0, 152)}…` : joined;
}

function collectTexts(puckData: unknown): string[] {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === 'string' && obj.text.trim()) {
      // richtext stores HTML — strip tags for search/description
      texts.push(obj.text.replace(/<[^>]+>/g, ' ').trim());
    }
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) walk(value);
    }
  };
  walk((puckData as { content?: unknown }).content);
  return texts;
}

@Injectable()
export class PublishService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REVALIDATE_CLIENT) private readonly revalidate: RevalidateClient,
    @Optional() @InjectQueue(SEO_PING_QUEUE) private readonly seoPing?: Queue,
    @Optional() @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue?: Queue,
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
    const seo = {
      title: rootProps.title || ctx.page.name,
      // empty description hurts SEO scores — fall back to page text content
      description: rootProps.description || extractDescription(version.puckData) || '',
      ...(rootProps.ogImage?.s3Key ? { ogImageKey: rootProps.ogImage.s3Key } : {}),
      ...(rootProps.noindex ? { noindex: true } : {}),
    };
    const searchText = [seo.title, seo.description, extractSearchText(version.puckData)]
      .filter(Boolean)
      .join(' ')
      .slice(0, 50_000);

    const staleTags: string[] = [];
    const publishedAt = await this.db.transaction(async (tx) => {
      // serialize publish/unpublish per locale — kills the double-published race
      await tx.execute(sql`SELECT id FROM page_locales WHERE id = ${pageLocaleId} FOR UPDATE`);

      // path changed (rename or slugOverride): retire the snapshot at the old
      // path and leave a permanent redirect so the old URL keeps working
      const stale = await tx
        .select({ path: publishedPages.path })
        .from(publishedPages)
        .where(
          and(
            eq(publishedPages.pageId, ctx.page.id),
            eq(publishedPages.locale, ctx.locale.locale),
            ne(publishedPages.path, path),
          ),
        );
      for (const old of stale) {
        await tx
          .delete(publishedPages)
          .where(
            and(
              eq(publishedPages.pageId, ctx.page.id),
              eq(publishedPages.locale, ctx.locale.locale),
              eq(publishedPages.path, old.path),
            ),
          );
        await tx
          .insert(redirects)
          .values({
            siteId: ctx.page.siteId,
            fromPath: `/${ctx.locale.locale}${old.path === '/' ? '' : old.path}`,
            toPath: `/${ctx.locale.locale}${path === '/' ? '' : path}`,
            status: '301',
            createdBy: 'system',
          })
          .onConflictDoUpdate({
            target: [redirects.siteId, redirects.fromPath],
            set: { toPath: `/${ctx.locale.locale}${path === '/' ? '' : path}` },
          });
        staleTags.push(this.tag(ctx.page.siteId, ctx.locale.locale, old.path));
      }

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

      // Article datePublished: stamp once, never moves on republish
      if (!ctx.page.firstPublishedAt) {
        await tx
          .update(pages)
          .set({ firstPublishedAt: new Date() })
          .where(and(eq(pages.id, ctx.page.id), sql`first_published_at IS NULL`));
      }

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
          searchText,
        })
        .onConflictDoUpdate({
          target: [publishedPages.siteId, publishedPages.locale, publishedPages.path],
          set: { versionId, puckData: version.puckData, seo, searchText, publishedAt: new Date() },
        })
        .returning();
      return snapshot!.publishedAt;
    });

    // after commit — independent side effects run in parallel; stale-until-retry
    // on failure, never a failed publish
    const tags = [
      ...(await this.tagsFor(ctx.page.id, ctx.page.siteId, ctx.locale.locale, path)),
      ...staleTags,
    ];
    await Promise.all([
      this.revalidate.invalidate(tags),
      this.enqueueSeoPing(ctx.page.siteId, ctx.locale.locale, path),
      this.dispatchWebhooks(ctx.page.siteId, 'page.published', {
        pageId: ctx.page.id,
        locale: ctx.locale.locale,
        path,
        versionId,
      }),
    ]);

    return { versionId, publishedAt };
  }

  async unpublish(pageLocaleId: string) {
    const ctx = await this.localeContext(pageLocaleId);
    const path = this.publicPath(ctx.page.path, ctx.locale.slugOverride);

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM page_locales WHERE id = ${pageLocaleId} FOR UPDATE`);
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

    await Promise.all([
      this.tagsFor(ctx.page.id, ctx.page.siteId, ctx.locale.locale, path).then((t) =>
        this.revalidate.invalidate(t),
      ),
      this.enqueueSeoPing(ctx.page.siteId, ctx.locale.locale, path),
      this.dispatchWebhooks(ctx.page.siteId, 'page.unpublished', {
        pageId: ctx.page.id,
        locale: ctx.locale.locale,
        path,
      }),
    ]);
    return { ok: true };
  }

  /** Fan out to subscribed webhook endpoints (delivered by the worker with retries). */
  private async dispatchWebhooks(siteId: string, event: string, payload: Record<string, unknown>) {
    if (!this.webhookQueue) return;
    const subscribers = await this.db.query.webhooks.findMany({
      where: and(eq(webhooks.siteId, siteId), eq(webhooks.active, true)),
    });
    await Promise.all(
      subscribers
        .filter((h) => h.events.includes(event))
        .map((hook) =>
          this.webhookQueue!.add(
            'deliver',
            { url: hook.url, secret: hook.secret, event, payload: { ...payload, siteId } },
            { attempts: 5, backoff: { type: 'exponential', delay: 3000 } },
          ),
        ),
    );
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
    // post listings (PostList component, RSS) re-render on any post change
    const page = await this.db.query.pages.findFirst({
      where: eq(pages.id, pageId),
      columns: { kind: true },
    });
    if (page?.kind === 'post') tags.add(`posts:${siteId}:${locale}`);
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
