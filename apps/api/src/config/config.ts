import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_API_AUDIENCE: z.string().min(1),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  WEB_INTERNAL_URL: z.url(),
  REVALIDATE_SECRET: z.string().min(32),
  API_PORT: z.coerce.number().int().default(3001),
});

export type AppConfig = z.infer<typeof envSchema>;

// Known dev placeholders that must never reach production.
const PLACEHOLDER_SECRETS = new Set([
  '1111111111111111111111111111111111111111111111111111111111111111',
  '0000000000000000000000000000000000000000000000000000000000000000',
]);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  if (env.NODE_ENV === 'production' && PLACEHOLDER_SECRETS.has(parsed.data.REVALIDATE_SECRET)) {
    throw new Error('REVALIDATE_SECRET is a known placeholder — set a real secret in production');
  }
  return parsed.data;
}

export const CONFIG = Symbol('CONFIG');
