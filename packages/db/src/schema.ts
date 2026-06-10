import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  bigint,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const versionStatus = pgEnum('version_status', ['draft', 'published', 'archived']);
export const mediaStatus = pgEnum('media_status', ['uploading', 'ready', 'failed']);

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pages_site_path_uq').on(t.siteId, t.path)],
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
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('published_pages_uq').on(t.siteId, t.locale, t.path),
    index('published_pages_page_idx').on(t.pageId),
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
