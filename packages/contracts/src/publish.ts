import { z } from 'zod';

export const publishBody = z.object({
  versionId: z.uuid(),
});

export const publishResult = z.object({
  versionId: z.uuid(),
  publishedAt: z.coerce.date(),
});

export type PublishBody = z.infer<typeof publishBody>;
export type PublishResult = z.infer<typeof publishResult>;
