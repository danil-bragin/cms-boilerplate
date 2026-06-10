import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for webhook delivery: admin-supplied URLs must resolve to public
 * addresses. Blocks loopback, RFC1918, link-local (incl. cloud metadata
 * 169.254.169.254), CGNAT, and IPv6 equivalents. Redirects are blocked at the
 * fetch layer (redirect: 'error') so a public host can't bounce us inside.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`blocked scheme: ${url.protocol}`);
  }
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(`blocked: ${url.hostname} resolves to private address ${address}`);
    }
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('::ffff:')) {
      // v4-mapped address — judge the embedded IPv4
      return isPrivateAddress(lower.slice('::ffff:'.length));
    }
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    );
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // fail closed
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
