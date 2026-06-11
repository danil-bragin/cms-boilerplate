import { z } from 'zod';

export const IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const presignBody = z.object({
  filename: z.string().min(1).max(255),
  mime: z.enum(IMAGE_MIMES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const presignResult = z.object({
  mediaId: z.uuid(),
  uploadUrl: z.url(),
  s3Key: z.string(),
});

export const confirmBody = z.object({
  mediaId: z.uuid(),
});

export const mediaDto = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  s3Key: z.string(),
  mime: z.string(),
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  blurhash: z.string().nullable(),
  blurDataUrl: z.string().nullable(),
  focalX: z.number().default(50),
  focalY: z.number().default(50),
  alt: z.record(z.string(), z.string()),
  status: z.enum(['uploading', 'ready', 'failed']),
  createdAt: z.coerce.date(),
});

export const mediaListQuery = z.object({
  status: z.enum(['uploading', 'ready', 'failed']).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type PresignBody = z.infer<typeof presignBody>;
export type PresignResult = z.infer<typeof presignResult>;
export type ConfirmBody = z.infer<typeof confirmBody>;
export type MediaDto = z.infer<typeof mediaDto>;
export type MediaListQuery = z.infer<typeof mediaListQuery>;
