import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.REVALIDATE_SECRET = 'test-secret-test-secret-test-secret!';
});

describe('preview tokens', () => {
  it('round-trips a valid token', async () => {
    const { createPreviewToken, verifyPreviewToken } = await import('../preview-token');
    const token = createPreviewToken('version-123');
    expect(verifyPreviewToken('version-123', token)).toBe(true);
  });

  it('rejects a token for a different version', async () => {
    const { createPreviewToken, verifyPreviewToken } = await import('../preview-token');
    const token = createPreviewToken('version-123');
    expect(verifyPreviewToken('version-456', token)).toBe(false);
  });

  it('rejects expired tokens', async () => {
    const { createPreviewToken, verifyPreviewToken } = await import('../preview-token');
    const token = createPreviewToken('version-123', -1000);
    expect(verifyPreviewToken('version-123', token)).toBe(false);
  });

  it('rejects tampered signatures and garbage', async () => {
    const { createPreviewToken, verifyPreviewToken } = await import('../preview-token');
    const token = createPreviewToken('version-123');
    const [exp] = token.split('.');
    expect(verifyPreviewToken('version-123', `${exp}.${'0'.repeat(64)}`)).toBe(false);
    expect(verifyPreviewToken('version-123', 'garbage')).toBe(false);
    expect(verifyPreviewToken('version-123', '')).toBe(false);
  });
});
