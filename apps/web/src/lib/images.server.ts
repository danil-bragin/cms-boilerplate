import 'server-only';
import { configureImages, configurePosts, imageUrl } from '@cms/puck-config';
import type { PostItem } from '@cms/puck-config';
import { getLatestPosts, getPostsPage, type PostSummary } from './posts';

/** Server module graph: sign imgproxy URLs directly — keys never reach the client. */
const imgproxyKey = process.env.IMGPROXY_KEY ?? '';
const imgproxySalt = process.env.IMGPROXY_SALT ?? '';
// runtime-only: the build phase has no real secrets and signs nothing
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  (!imgproxyKey || !imgproxySalt)
) {
  throw new Error('IMGPROXY_KEY and IMGPROXY_SALT must be set in production (signed image URLs)');
}
configureImages({
  mode: 'imgproxy',
  // Same-origin path (e.g. "/img") when fronted by an nginx/CDN that reverse-
  // proxies + caches imgproxy — reuses the document's warm connection and the
  // edge cache. Falls back to the direct imgproxy origin for zero-config dev.
  baseUrl: process.env.IMAGE_PUBLIC_BASE || (process.env.IMGPROXY_URL ?? 'http://localhost:8081'),
  bucket: process.env.S3_BUCKET ?? 'cms-media',
  key: imgproxyKey,
  salt: imgproxySalt,
});

const COVER_W = 800;
const ratioH = (w: number) => Math.round((w * 9) / 16);

/** Map a DB post summary to the wire shape, signing the cover URL server-side. */
export const mapPost = (p: PostSummary): PostItem => ({
  path: p.path,
  locale: p.locale,
  title: p.title,
  description: p.description,
  author: p.author,
  firstPublishedAt: p.firstPublishedAt,
  image: p.cover
    ? {
        src: imageUrl(p.cover.s3Key, { width: COVER_W, height: ratioH(COVER_W), crop: { focalX: 0.5, focalY: 0.5 } }),
        srcSet: [320, 480, 800]
          .map((w) => `${imageUrl(p.cover!.s3Key, { width: w, height: ratioH(w), crop: { focalX: 0.5, focalY: 0.5 } })} ${w}w`)
          .join(', '),
        blurDataUrl: p.cover.blurDataUrl ?? null,
        alt: p.cover.alt ?? '',
      }
    : null,
});

configurePosts(
  async (siteId, locale, limit) => (await getLatestPosts(siteId, locale, limit)).map(mapPost),
  async (siteId, locale, page, perPage) => {
    const result = await getPostsPage(siteId, locale, page, perPage);
    return { posts: result.posts.map(mapPost), totalPages: result.totalPages };
  },
);
