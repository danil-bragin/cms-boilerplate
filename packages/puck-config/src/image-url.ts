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
}

export function imageUrl(s3Key: string, opts: ImageUrlOptions = {}): string {
  if (!config) return '';
  const w = opts.width ?? 0;
  const h = opts.height ?? 0;

  if (config.mode === 'proxy') {
    const params = new URLSearchParams();
    if (w) params.set('w', String(w));
    if (h) params.set('h', String(h));
    const qs = params.toString();
    return `${config.basePath}/${s3Key}${qs ? `?${qs}` : ''}`;
  }

  const path = `/rs:fit:${w}:${h}/plain/s3://${config.bucket}/${s3Key}`;
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
