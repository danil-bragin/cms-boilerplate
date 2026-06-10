import sharp from 'sharp';
import { encode } from 'blurhash';

export interface ProcessedImage {
  width: number;
  height: number;
  mime: string;
  blurhash: string;
  blurDataUrl: string;
  /** Re-encoded bytes with metadata (EXIF/GPS/XMP) stripped. */
  cleaned: Buffer;
}

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export async function processImage(input: Buffer, declaredMime?: string): Promise<ProcessedImage> {
  const meta = await sharp(input).metadata();
  const format = meta.format ?? 'unknown';
  const mime = MIME_BY_FORMAT[format] ?? declaredMime ?? 'application/octet-stream';

  if (format === 'svg') {
    // vector: keep bytes as-is, rasterize only for the placeholder
    const { blurhash, blurDataUrl } = await placeholders(sharp(input).png());
    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      mime: 'image/svg+xml',
      blurhash,
      blurDataUrl,
      cleaned: input,
    };
  }

  // .rotate() bakes EXIF orientation in before metadata is dropped;
  // re-encode without withMetadata() → EXIF/GPS/XMP gone
  const pipeline = sharp(input).rotate();
  const cleaned = await pipeline.toBuffer();
  const { blurhash, blurDataUrl } = await placeholders(sharp(cleaned));

  const cleanedMeta = await sharp(cleaned).metadata();
  return {
    width: cleanedMeta.width ?? 0,
    height: cleanedMeta.height ?? 0,
    mime,
    blurhash,
    blurDataUrl,
    cleaned,
  };
}

async function placeholders(pipeline: sharp.Sharp): Promise<{ blurhash: string; blurDataUrl: string }> {
  const { data, info } = await pipeline
    .clone()
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);

  const tiny = await pipeline.clone().resize(16, 16, { fit: 'inside' }).png().toBuffer();
  return { blurhash, blurDataUrl: `data:image/png;base64,${tiny.toString('base64')}` };
}
