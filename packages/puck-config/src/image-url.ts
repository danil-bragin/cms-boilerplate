import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Image URL resolution works in two modes:
 * - `imgproxy`: builds a signed imgproxy URL (use server-side where key/salt are secret)
 * - `proxy`:    builds an app-relative URL handled by an authenticated proxy route
 *               (use in the editor client so signing keys never reach the browser)
 */
export type ImageUrlConfig =
  | { mode: 'imgproxy'; baseUrl: string; bucket: string; key: string; salt: string }
  | { mode: 'proxy'; basePath: string };

let config: ImageUrlConfig | undefined;

export function configureImages(next: ImageUrlConfig): void {
  config = next;
}

export interface ImageUrlOptions {
  width?: number;
  height?: number;
  /** crop to exact width×height using focal-point gravity (0..1) */
  crop?: { focalX?: number; focalY?: number };
}

export function imageUrl(s3Key: string, opts: ImageUrlOptions = {}): string {
  if (!config) return '';
  const w = opts.width ?? 0;
  const h = opts.height ?? 0;

  if (config.mode === 'proxy') {
    const params = new URLSearchParams();
    if (w) params.set('w', String(w));
    if (h) params.set('h', String(h));
    if (opts.crop) {
      params.set('fx', String(opts.crop.focalX ?? 0.5));
      params.set('fy', String(opts.crop.focalY ?? 0.5));
    }
    const qs = params.toString();
    return `${config.basePath}/${s3Key}${qs ? `?${qs}` : ''}`;
  }

  // crop (rs:fill + focal gravity) when an explicit crop is requested, else fit
  const ops =
    opts.crop && w && h
      ? `/rs:fill:${w}:${h}/g:fp:${(opts.crop.focalX ?? 0.5).toFixed(2)}:${(opts.crop.focalY ?? 0.5).toFixed(2)}`
      : `/rs:fit:${w}:${h}`;
  const path = `${ops}/plain/s3://${config.bucket}/${s3Key}`;
  const signature = sign(path, config.key, config.salt);
  return `${config.baseUrl}/${signature}${path}`;
}

function sign(path: string, keyHex: string, saltHex: string): string {
  const key = hexToBytes(keyHex);
  const salt = hexToBytes(saltHex);
  const message = new Uint8Array([...salt, ...new TextEncoder().encode(path)]);
  const digest = hmac(sha256, key, message);
  return base64Url(digest);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Width breakpoints that include small mobile sizes (not just 640+). */
export const RESPONSIVE_WIDTHS = [360, 480, 768, 1024, 1280, 1920] as const;

/**
 * Build a `srcset` string for the given key, optionally cropping to a ratio.
 * Note: `crop` (focal-point gravity) only takes effect when `ratio` is also provided;
 * without `ratio`, imgproxy uses `rs:fit` and the focal point is ignored.
 */
export function buildSrcSet(
  s3Key: string,
  opts: { widths?: readonly number[]; ratio?: [number, number]; crop?: { focalX?: number; focalY?: number } } = {},
): string {
  const widths = opts.widths ?? RESPONSIVE_WIDTHS;
  const heightFor = (w: number) => (opts.ratio ? Math.round((w * opts.ratio[1]) / opts.ratio[0]) : undefined);
  return widths
    .map((w) => `${imageUrl(s3Key, { width: w, height: heightFor(w), crop: opts.crop })} ${w}w`)
    .join(', ');
}

/** `sizes` for a full-bleed hero/product image: ~92vw on phones, capped on desktop. */
export const SIZES_HERO = '(max-width: 768px) 92vw, (max-width: 1100px) 90vw, 1040px';
/** `sizes` for a 3-up card grid: full width on phones, ~360px in the grid. */
export const SIZES_CARD = '(max-width: 768px) 92vw, 360px';
/** `sizes` for an in-content image block: full width on phones, content-width on desktop. */
export const SIZES_CONTENT = '(max-width: 768px) 92vw, 1024px';
