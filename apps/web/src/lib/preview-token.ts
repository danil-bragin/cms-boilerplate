import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Shareable preview links: HMAC(versionId.exp) — no DB, no session needed by
 * the recipient. Default validity 7 days; revocation = republish (new version).
 */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.REVALIDATE_SECRET;
  if (!value) throw new Error('REVALIDATE_SECRET is not set');
  return value;
}

export function createPreviewToken(versionId: string, ttlMs = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const sig = createHmac('sha256', secret()).update(`${versionId}.${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export function verifyPreviewToken(versionId: string, token: string): boolean {
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = createHmac('sha256', secret()).update(`${versionId}.${exp}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
