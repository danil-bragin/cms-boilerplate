import 'server-only';
import { configureImages } from '@cms/puck-config';

/** Server module graph: sign imgproxy URLs directly — keys never reach the client. */
configureImages({
  mode: 'imgproxy',
  baseUrl: process.env.IMGPROXY_URL ?? 'http://localhost:8081',
  bucket: process.env.S3_BUCKET ?? 'cms-media',
  key: process.env.IMGPROXY_KEY ?? '',
  salt: process.env.IMGPROXY_SALT ?? '',
});
