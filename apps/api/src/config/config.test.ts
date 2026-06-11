import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://x',
  KEYCLOAK_ISSUER: 'https://kc/realms/cms',
  KEYCLOAK_API_AUDIENCE: 'cms-api',
  S3_BUCKET: 'b',
  WEB_INTERNAL_URL: 'http://web',
  REVALIDATE_SECRET: 'a'.repeat(40),
};

describe('loadConfig', () => {
  it('accepts a valid environment', () => {
    expect(loadConfig({ ...base } as never).S3_BUCKET).toBe('b');
  });

  it('rejects the placeholder REVALIDATE_SECRET in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', REVALIDATE_SECRET: '1'.repeat(64) } as never),
    ).toThrow(/placeholder/);
  });

  it('allows the placeholder outside production', () => {
    expect(() =>
      loadConfig({ ...base, REVALIDATE_SECRET: '1'.repeat(64) } as never),
    ).not.toThrow();
  });

  it('fails fast on a missing required var', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => loadConfig(rest as never)).toThrow(/Invalid environment/);
  });
});
