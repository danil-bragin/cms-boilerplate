import 'server-only';
import { configureImages, configurePosts } from '@cms/puck-config';
import { getLatestPosts, getPostsPage } from './posts';

/** Server module graph: sign imgproxy URLs directly — keys never reach the client. */
configureImages({
  mode: 'imgproxy',
  baseUrl: process.env.IMGPROXY_URL ?? 'http://localhost:8081',
  bucket: process.env.S3_BUCKET ?? 'cms-media',
  key: process.env.IMGPROXY_KEY ?? '',
  salt: process.env.IMGPROXY_SALT ?? '',
});

const mapPost = (p: { path: string; locale: string; title: string; description: string; author: string | null; firstPublishedAt: string }) => ({
  path: p.path,
  locale: p.locale,
  title: p.title,
  description: p.description,
  author: p.author,
  firstPublishedAt: p.firstPublishedAt,
});

configurePosts(
  async (siteId, locale, limit) => (await getLatestPosts(siteId, locale, limit)).map(mapPost),
  async (siteId, locale, page, perPage) => {
    const result = await getPostsPage(siteId, locale, page, perPage);
    return { posts: result.posts.map(mapPost), totalPages: result.totalPages };
  },
);
