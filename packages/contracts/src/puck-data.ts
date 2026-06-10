import { z } from 'zod';

/**
 * Puck `Data` payload (@puckeditor/core 0.21 shape).
 * Loose on purpose: component props are arbitrary; nested slot content lives
 * inside props. `zones` is the legacy DropZone storage, optional.
 */
export const puckComponentSchema = z.looseObject({
  type: z.string().min(1),
  props: z.looseObject({ id: z.string().min(1) }),
});

export const puckDataSchema = z.looseObject({
  root: z.looseObject({}),
  content: z.array(puckComponentSchema),
  zones: z.record(z.string(), z.array(z.looseObject({}))).optional(),
});

export type PuckData = z.infer<typeof puckDataSchema>;
export type PuckComponent = z.infer<typeof puckComponentSchema>;
