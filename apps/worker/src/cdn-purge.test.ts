import { describe, expect, it } from 'vitest';
import { cloudflarePurgeRequest, cloudfrontInvalidationInput, resolvePurgeTargets } from './cdn-purge.js';

const SITE = '11111111-2222-3333-4444-555555555555';

describe('resolvePurgeTargets', () => {
  it('maps page tags to public urls via the site primary domain', async () => {
    const fakeDb = {
      query: {
        sites: {
          findFirst: async () => ({ domains: ['example.com', 'alias.com'] }),
        },
      },
    } as never;
    const result = await resolvePurgeTargets(fakeDb, [
      `page:${SITE}:en:/about`,
      `page:${SITE}:de:/`,
      `alts:ignored`,
      `posts:${SITE}:en`,
    ]);
    expect(result.urls).toEqual(['https://example.com/en/about', 'https://example.com/de']);
    expect(result.paths).toEqual(['/en/about', '/de']);
  });
});

describe('provider payloads', () => {
  it('cloudflare purge body lists files', () => {
    const { url, init } = cloudflarePurgeRequest('zone1', 'tok', ['https://a/x']);
    expect(url).toContain('/zones/zone1/purge_cache');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ files: ['https://a/x'] });
  });

  it('cloudfront invalidation shape', () => {
    const input = cloudfrontInvalidationInput('DIST', ['/en/about']);
    expect(input.DistributionId).toBe('DIST');
    expect(input.InvalidationBatch.Paths).toEqual({ Quantity: 1, Items: ['/en/about'] });
    expect(input.InvalidationBatch.CallerReference).toMatch(/^cms-/);
  });
});
