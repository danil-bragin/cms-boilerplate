import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processImage } from './image.js';

async function fixtureJpegWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 32, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret-holder', Artist: 'gps-leak' } })
    .toBuffer();
}

describe('processImage', () => {
  it('extracts dimensions and mime', async () => {
    const result = await processImage(await fixtureJpegWithExif());
    expect(result.width).toBe(64);
    expect(result.height).toBe(32);
    expect(result.mime).toBe('image/jpeg');
  });

  it('produces a blurhash and a data-url placeholder', async () => {
    const result = await processImage(await fixtureJpegWithExif());
    expect(result.blurhash.length).toBeGreaterThan(6);
    expect(result.blurDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('strips EXIF metadata from the cleaned buffer', async () => {
    const original = await fixtureJpegWithExif();
    const originalMeta = await sharp(original).metadata();
    expect(originalMeta.exif).toBeTruthy();

    const result = await processImage(original);
    const cleanedMeta = await sharp(result.cleaned).metadata();
    expect(cleanedMeta.exif).toBeUndefined();
    expect(cleanedMeta.width).toBe(64);
  });

  it('passes through svg without rasterizing', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const result = await processImage(svg, 'image/svg+xml');
    expect(result.mime).toBe('image/svg+xml');
    expect(result.cleaned.equals(svg)).toBe(true);
    expect(result.width).toBe(10);
  });

  it('throws on corrupt input', async () => {
    await expect(processImage(Buffer.from('not an image'))).rejects.toThrow();
  });
});
