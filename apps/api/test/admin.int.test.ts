import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AdminModule } from '../src/admin/admin.module.js';
import { ContentModule } from '../src/content/content.module.js';
import { REVALIDATE_CLIENT } from '../src/publish/revalidate.client.js';
import { startStack, type TestStack, EDITOR } from './harness.js';

const AUTH = { Authorization: 'Bearer test' };
const ADMIN = { ...EDITOR, sub: 'test-admin', roles: ['cms-admin' as const] };

describe('admin api', () => {
  let stack: TestStack;
  let http: () => request.Agent;

  beforeAll(async () => {
    stack = await startStack({
      metadata: { imports: [AdminModule, ContentModule] },
      withRedis: true,
      overrides: [{ token: REVALIDATE_CLIENT, value: { invalidate: async () => {} } }],
    });
    http = () => request(stack.app.getHttpServer());
    stack.actAs(ADMIN);
  }, 180_000);

  afterAll(async () => {
    await stack.stop();
  });

  it('creates a site with generated indexnow key', async () => {
    const res = await http()
      .post('/sites')
      .set(AUTH)
      .send({ slug: 'second', domains: ['second.example'], defaultLocale: 'en', locales: ['en'] })
      .expect(201);
    expect(res.body.slug).toBe('second');
    expect((res.body.settings as { indexNowKey: string }).indexNowKey).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects defaultLocale not in locales', async () => {
    await http()
      .post('/sites')
      .set(AUTH)
      .send({ slug: 'bad', domains: ['bad.example'], defaultLocale: 'fr', locales: ['en'] })
      .expect(400);
  });

  it('updates site seo settings', async () => {
    const res = await http()
      .patch(`/sites/${stack.siteId}`)
      .set(AUTH)
      .send({ seo: { blockAiTraining: true } })
      .expect(200);
    expect((res.body.settings as { seo: { blockAiTraining: boolean } }).seo.blockAiTraining).toBe(true);
  });

  it('editor cannot create sites', async () => {
    stack.actAs(EDITOR);
    await http()
      .post('/sites')
      .set(AUTH)
      .send({ slug: 'nope', domains: ['x.example'], defaultLocale: 'en', locales: ['en'] })
      .expect(403);
    stack.actAs(ADMIN);
  });

  it('redirect lifecycle + duplicate rejection', async () => {
    const created = await http()
      .post(`/sites/${stack.siteId}/redirects`)
      .set(AUTH)
      .send({ fromPath: '/en/old', toPath: '/en/new', status: '301' })
      .expect(201);
    await http()
      .post(`/sites/${stack.siteId}/redirects`)
      .set(AUTH)
      .send({ fromPath: '/en/old', toPath: '/elsewhere' })
      .expect(409);
    const list = await http().get(`/sites/${stack.siteId}/redirects`).set(AUTH).expect(200);
    expect(list.body).toHaveLength(1);
    await http().delete(`/redirects/${created.body.id}`).set(AUTH).expect(200);
  });

  it('menu upsert is idempotent on slug', async () => {
    stack.actAs(EDITOR);
    const items = [{ label: { en: 'Home' }, href: '/en', children: [] }];
    await http().put(`/sites/${stack.siteId}/menus`).set(AUTH).send({ slug: 'main', items }).expect(200);
    const updated = [{ label: { en: 'Start' }, href: '/en', children: [] }];
    await http()
      .put(`/sites/${stack.siteId}/menus`)
      .set(AUTH)
      .send({ slug: 'main', items: updated })
      .expect(200);
    const list = await http().get(`/sites/${stack.siteId}/menus`).set(AUTH).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].items[0].label.en).toBe('Start');
    stack.actAs(ADMIN);
  });

  it('webhook secret returned once, hidden in list', async () => {
    const created = await http()
      .post(`/sites/${stack.siteId}/webhooks`)
      .set(AUTH)
      .send({ url: 'https://example.com/hook', events: ['page.published'] })
      .expect(201);
    expect(created.body.secret).toMatch(/^[0-9a-f]{48}$/);
    const list = await http().get(`/sites/${stack.siteId}/webhooks`).set(AUTH).expect(200);
    expect(list.body[0].secret).toBeUndefined();
  });
});
