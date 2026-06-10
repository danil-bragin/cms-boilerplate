import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { publishedPages, scheduledPublishes } from '@cms/db';
import { ContentModule } from '../src/content/content.module.js';
import { PublishModule } from '../src/publish/publish.module.js';
import { REVALIDATE_CLIENT } from '../src/publish/revalidate.client.js';
import { startStack, type TestStack } from './harness.js';

const AUTH = { Authorization: 'Bearer test' };
const puck = { root: { props: { title: 'Scheduled' } }, content: [], zones: {} };

describe('scheduled publishing', () => {
  let stack: TestStack;
  let http: () => request.Agent;
  let pageLocaleId: string;
  let versionId: string;

  beforeAll(async () => {
    stack = await startStack({
      metadata: { imports: [ContentModule, PublishModule] },
      withRedis: true,
      overrides: [{ token: REVALIDATE_CLIENT, value: { invalidate: vi.fn(async () => {}) } }],
    });
    http = () => request(stack.app.getHttpServer());

    const page = await http()
      .post(`/sites/${stack.siteId}/pages`)
      .set(AUTH)
      .send({ path: '/sched', name: 'Sched' })
      .expect(201);
    pageLocaleId = page.body.locales[0].pageLocaleId;
    const draft = await http()
      .put(`/page-locales/${pageLocaleId}/draft`)
      .set(AUTH)
      .send({ puckData: puck })
      .expect(200);
    versionId = draft.body.id;
  }, 180_000);

  afterAll(async () => {
    await stack.stop();
  });

  it('rejects past dates', async () => {
    await http()
      .post(`/page-locales/${pageLocaleId}/schedule`)
      .set(AUTH)
      .send({ versionId, publishAt: new Date(Date.now() - 1000).toISOString() })
      .expect(400);
  });

  it('schedules, executes via the delayed job, marks done', async () => {
    const res = await http()
      .post(`/page-locales/${pageLocaleId}/schedule`)
      .set(AUTH)
      .send({ versionId, publishAt: new Date(Date.now() + 1500).toISOString() })
      .expect(201);
    expect(res.body.status).toBe('pending');

    // wait for the delayed job to fire and the processor to publish
    await vi.waitFor(
      async () => {
        const row = await stack.db.query.scheduledPublishes.findFirst({
          where: eq(scheduledPublishes.id, res.body.id),
        });
        expect(row!.status).toBe('done');
      },
      { timeout: 15_000, interval: 500 },
    );

    const snapshot = await stack.db.query.publishedPages.findFirst({
      where: eq(publishedPages.path, '/sched'),
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot!.searchText).toContain('Scheduled');
  });

  it('cancel removes pending schedule', async () => {
    const res = await http()
      .post(`/page-locales/${pageLocaleId}/schedule`)
      .set(AUTH)
      .send({ versionId, publishAt: new Date(Date.now() + 60_000).toISOString() })
      .expect(201);
    await http().delete(`/schedules/${res.body.id}`).set(AUTH).expect(200);
    const row = await stack.db.query.scheduledPublishes.findFirst({
      where: eq(scheduledPublishes.id, res.body.id),
    });
    expect(row!.status).toBe('cancelled');
  });
});
