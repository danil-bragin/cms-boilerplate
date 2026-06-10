import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ContentModule } from '../src/content/content.module.js';
import { startStack, type TestStack, VIEWER, EDITOR } from './harness.js';

const AUTH = { Authorization: 'Bearer test' };
const puck = (title: string) => ({ root: { props: { title } }, content: [], zones: {} });

describe('content api', () => {
  let stack: TestStack;
  let http: () => request.Agent;

  beforeAll(async () => {
    stack = await startStack({ metadata: { imports: [ContentModule] } });
    http = () => request(stack.app.getHttpServer());
  }, 120_000);

  afterAll(async () => {
    await stack.stop();
  });

  it('rejects unauthenticated requests', async () => {
    await request(stack.app.getHttpServer()).get('/sites').expect(401);
  });

  it('lists sites', async () => {
    const res = await http().get('/sites').set(AUTH).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe('test');
  });

  it('creates page with default locale and empty draft v1', async () => {
    const res = await http()
      .post(`/sites/${stack.siteId}/pages`)
      .set(AUTH)
      .send({ path: '/about', name: 'About' })
      .expect(201);

    expect(res.body.path).toBe('/about');
    expect(res.body.locales).toHaveLength(1);
    expect(res.body.locales[0]).toMatchObject({
      locale: 'en',
      latestVersionNo: 1,
      latestStatus: 'draft',
      publishedVersionId: null,
    });
  });

  it('rejects duplicate path with 409', async () => {
    await http()
      .post(`/sites/${stack.siteId}/pages`)
      .set(AUTH)
      .send({ path: '/about', name: 'Again' })
      .expect(409);
  });

  it('viewer cannot create pages', async () => {
    stack.actAs(VIEWER);
    await http()
      .post(`/sites/${stack.siteId}/pages`)
      .set(AUTH)
      .send({ path: '/nope', name: 'Nope' })
      .expect(403);
    stack.actAs(EDITOR);
  });

  it('adds a locale once', async () => {
    const pages = await http().get(`/sites/${stack.siteId}/pages`).set(AUTH).expect(200);
    const about = pages.body.find((p: { path: string }) => p.path === '/about');

    const res = await http()
      .post(`/pages/${about.id}/locales`)
      .set(AUTH)
      .send({ locale: 'de' })
      .expect(201);
    expect(res.body.locale).toBe('de');

    await http().post(`/pages/${about.id}/locales`).set(AUTH).send({ locale: 'de' }).expect(409);
  });

  it('rejects locale not in site.locales', async () => {
    const pages = await http().get(`/sites/${stack.siteId}/pages`).set(AUTH).expect(200);
    const about = pages.body.find((p: { path: string }) => p.path === '/about');
    await http().post(`/pages/${about.id}/locales`).set(AUTH).send({ locale: 'fr' }).expect(400);
  });

  describe('drafts', () => {
    let pageLocaleId: string;

    beforeAll(async () => {
      const pages = await http().get(`/sites/${stack.siteId}/pages`).set(AUTH);
      const about = pages.body.find((p: { path: string }) => p.path === '/about');
      pageLocaleId = about.locales.find((l: { locale: string }) => l.locale === 'en').pageLocaleId;
    });

    it('saveDraft on a draft overwrites in place (still v1)', async () => {
      await http()
        .put(`/page-locales/${pageLocaleId}/draft`)
        .set(AUTH)
        .send({ puckData: puck('About v1 edited') })
        .expect(200);

      const versions = await http()
        .get(`/page-locales/${pageLocaleId}/versions`)
        .set(AUTH)
        .expect(200);
      expect(versions.body).toHaveLength(1);
      expect(versions.body[0].versionNo).toBe(1);
    });

    it('stale baseVersionNo → 409', async () => {
      await http()
        .put(`/page-locales/${pageLocaleId}/draft`)
        .set(AUTH)
        .send({ puckData: puck('stale'), baseVersionNo: 99 })
        .expect(409);
    });

    it('returns full version with puckData', async () => {
      const versions = await http().get(`/page-locales/${pageLocaleId}/versions`).set(AUTH);
      const full = await http().get(`/versions/${versions.body[0].id}`).set(AUTH).expect(200);
      expect(full.body.puckData.root.props.title).toBe('About v1 edited');
    });
  });
});
