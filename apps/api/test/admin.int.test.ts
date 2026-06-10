import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AdminModule } from '../src/admin/admin.module.js';
import { ContentModule } from '../src/content/content.module.js';
import { REVALIDATE_CLIENT } from '../src/publish/revalidate.client.js';
import { startStack, type TestStack, EDITOR } from './harness.js';

const AUTH = { Authorization: 'Bearer test' };
const ADMIN = { ...EDITOR, sub: 'test-admin', email: 'admin@test.local', roles: ['cms-admin' as const] };

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

  describe('site membership', () => {
    it('admin manages members; membership scopes editor access', async () => {
      // editor mirrors into users table on first request
      stack.actAs(EDITOR);
      await http().get('/sites').set(AUTH).expect(200);
      stack.actAs(ADMIN);

      // open mode: editor can list pages of the unconfigured site
      stack.actAs(EDITOR);
      await http().get(`/sites/${stack.siteId}/pages`).set(AUTH).expect(200);
      stack.actAs(ADMIN);

      // configure membership for someone else → editor loses access
      await http().get('/sites').set(AUTH).expect(200); // mirror admin
      const added = await http()
        .post(`/sites/${stack.siteId}/members`)
        .set(AUTH)
        .send({ email: 'admin@test.local', role: 'editor' })
        .expect(201);

      stack.actAs(EDITOR);
      await http().get(`/sites/${stack.siteId}/pages`).set(AUTH).expect(403);
      await http()
        .post(`/sites/${stack.siteId}/pages`)
        .set(AUTH)
        .send({ path: '/intruder', name: 'X' })
        .expect(403);
      stack.actAs(ADMIN);

      // add the editor as viewer → read ok, write still forbidden
      await http()
        .post(`/sites/${stack.siteId}/members`)
        .set(AUTH)
        .send({ email: 'editor@test.local', role: 'viewer' })
        .expect(201);
      stack.actAs(EDITOR);
      await http().get(`/sites/${stack.siteId}/pages`).set(AUTH).expect(200);
      await http()
        .post(`/sites/${stack.siteId}/pages`)
        .set(AUTH)
        .send({ path: '/intruder', name: 'X' })
        .expect(403);
      stack.actAs(ADMIN);

      // cleanup: drop memberships so other suites see open mode
      const members = await http().get(`/sites/${stack.siteId}/members`).set(AUTH).expect(200);
      for (const m of members.body) {
        await http().delete(`/members/${m.id}`).set(AUTH).expect(200);
      }
      void added;
    });

    it('unknown email → 404 with login hint', async () => {
      await http()
        .post(`/sites/${stack.siteId}/members`)
        .set(AUTH)
        .send({ email: 'ghost@test.local', role: 'editor' })
        .expect(404);
    });
  });

  describe('xss sanitization', () => {
    it('strips script tags and event handlers from richtext on save', async () => {
      stack.actAs(EDITOR);
      const page = await http()
        .post(`/sites/${stack.siteId}/pages`)
        .set(AUTH)
        .send({ path: '/xss', name: 'XSS' })
        .expect(201);
      const localeId = page.body.locales[0].pageLocaleId;
      const saved = await http()
        .put(`/page-locales/${localeId}/draft`)
        .set(AUTH)
        .send({
          puckData: {
            root: { props: {} },
            content: [
              {
                type: 'Text',
                props: {
                  id: 't1',
                  text: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:evil()">x</a>',
                },
              },
            ],
            zones: {},
          },
        })
        .expect(200);
      const text = saved.body.puckData.content[0].props.text as string;
      expect(text).toContain('<p>ok</p>');
      expect(text).not.toContain('<script');
      expect(text).not.toContain('onerror');
      expect(text).not.toContain('javascript:');
      stack.actAs(ADMIN);
    });
  });

});
