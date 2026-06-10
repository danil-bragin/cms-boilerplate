import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { menus, pageLocales, redirects, sites, webhooks } from '@cms/db';
import type {
  CreateRedirectBody,
  CreateSiteBody,
  CreateWebhookBody,
  UpdateSiteBody,
  UpsertMenuBody,
} from '@cms/contracts';
import { DB, type Db } from '../db/db.module.js';
import { REVALIDATE_CLIENT, type RevalidateClient } from '../publish/revalidate.client.js';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REVALIDATE_CLIENT) private readonly revalidate: RevalidateClient,
  ) {}

  // --- sites ---

  async createSite(body: CreateSiteBody) {
    if (!body.locales.includes(body.defaultLocale)) {
      throw new BadRequestException({
        code: 'default_locale_missing',
        message: 'defaultLocale must be in locales',
      });
    }
    const existing = await this.db.query.sites.findFirst({ where: eq(sites.slug, body.slug) });
    if (existing) throw new ConflictException({ code: 'site_exists', message: 'Slug taken' });

    const [site] = await this.db
      .insert(sites)
      .values({
        slug: body.slug,
        domains: body.domains,
        defaultLocale: body.defaultLocale,
        locales: body.locales,
        settings: { indexNowKey: randomBytes(16).toString('hex') },
      })
      .returning();
    await this.revalidate.invalidate(['sites']);
    return site!;
  }

  async updateSite(siteId: string, body: UpdateSiteBody) {
    const site = await this.mustGetSite(siteId);
    const locales = body.locales ?? site.locales;
    const defaultLocale = body.defaultLocale ?? site.defaultLocale;
    if (!locales.includes(defaultLocale)) {
      throw new BadRequestException({
        code: 'default_locale_missing',
        message: 'defaultLocale must be in locales',
      });
    }
    const settings = site.settings as Record<string, unknown>;
    const [updated] = await this.db
      .update(sites)
      .set({
        domains: body.domains ?? site.domains,
        defaultLocale,
        locales,
        settings: body.seo ? { ...settings, seo: body.seo } : settings,
      })
      .where(eq(sites.id, siteId))
      .returning();
    await this.revalidate.invalidate(['sites']);
    return updated!;
  }

  async updatePageLocale(pageLocaleId: string, slugOverride: string | null) {
    const locale = await this.db.query.pageLocales.findFirst({
      where: eq(pageLocales.id, pageLocaleId),
    });
    if (!locale) throw new NotFoundException({ code: 'page_locale_not_found', message: 'Not found' });
    const [updated] = await this.db
      .update(pageLocales)
      .set({ slugOverride })
      .where(eq(pageLocales.id, pageLocaleId))
      .returning();
    // takes effect on next publish (published path computed at publish time)
    return updated!;
  }

  // --- redirects ---

  async listRedirects(siteId: string) {
    return this.db.query.redirects.findMany({ where: eq(redirects.siteId, siteId) });
  }

  async createRedirect(siteId: string, body: CreateRedirectBody, createdBy: string) {
    await this.mustGetSite(siteId);
    if (body.fromPath === body.toPath) {
      throw new BadRequestException({ code: 'redirect_loop', message: 'fromPath equals toPath' });
    }
    // one-level chain/loop detection: target must not itself be redirected
    const chained = await this.db.query.redirects.findFirst({
      where: and(eq(redirects.siteId, siteId), eq(redirects.fromPath, body.toPath)),
    });
    if (chained) {
      throw new BadRequestException({
        code: 'redirect_chain',
        message: `toPath is itself redirected to ${chained.toPath} — point directly there`,
      });
    }
    const existing = await this.db.query.redirects.findFirst({
      where: and(eq(redirects.siteId, siteId), eq(redirects.fromPath, body.fromPath)),
    });
    if (existing) {
      throw new ConflictException({ code: 'redirect_exists', message: 'fromPath already redirected' });
    }
    const [row] = await this.db
      .insert(redirects)
      .values({ siteId, ...body, createdBy })
      .returning();
    return row!;
  }

  async deleteRedirect(id: string) {
    await this.db.delete(redirects).where(eq(redirects.id, id));
    return { ok: true };
  }

  // --- menus ---

  async listMenus(siteId: string) {
    return this.db.query.menus.findMany({ where: eq(menus.siteId, siteId) });
  }

  async upsertMenu(siteId: string, body: UpsertMenuBody) {
    await this.mustGetSite(siteId);
    const [row] = await this.db
      .insert(menus)
      .values({ siteId, slug: body.slug, items: body.items, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [menus.siteId, menus.slug],
        set: { items: body.items, updatedAt: new Date() },
      })
      .returning();
    await this.revalidate.invalidate([`menu:${siteId}:${body.slug}`]);
    return row!;
  }

  async deleteMenu(id: string) {
    const menu = await this.db.query.menus.findFirst({ where: eq(menus.id, id) });
    if (menu) {
      await this.db.delete(menus).where(eq(menus.id, id));
      await this.revalidate.invalidate([`menu:${menu.siteId}:${menu.slug}`]);
    }
    return { ok: true };
  }

  // --- webhooks ---

  async listWebhooks(siteId: string) {
    const rows = await this.db.query.webhooks.findMany({ where: eq(webhooks.siteId, siteId) });
    // secrets are write-only after creation
    return rows.map(({ secret: _secret, ...rest }) => rest);
  }

  async createWebhook(siteId: string, body: CreateWebhookBody) {
    await this.mustGetSite(siteId);
    const secret = randomBytes(24).toString('hex');
    const [row] = await this.db
      .insert(webhooks)
      .values({ siteId, url: body.url, events: [...body.events], secret })
      .returning();
    return { ...row!, secret };
  }

  async deleteWebhook(id: string) {
    await this.db.delete(webhooks).where(eq(webhooks.id, id));
    return { ok: true };
  }

  private async mustGetSite(siteId: string) {
    const site = await this.db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) throw new NotFoundException({ code: 'site_not_found', message: 'Site not found' });
    return site;
  }
}
