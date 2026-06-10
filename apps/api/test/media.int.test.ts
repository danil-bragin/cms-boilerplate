import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Queue } from 'bullmq';
import { MediaModule } from '../src/media/media.module.js';
import { MEDIA_QUEUE } from '../src/media/media.service.js';
import { startStack, type TestStack } from './harness.js';

const AUTH = { Authorization: 'Bearer test' };
// 1x1 transparent png
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('media api', () => {
  let stack: TestStack;
  let http: () => request.Agent;

  beforeAll(async () => {
    stack = await startStack({
      metadata: { imports: [MediaModule] },
      withRedis: true,
      withMinio: true,
    });
    http = () => request(stack.app.getHttpServer());
  }, 240_000);

  afterAll(async () => {
    await stack.stop();
  });

  it('presign creates an uploading media row and an upload URL containing the key', async () => {
    const res = await http()
      .post(`/sites/${stack.siteId}/media/presign`)
      .set(AUTH)
      .send({ filename: 'логотип компании.png', mime: 'image/png', size: PNG.length })
      .expect(201);

    expect(res.body.mediaId).toBeTruthy();
    expect(res.body.s3Key).toMatch(new RegExp(`^sites/${stack.siteId}/media/${res.body.mediaId}/`));
    // filename sanitized to url-safe ascii
    expect(res.body.s3Key).not.toMatch(/[^a-zA-Z0-9/._-]/);
    expect(res.body.uploadUrl).toContain(encodeURI(res.body.s3Key).replace(/[а-я]/gi, ''));

    const listed = await http()
      .get(`/sites/${stack.siteId}/media?status=uploading`)
      .set(AUTH)
      .expect(200);
    expect(listed.body.some((m: { id: string }) => m.id === res.body.mediaId)).toBe(true);
  });

  it('confirm before upload → 409', async () => {
    const presign = await http()
      .post(`/sites/${stack.siteId}/media/presign`)
      .set(AUTH)
      .send({ filename: 'ghost.png', mime: 'image/png', size: PNG.length })
      .expect(201);

    await http().post(`/media/${presign.body.mediaId}/confirm`).set(AUTH).expect(409);
  });

  it('upload via presigned URL then confirm → processing job enqueued', async () => {
    const presign = await http()
      .post(`/sites/${stack.siteId}/media/presign`)
      .set(AUTH)
      .send({ filename: 'real.png', mime: 'image/png', size: PNG.length })
      .expect(201);

    const put = await fetch(presign.body.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: PNG,
    });
    expect(put.ok).toBe(true);

    await http().post(`/media/${presign.body.mediaId}/confirm`).set(AUTH).expect(202);

    const queue = new Queue(MEDIA_QUEUE, {
      connection: { url: stack.cfg.REDIS_URL },
    });
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed']);
    await queue.close();
    expect(jobs.some((j) => j.data.mediaId === presign.body.mediaId)).toBe(true);
  });
});
