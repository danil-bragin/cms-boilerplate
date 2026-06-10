import { z } from 'zod';
import { localeSchema, pathSchema } from './pages.js';

// --- sites ---

const domainSchema = z
  .string()
  .regex(/^[a-z0-9.-]+$/, 'bare hostname, e.g. example.com')
  .max(253);

export const createSiteBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(50),
  domains: z.array(domainSchema).min(1),
  defaultLocale: localeSchema,
  locales: z.array(localeSchema).min(1),
});

export const updateSiteBody = z.object({
  domains: z.array(domainSchema).min(1).optional(),
  defaultLocale: localeSchema.optional(),
  locales: z.array(localeSchema).min(1).optional(),
  seo: z.object({ blockAiTraining: z.boolean() }).optional(),
});

export const updatePageLocaleBody = z.object({
  slugOverride: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100)
    .nullable(),
});

// --- redirects ---

export const createRedirectBody = z.object({
  fromPath: z.string().regex(/^\/[a-zA-Z0-9\-._~!$&'()*+,;=:@%/]*$/).max(500),
  toPath: z.string().max(1000),
  status: z.enum(['301', '302']).default('301'),
});

export const redirectDto = createRedirectBody.extend({
  id: z.uuid(),
  siteId: z.uuid(),
  createdAt: z.coerce.date(),
});

// --- menus ---

export const menuItemSchema = z.object({
  label: z.record(z.string(), z.string()), // {[locale]: label}
  href: z.string().max(1000),
  children: z
    .array(z.object({ label: z.record(z.string(), z.string()), href: z.string().max(1000) }))
    .default([]),
});

export const upsertMenuBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(50),
  items: z.array(menuItemSchema).max(100),
});

// --- webhooks ---

export const WEBHOOK_EVENTS = ['page.published', 'page.unpublished'] as const;

export const createWebhookBody = z.object({
  url: z.url().max(1000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).default(['page.published']),
});

export const webhookDto = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  url: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
  /** returned once at creation so the receiver can be configured */
  secret: z.string().optional(),
});

// --- scheduled publishing ---

export const scheduleBody = z.object({
  versionId: z.uuid(),
  publishAt: z.coerce.date(),
});

export const scheduleDto = z.object({
  id: z.uuid(),
  pageLocaleId: z.uuid(),
  versionId: z.uuid(),
  publishAt: z.coerce.date(),
  status: z.enum(['pending', 'done', 'cancelled', 'failed']),
});

// --- media ---

export const updateMediaBody = z.object({
  alt: z.record(localeSchema, z.string().max(300)),
});

export type CreateSiteBody = z.infer<typeof createSiteBody>;
export type UpdateSiteBody = z.infer<typeof updateSiteBody>;
export type CreateRedirectBody = z.infer<typeof createRedirectBody>;
export type RedirectDto = z.infer<typeof redirectDto>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type UpsertMenuBody = z.infer<typeof upsertMenuBody>;
export type CreateWebhookBody = z.infer<typeof createWebhookBody>;
export type WebhookDto = z.infer<typeof webhookDto>;
export type ScheduleBody = z.infer<typeof scheduleBody>;
export type ScheduleDto = z.infer<typeof scheduleDto>;
export type UpdateMediaBody = z.infer<typeof updateMediaBody>;

export { pathSchema };
