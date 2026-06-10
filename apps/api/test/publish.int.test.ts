import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { pageVersions, publishedPages } from '@cms/db';
import { ContentModule } from '../src/content/content.module.js';
import { AdminModule } from '../src/admin/admin.module.js';
import { PublishModule } from '../src/publish/publish.module.js';
import { REVALIDATE_CLIENT, type RevalidateClient } from '../src/publish/revalidate.client.js';
import { startStack, type TestStack } from './harness.js';

const AUTH = { Authorization: 'Bearer test' };
const puck = (title: string) => ({ root: { props: { title, description: `${title} desc` } }, content: [], zones: {} });

describe('publish api', () => {
  let stack: TestStack;
  let http: () => request.Agent;
  let pageLocaleId: string;
  let pageId: string;
  const invalidate = vi.fn(async (_tags: string[]) => {});

  beforeAll(async () => {
    stack = await startStack({
      metadata: {
        imports: [ContentModule, PublishModule, AdminModule],
      },
      withRedis: true,
      overrides: [{ token: REVALIDATE_CLIENT, value: { invalidate } satisfies RevalidateClient }],
    });
    http = () => request(stack.app.getHttpServer());

    const page = await http()
      .post(`/sites/${stack.siteId}/pages`)
      .set(AUTH)
      .send({ path: '/pub', name: 'Pub' })
      .expect(201);
    pageId = page.body.id;
    pageLocaleId = page.body.locales[0].pageLocaleId;

    await http()
      .put(`/page-locales/${pageLocaleId}/draft`)
      .set(AUTH)
      .send({ puckData: puck('v1') })
      .expect(200);
  }, 180_000);

  afterAll(async () => {
    await stack.stop();
  });

  async function latestVersion() {
    const versions = await http().get(`/page-locales/${pageLocaleId}/versions`).set(AUTH);
    return versions.body[0];
  }

  it('publishes a version: snapshot + status + invalidation tag', async () => {
    const v1 = await latestVersion();
    invalidate.mockClear();

    await http()
      .post(`/page-locales/${pageLocaleId}/publish`)
      .set(AUTH)
      .send({ versionId: v1.id })
      .expect(201);

    const snapshot = await stack.db.query.publishedPages.findFirst({
      where: and(eq(publishedPages.pageId, pageId), eq(publishedPages.locale, 'en')),
    });
    expect(snapshot).toBeTruthy();
    expect((snapshot!.puckData as { root: { props: { title: string } } }).root.props.title).toBe('v1');
    expect(snapshot!.seo).toMatchObject({ title: 'v1', description: 'v1 desc' });

    const version = await stack.db.query.pageVersions.findFirst({
      where: eq(pageVersions.id, v1.id),
    });
    expect(version!.status).toBe('published');

    expect(invalidate).toHaveBeenCalledWith(
      expect.arrayContaining([`page:${stack.siteId}:en:/pub`, `alts:${pageId}`]),
    );
  });

  it('saveDraft after publish creates v2', async () => {
    await http()
      .put(`/page-locales/${pageLocaleId}/draft`)
      .set(AUTH)
      .send({ puckData: puck('v2') })
      .expect(200);
    const latest = await latestVersion();
    expect(latest.versionNo).toBe(2);
    expect(latest.status).toBe('draft');
  });

  it('rollback: publishing v1 again swaps the snapshot and archives v2', async () => {
    const versions = await http().get(`/page-locales/${pageLocaleId}/versions`).set(AUTH);
    const v2 = versions.body.find((v: { versionNo: number }) => v.versionNo === 2);
    const v1 = versions.body.find((v: { versionNo: number }) => v.versionNo === 1);

    await http()
      .post(`/page-locales/${pageLocaleId}/publish`)
      .set(AUTH)
      .send({ versionId: v2.id })
      .expect(201);

    await http()
      .post(`/page-locales/${pageLocaleId}/publish`)
      .set(AUTH)
      .send({ versionId: v1.id })
      .expect(201);

    const snapshot = await stack.db.query.publishedPages.findFirst({
      where: and(eq(publishedPages.pageId, pageId), eq(publishedPages.locale, 'en')),
    });
    expect((snapshot!.puckData as { root: { props: { title: string } } }).root.props.title).toBe('v1');

    const v2row = await stack.db.query.pageVersions.findFirst({ where: eq(pageVersions.id, v2.id) });
    expect(v2row!.status).toBe('archived');
  });

  it('rejects publishing a version from another locale', async () => {
    const other = await http()
      .post(`/sites/${stack.siteId}/pages`)
      .set(AUTH)
      .send({ path: '/other', name: 'Other' })
      .expect(201);
    const otherLocaleId = other.body.locales[0].pageLocaleId;
    const otherVersions = await http().get(`/page-locales/${otherLocaleId}/versions`).set(AUTH);

    await http()
      .post(`/page-locales/${pageLocaleId}/publish`)
      .set(AUTH)
      .send({ versionId: otherVersions.body[0].id })
      .expect(404);
  });

  it('unpublish removes the snapshot and invalidates', async () => {
    invalidate.mockClear();
    await http().post(`/page-locales/${pageLocaleId}/unpublish`).set(AUTH).expect(201);

    const snapshot = await stack.db.query.publishedPages.findFirst({
      where: and(eq(publishedPages.pageId, pageId), eq(publishedPages.locale, 'en')),
    });
    expect(snapshot).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith(
      expect.arrayContaining([`page:${stack.siteId}:en:/pub`]),
    );
  });

  it('slugOverride change retires the old path and leaves a 301 redirect', async () => {
    const page = await http()
      .post(`/sites/${stack.siteId}/pages`)
      .set(AUTH)
      .send({ path: '/movable', name: 'Movable' })
      .expect(201);
    const localeId = page.body.locales[0].pageLocaleId;
    const draft = await http()
      .put(`/page-locales/${localeId}/draft`)
      .set(AUTH)
      .send({ puckData: puck('move me') })
      .expect(200);
    await http()
      .post(`/page-locales/${localeId}/publish`)
      .set(AUTH)
      .send({ versionId: draft.body.id })
      .expect(201);

    // change the localized slug, republish
    await http()
      .patch(`/page-locales/${localeId}`)
      .set(AUTH)
      .send({ slugOverride: 'verschoben' })
      .expect(200);
    await http()
      .post(`/page-locales/${localeId}/publish`)
      .set(AUTH)
      .send({ versionId: draft.body.id })
      .expect(201);

    const rows = await stack.db.query.publishedPages.findMany({
      where: eq(publishedPages.path, '/movable'),
    });
    expect(rows).toHaveLength(0); // old path retired
    const moved = await stack.db.query.publishedPages.findMany({
      where: eq(publishedPages.path, '/verschoben'),
    });
    expect(moved).toHaveLength(1);
    const { redirects } = await import('@cms/db');
    const redirect = await stack.db.query.redirects.findFirst({
      where: eq(redirects.fromPath, '/en/movable'),
    });
    expect(redirect?.toPath).toBe('/en/verschoben');
    expect(redirect?.status).toBe('301');
  });
});
