import { describe, expect, it } from 'vitest';
import { buildInspectionRequest, GSC_INSPECT_ENDPOINT } from './gsc.service.js';

describe('buildInspectionRequest', () => {
  it('builds the inspection url with locale prefix and trims home', () => {
    const r = buildInspectionRequest('https://example.com', 'en', '/about', undefined);
    expect(r.inspectionUrl).toBe('https://example.com/en/about');
    expect(r.siteUrl).toBe('https://example.com/');
    expect(r.languageCode).toBe('en');
  });

  it('home path yields the locale root, no trailing slash', () => {
    const r = buildInspectionRequest('https://example.com', 'de', '/', undefined);
    expect(r.inspectionUrl).toBe('https://example.com/de');
  });

  it('honors an explicit GSC property url', () => {
    const r = buildInspectionRequest('https://example.com', 'en', '/x', 'sc-domain:example.com');
    expect(r.siteUrl).toBe('sc-domain:example.com');
  });

  it('endpoint is the hardcoded Google host (no SSRF surface)', () => {
    expect(GSC_INSPECT_ENDPOINT).toMatch(/^https:\/\/searchconsole\.googleapis\.com\//);
  });
});
