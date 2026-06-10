import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  bigint,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const versionStatus = pgEnum('version_status', ['draft', 'published', 'archived']);
export const mediaStatus = pgEnum('media_status', ['uploading', 'ready', 'failed']);
export const redirectStatus = pgEnum('redirect_status', ['301', '302']);
export const scheduleStatus = pgEnum('schedule_status', ['pending', 'done', 'cancelled', 'failed']);

export const memberRole = pgEnum('member_role', ['editor', 'viewer']);
export const pageKind = pgEnum('page_kind', ['page', 'post']);

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  domains: text('domains').array().notNull().default([]),
  defaultLocale: text('default_locale').notNull(),
  locales: text('locales').array().notNull(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  // keycloak subject
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    // normalized: leading '/', no trailing '/'
    path: text('path').notNull(),
    name: text('name').notNull(),
    /** 'post' gets Article JSON-LD, RSS inclusion, PostList listing */
    kind: pageKind('kind').notNull().default('page'),
    author: text('author'),
    /** datePublished for Article schema — set once on first publish */
    firstPublishedAt: timestamp('first_published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pages_site_path_uq').on(t.siteId, t.path), index('pages_kind_idx').on(t.siteId, t.kind)],
);

export const pageLocales = pgTable(
  'page_locales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    slugOverride: text('slug_override'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('page_locales_page_locale_uq').on(t.pageId, t.locale)],
);

export const pageVersions = pgTable(
  'page_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageLocaleId: uuid('page_locale_id')
      .notNull()
      .references(() => pageLocales.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    puckData: jsonb('puck_data').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    status: versionStatus('status').notNull().default('draft'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Bumped on every draft overwrite — the optimistic-concurrency token. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('page_versions_locale_no_uq').on(t.pageLocaleId, t.versionNo),
    index('page_versions_locale_idx').on(t.pageLocaleId),
  ],
);

export const publishedPages = pgTable(
  'published_pages',
  {
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    path: text('path').notNull(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => pageVersions.id),
    puckData: jsonb('puck_data').notNull(),
    seo: jsonb('seo').notNull().default({}),
    /** Flattened text content for full-text search; filled at publish. */
    searchText: text('search_text').notNull().default(''),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('published_pages_uq').on(t.siteId, t.locale, t.path),
    index('published_pages_page_idx').on(t.pageId),
    index('published_pages_search_idx').using(
      'gin',
      sql`to_tsvector('simple', ${t.searchText})`,
    ),
  ],
);

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  s3Key: text('s3_key').notNull().unique(),
  mime: text('mime').notNull().default(''),
  size: bigint('size', { mode: 'number' }).notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  blurhash: text('blurhash'),
  blurDataUrl: text('blur_data_url'),
  // {[locale]: string}
  alt: jsonb('alt').notNull().default({}),
  status: mediaStatus('status').notNull().default('uploading'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const redirects = pgTable(
  'redirects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    /** Incoming public path incl. locale prefix, e.g. /en/old-page */
    fromPath: text('from_path').notNull(),
    /** Target: absolute URL or site-relative path */
    toPath: text('to_path').notNull(),
    status: redirectStatus('status').notNull().default('301'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('redirects_site_from_uq').on(t.siteId, t.fromPath)],
);

export const menus = pgTable(
  'menus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    /** [{label, href, children?: [{label, href}]}] — per-locale labels live in items */
    items: jsonb('items').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('menus_site_slug_uq').on(t.siteId, t.slug)],
);

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  /** HMAC-SHA256 signing secret for the X-CMS-Signature header */
  secret: text('secret').notNull(),
  /** subscribed events: page.published | page.unpublished */
  events: text('events').array().notNull().default(['page.published']),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scheduledPublishes = pgTable(
  'scheduled_publishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageLocaleId: uuid('page_locale_id')
      .notNull()
      .references(() => pageLocales.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => pageVersions.id, { onDelete: 'cascade' }),
    /** Frozen content snapshot — what was approved at schedule time gets published,
     *  even if the draft is edited afterwards. */
    puckData: jsonb('puck_data').notNull().default({}),
    publishAt: timestamp('publish_at', { withTimezone: true }).notNull(),
    status: scheduleStatus('status').notNull().default('pending'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scheduled_publishes_locale_idx').on(t.pageLocaleId)],
);

export const siteMembers = pgTable(
  'site_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('editor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('site_members_uq').on(t.siteId, t.userId)],
);
