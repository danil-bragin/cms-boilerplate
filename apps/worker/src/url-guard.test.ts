import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPrivateAddress } from './url-guard.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fc00::1', 'fe80::1',
    '::ffff:10.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::6810:84e5'])('allows %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('fails closed on garbage', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('assertPublicUrl', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow('blocked scheme');
  });

  it('rejects loopback literals', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:8080/hook')).rejects.toThrow('private address');
  });

  it('rejects hostnames resolving to loopback', async () => {
    await expect(assertPublicUrl('http://localhost/hook')).rejects.toThrow('private address');
  });
});
