import { z } from 'zod';
import { puckDataSchema } from './puck-data.js';

/** Normalized page path: '/', or '/seg(/seg)*' with lowercase url-safe segments. */
export const pathSchema = z
  .string()
  .regex(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/, 'path must be "/" or "/lowercase/segments"');

export const localeSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'locale must look like "en" or "en-US"');

export const createPageBody = z.object({
  path: pathSchema,
  name: z.string().min(1).max(200),
});

export const addLocaleBody = z.object({
  locale: localeSchema,
});

export const saveDraftBody = z.object({
  puckData: puckDataSchema,
  /** Optimistic concurrency: latest versionNo the client based its edit on. */
  baseVersionNo: z.number().int().positive().optional(),
});

export const localeSummary = z.object({
  pageLocaleId: z.uuid(),
  locale: localeSchema,
  latestVersionNo: z.number().int(),
  latestStatus: z.enum(['draft', 'published', 'archived']),
  publishedVersionId: z.uuid().nullable(),
});

export const pageSummary = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  path: pathSchema,
  name: z.string(),
  locales: z.array(localeSummary),
});

export const siteDto = z.object({
  id: z.uuid(),
  slug: z.string(),
  domains: z.array(z.string()),
  defaultLocale: localeSchema,
  locales: z.array(localeSchema),
});

export const versionListItem = z.object({
  id: z.uuid(),
  versionNo: z.number().int(),
  status: z.enum(['draft', 'published', 'archived']),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
});

export const versionDto = versionListItem.extend({
  pageLocaleId: z.uuid(),
  puckData: puckDataSchema,
  schemaVersion: z.number().int(),
});

export type CreatePageBody = z.infer<typeof createPageBody>;
export type AddLocaleBody = z.infer<typeof addLocaleBody>;
export type SaveDraftBody = z.infer<typeof saveDraftBody>;
export type PageSummary = z.infer<typeof pageSummary>;
export type LocaleSummary = z.infer<typeof localeSummary>;
export type SiteDto = z.infer<typeof siteDto>;
export type VersionDto = z.infer<typeof versionDto>;
export type VersionListItem = z.infer<typeof versionListItem>;
