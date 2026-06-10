import { S3Client } from '@aws-sdk/client-s3';
import type { AppConfig } from '../config/config.js';

export const S3 = Symbol('S3');

export function createS3Client(cfg: AppConfig): S3Client {
  return new S3Client({
    ...(cfg.S3_ENDPOINT ? { endpoint: cfg.S3_ENDPOINT } : {}),
    region: cfg.S3_REGION,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    ...(cfg.S3_ACCESS_KEY_ID && cfg.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: cfg.S3_ACCESS_KEY_ID,
            secretAccessKey: cfg.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
}
