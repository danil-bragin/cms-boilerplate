import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import type { Db } from './client.js';
import { media } from './schema.js';

/**
 * Generates a set of modern, production-looking images (SVG → WebP via sharp),
 * uploads them to S3/MinIO, and inserts media rows. Returns a map of
 * name → MediaRef so the page seed can drop them into Puck Image blocks.
 *
 * Images are generated (no external downloads) so the boilerplate is
 * self-contained and reproducible.
 */

export interface SeededMedia {
  mediaId: string;
  s3Key: string;
  width: number;
  height: number;
  blurDataUrl: string;
  /** Small inlined data-URI of the image, for the above-the-fold LCP element:
   *  it arrives with the document so there is no separate (render-gating) request. */
  lcpInline: string;
  alt: string;
}

const BUCKET = process.env.S3_BUCKET ?? 'cms-media';

function s3() {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    forcePathStyle: true,
    // fail fast when S3 is unreachable instead of the default retry backoff
    maxAttempts: 1,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    },
  });
}

// --- SVG generators ---

const meshBg = (w: number, h: number, stops: string[][]) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g1" cx="20%" cy="15%" r="80%">
      <stop offset="0%" stop-color="${stops[0]![0]}"/><stop offset="100%" stop-color="${stops[0]![1]}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="85%" cy="20%" r="70%">
      <stop offset="0%" stop-color="${stops[1]![0]}"/><stop offset="100%" stop-color="${stops[1]![1]}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g3" cx="60%" cy="95%" r="75%">
      <stop offset="0%" stop-color="${stops[2]![0]}"/><stop offset="100%" stop-color="${stops[2]![1]}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${stops[3]![0]}"/>
  <rect width="${w}" height="${h}" fill="url(#g1)"/>
  <rect width="${w}" height="${h}" fill="url(#g2)"/>
  <rect width="${w}" height="${h}" fill="url(#g3)"/>
</svg>`;

// fake product/dashboard mockup on a soft gradient — reads as a real screenshot
const dashboard = (w: number, h: number) => {
  const pad = 48;
  const card = (x: number, y: number, cw: number, ch: number, fill = '#ffffff') =>
    `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="14" fill="${fill}" filter="url(#sh)"/>`;
  const bar = (x: number, y: number, bw: number, by: number, c: string) =>
    `<rect x="${x}" y="${y - by}" width="${bw}" height="${by}" rx="3" fill="${c}"/>`;
  const cols = [60, 110, 80, 140, 100, 160, 130, 180];
  const bars = cols
    .map((v, i) => bar(pad + 380 + i * 36, h - pad - 60, 22, v, i % 2 ? '#6366f1' : '#a5b4fc'))
    .join('');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2ff"/><stop offset="100%" stop-color="#e0e7ff"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#1e1b4b" flood-opacity="0.10"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <!-- app window -->
  ${card(pad, pad, w - pad * 2, h - pad * 2, '#fbfbfd')}
  <!-- sidebar -->
  <rect x="${pad}" y="${pad}" width="240" height="${h - pad * 2}" rx="14" fill="#1e1b4b"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${pad + 24}" y="${pad + 70 + i * 40}" width="${i === 1 ? 150 : 120}" height="12" rx="6" fill="${i === 1 ? '#818cf8' : '#3730a3'}"/>`).join('')}
  <circle cx="${pad + 40}" cy="${pad + 36}" r="14" fill="#6366f1"/>
  <!-- top stats cards -->
  ${[0, 1, 2].map((i) => card(pad + 280 + i * 250, pad + 40, 220, 120)).join('')}
  ${[0, 1, 2].map((i) => `<rect x="${pad + 304 + i * 250}" y="${pad + 64}" width="80" height="14" rx="7" fill="#c7d2fe"/><text x="${pad + 304 + i * 250}" y="${pad + 130}" font-family="system-ui" font-size="40" font-weight="700" fill="#1e1b4b">${['98%', '290', '16ms'][i]}</text>`).join('')}
  <!-- chart card -->
  ${card(pad + 280, pad + 190, w - pad * 2 - 320, h - pad * 2 - 230)}
  ${bars}
  <rect x="${pad + 304}" y="${pad + 216}" width="160" height="16" rx="8" fill="#1e1b4b"/>
</svg>`;
};

const avatar = (initials: string, c1: string, c2: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
  <rect width="240" height="240" fill="url(#a)"/>
  <text x="120" y="120" dy="0.35em" text-anchor="middle" font-family="system-ui" font-size="96" font-weight="700" fill="#ffffff">${initials}</text>
</svg>`;

async function makeWebp(svg: string): Promise<{ buf: Buffer; width: number; height: number; blur: string; lcpInline: string }> {
  const img = sharp(Buffer.from(svg));
  const meta = await img.metadata();
  const buf = await img.webp({ quality: 82 }).toBuffer();
  // tiny LQIP for the blur background
  const blurBuf = await sharp(Buffer.from(svg)).resize(20).webp({ quality: 40 }).toBuffer();
  const blur = `data:image/webp;base64,${blurBuf.toString('base64')}`;
  // small inline variant for the LCP hero: ~640px wide, AVIF (≈5KB) so the doc
  // stays light; fall back to WebP if the AVIF encoder is unavailable.
  let lcpInline: string;
  try {
    const avif = await sharp(Buffer.from(svg)).resize(640).avif({ quality: 45 }).toBuffer();
    lcpInline = `data:image/avif;base64,${avif.toString('base64')}`;
  } catch {
    const webp = await sharp(Buffer.from(svg)).resize(640).webp({ quality: 60 }).toBuffer();
    lcpInline = `data:image/webp;base64,${webp.toString('base64')}`;
  }
  return { buf, width: meta.width ?? 0, height: meta.height ?? 0, blur, lcpInline };
}

export type DemoMediaKey = 'heroBg' | 'product' | 'feature1' | 'feature2' | 'feature3' | 'avatarJane';
// values are optional so the demo can seed without a media backend (e.g. CI):
// pages built from a media-less map simply omit their images.
export type DemoMedia = Record<DemoMediaKey, SeededMedia | undefined>;

const EMPTY_MEDIA: DemoMedia = {
  heroBg: undefined,
  product: undefined,
  feature1: undefined,
  feature2: undefined,
  feature3: undefined,
  avatarJane: undefined,
};

export async function seedMedia(db: Db, siteId: string): Promise<DemoMedia> {
  // Skip media entirely when there is no object store to upload to (CI lighthouse).
  if (process.env.SEED_SKIP_MEDIA === '1') {
    console.log('seed-media: SEED_SKIP_MEDIA=1 — skipping image generation/upload');
    return EMPTY_MEDIA;
  }
  const specs: Record<string, { svg: string; alt: string }> = {
    heroBg: {
      svg: meshBg(1920, 1080, [
        ['#6366f1', '#6366f1'],
        ['#0ea5e9', '#0ea5e9'],
        ['#8b5cf6', '#8b5cf6'],
        ['#0b1020', '#0b1020'],
      ]),
      alt: 'Abstract gradient background',
    },
    product: { svg: dashboard(1280, 900), alt: 'Product dashboard preview' },
    feature1: {
      svg: meshBg(800, 600, [['#34d399', '#34d399'], ['#10b981', '#10b981'], ['#6ee7b7', '#6ee7b7'], ['#062a22']]),
      alt: 'Editor feature',
    },
    feature2: {
      svg: meshBg(800, 600, [['#f59e0b', '#f59e0b'], ['#ef4444', '#ef4444'], ['#fbbf24', '#fbbf24'], ['#2a1206']]),
      alt: 'Performance feature',
    },
    feature3: {
      svg: meshBg(800, 600, [['#6366f1', '#6366f1'], ['#a855f7', '#a855f7'], ['#818cf8', '#818cf8'], ['#0b1020']]),
      alt: 'SEO feature',
    },
    avatarJane: { svg: avatar('JD', '#6366f1', '#0ea5e9'), alt: 'Jane Doe' },
  };

  const client = s3();
  const out: Record<string, SeededMedia> = {};

  for (const [name, spec] of Object.entries(specs)) {
    const { buf, width, height, blur, lcpInline } = await makeWebp(spec.svg);
    // deterministic key so re-seeding replaces instead of duplicating
    const s3Key = `sites/${siteId}/media/seed/${name}.webp`;

    // Upload is best-effort: keep seeding (insert the media row so page refs
    // stay valid) even when S3/MinIO is unreachable — e.g. CI jobs without a
    // MinIO service. The object is just missing; rows + blur placeholders remain.
    try {
      await client.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: buf, ContentType: 'image/webp' }),
      );
    } catch (err) {
      console.warn(`seed-media: S3 upload skipped for ${name} (${(err as Error).message})`);
    }

    const existing = await db.query.media.findFirst({ where: eq(media.s3Key, s3Key) });
    const mediaId = existing?.id ?? randomUUID();
    if (existing) {
      await db
        .update(media)
        .set({ size: buf.length, width, height, blurDataUrl: blur, alt: { en: spec.alt }, status: 'ready' })
        .where(eq(media.id, mediaId));
    } else {
      await db.insert(media).values({
        id: mediaId,
        siteId,
        s3Key,
        mime: 'image/webp',
        size: buf.length,
        width,
        height,
        blurDataUrl: blur,
        alt: { en: spec.alt },
        status: 'ready',
        createdBy: 'system',
      });
    }
    out[name] = { mediaId, s3Key, width, height, blurDataUrl: blur, lcpInline, alt: spec.alt };
  }

  return out as DemoMedia;
}
