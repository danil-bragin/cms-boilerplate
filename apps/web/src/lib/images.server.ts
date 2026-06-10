import 'server-only';
import { configureImages, configurePosts } from '@cms/puck-config';
import { getLatestPosts } from './posts';

/** Server module graph: sign imgproxy URLs directly — keys never reach the client. */
configureImages({
  mode: 'imgproxy',
  baseUrl: process.env.IMGPROXY_URL ?? 'http://localhost:8081',
  bucket: process.env.S3_BUCKET ?? 'cms-media',
  key: process.env.IMGPROXY_KEY ?? '',
  salt: process.env.IMGPROXY_SALT ?? '',
});

configurePosts(async (siteId, locale, limit) =>
  (await getLatestPosts(siteId, locale, limit)).map((p) => ({
    path: p.path,
    locale: p.locale,
    title: p.title,
    description: p.description,
    author: p.author,
    firstPublishedAt: p.firstPublishedAt,
  })),
);
