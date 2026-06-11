import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { authors, media, menus, pageLocales, pages, pageVersions, redirects, scheduledPublishes, siteMembers, webhooks } from '@cms/db';
import type { AuthContext } from '@cms/auth';
import { DB, type Db } from '../db/db.module.js';

/**
 * Per-site authorization. Realm roles stay the capability layer
 * (cms-admin / cms-editor / cms-viewer); membership scopes WHICH sites those
 * capabilities apply to:
 *
 * - cms-admin: every site, always.
 * - site with NO members configured: open to any cms-editor/viewer
 *   (bootstrap/demo mode — single-tenant installs never have to configure this).
 * - site WITH members: only members may touch it; member role 'viewer'
 *   additionally blocks writes.
 */
@Injectable()
export class SiteAccessService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async assertSiteAccess(user: AuthContext, siteId: string, write = true): Promise<void> {
    if (user.roles.includes('cms-admin')) return;

    const members = await this.db.query.siteMembers.findMany({
      where: eq(siteMembers.siteId, siteId),
      columns: { userId: true, role: true },
    });
    if (members.length === 0) return; // open until configured

    const membership = members.find((m) => m.userId === user.sub);
    if (!membership) {
      throw new ForbiddenException({ code: 'not_a_member', message: 'No access to this site' });
    }
    if (write && membership.role === 'viewer') {
      throw new ForbiddenException({ code: 'read_only_member', message: 'Viewer membership is read-only' });
    }
  }

  // --- siteId resolution for id-addressed resources ---

  async siteForPage(pageId: string): Promise<string> {
    const row = await this.db.query.pages.findFirst({
      where: eq(pages.id, pageId),
      columns: { siteId: true },
    });
    if (!row) throw new NotFoundException({ code: 'page_not_found', message: 'Page not found' });
    return row.siteId;
  }

  async siteForPageLocale(pageLocaleId: string): Promise<string> {
    const locale = await this.db.query.pageLocales.findFirst({
      where: eq(pageLocales.id, pageLocaleId),
      columns: { pageId: true },
    });
    if (!locale) {
      throw new NotFoundException({ code: 'page_locale_not_found', message: 'Page locale not found' });
    }
    return this.siteForPage(locale.pageId);
  }

  async siteForVersion(versionId: string): Promise<string> {
    const version = await this.db.query.pageVersions.findFirst({
      where: eq(pageVersions.id, versionId),
      columns: { pageLocaleId: true },
    });
    if (!version) {
      throw new NotFoundException({ code: 'version_not_found', message: 'Version not found' });
    }
    return this.siteForPageLocale(version.pageLocaleId);
  }

  async siteForMedia(mediaId: string): Promise<string> {
    const row = await this.db.query.media.findFirst({
      where: eq(media.id, mediaId),
      columns: { siteId: true },
    });
    if (!row) throw new NotFoundException({ code: 'media_not_found', message: 'Media not found' });
    return row.siteId;
  }

  async siteForMenu(menuId: string): Promise<string> {
    const row = await this.db.query.menus.findFirst({
      where: eq(menus.id, menuId),
      columns: { siteId: true },
    });
    if (!row) throw new NotFoundException({ code: 'menu_not_found', message: 'Menu not found' });
    return row.siteId;
  }

  async siteForRedirect(redirectId: string): Promise<string> {
    const row = await this.db.query.redirects.findFirst({
      where: eq(redirects.id, redirectId),
      columns: { siteId: true },
    });
    if (!row) throw new NotFoundException({ code: 'redirect_not_found', message: 'Redirect not found' });
    return row.siteId;
  }

  async siteForSchedule(scheduleId: string): Promise<string> {
    const row = await this.db.query.scheduledPublishes.findFirst({
      where: eq(scheduledPublishes.id, scheduleId),
      columns: { pageLocaleId: true },
    });
    if (!row) throw new NotFoundException({ code: 'schedule_not_found', message: 'Not found' });
    return this.siteForPageLocale(row.pageLocaleId);
  }

  async siteForAuthor(authorId: string): Promise<string> {
    const row = await this.db.query.authors.findFirst({
      where: eq(authors.id, authorId),
      columns: { siteId: true },
    });
    if (!row) throw new NotFoundException({ code: 'author_not_found', message: 'Author not found' });
    return row.siteId;
  }

  async siteForWebhook(webhookId: string): Promise<string> {
    const row = await this.db.query.webhooks.findFirst({
      where: eq(webhooks.id, webhookId),
      columns: { siteId: true },
    });
    if (!row) throw new NotFoundException({ code: 'webhook_not_found', message: 'Webhook not found' });
    return row.siteId;
  }
}
