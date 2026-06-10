import './otel.js'; // must be first: patches http/pg/ioredis at load time
import { Worker, type Job } from 'bullmq';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb, media } from '@cms/db';
import { loadConfig } from './config.js';
import { processImage } from './image.js';
import { pingIndexNow, type SeoPingJob } from './indexnow.js';

const cfg = loadConfig();
const db = createDb(cfg.DATABASE_URL, { max: 5 });
const s3 = new S3Client({
  ...(cfg.S3_ENDPOINT ? { endpoint: cfg.S3_ENDPOINT } : {}),
  region: cfg.S3_REGION,
  forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
  ...(cfg.S3_ACCESS_KEY_ID && cfg.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY } }
    : {}),
});
const connection = { url: cfg.REDIS_URL };

async function processMedia(job: Job<{ mediaId: string }>) {
  const row = await db.query.media.findFirst({ where: eq(media.id, job.data.mediaId) });
  if (!row) throw new Error(`media ${job.data.mediaId} not found`);

  const obj = await s3.send(new GetObjectCommand({ Bucket: cfg.S3_BUCKET, Key: row.s3Key }));
  const input = Buffer.from(await obj.Body!.transformToByteArray());

  const result = await processImage(input, row.mime);

  // overwrite in place with metadata-stripped bytes
  if (!result.cleaned.equals(input)) {
    await s3.send(
      new PutObjectCommand({
        Bucket: cfg.S3_BUCKET,
        Key: row.s3Key,
        Body: result.cleaned,
        ContentType: result.mime,
      }),
    );
  }

  await db
    .update(media)
    .set({
      width: result.width,
      height: result.height,
      mime: result.mime,
      size: result.cleaned.length,
      blurhash: result.blurhash,
      blurDataUrl: result.blurDataUrl,
      status: 'ready',
    })
    .where(eq(media.id, row.id));
}

async function invalidate(job: Job<{ tags: string[] }>) {
  const body = JSON.stringify({ tags: job.data.tags });
  const signature = createHmac('sha256', cfg.REVALIDATE_SECRET).update(body).digest('hex');
  const res = await fetch(`${cfg.WEB_INTERNAL_URL}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-signature': signature },
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`revalidate endpoint returned ${res.status}`);
}

const mediaWorker = new Worker('media-process', processMedia, { connection, concurrency: 4 });
const invalidationWorker = new Worker('invalidation', invalidate, { connection, concurrency: 8 });
const seoPingWorker = new Worker<SeoPingJob>(
  'seo-ping',
  async (job) => pingIndexNow(db, job.data),
  { connection, concurrency: 2 },
);

interface WebhookJob {
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}

const webhookWorker = new Worker<WebhookJob>(
  'webhook',
  async (job) => {
    const body = JSON.stringify({
      event: job.data.event,
      payload: job.data.payload,
      deliveredAt: new Date().toISOString(),
    });
    const signature = createHmac('sha256', job.data.secret).update(body).digest('hex');
    const res = await fetch(job.data.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cms-event': job.data.event,
        'x-cms-signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`webhook ${job.data.url} returned ${res.status}`);
  },
  { connection, concurrency: 4 },
);

mediaWorker.on('failed', async (job, err) => {
  console.error(`media-process ${job?.id} failed: ${err.message}`);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await db.update(media).set({ status: 'failed' }).where(eq(media.id, job.data.mediaId));
  }
});
invalidationWorker.on('failed', (job, err) => {
  console.error(`invalidation ${job?.id} failed: ${err.message}`);
});
seoPingWorker.on('failed', (job, err) => {
  console.error(`seo-ping ${job?.id} failed: ${err.message}`);
});
webhookWorker.on('failed', (job, err) => {
  console.error(`webhook ${job?.id} failed: ${err.message}`);
});

console.log('worker started: media-process, invalidation, seo-ping, webhook');

async function shutdown() {
  await Promise.all([
    mediaWorker.close(),
    invalidationWorker.close(),
    seoPingWorker.close(),
    webhookWorker.close(),
  ]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
