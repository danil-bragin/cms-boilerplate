import { createDb } from './client.js';
import { sites, users, pages, pageLocales, pageVersions, publishedPages } from './schema.js';
import { and, eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://cms:cms@localhost:5433/cms';

const emptyPuckData = (title: string) => ({
  root: { props: { title } },
  content: [],
  zones: {},
});

const homePuckData = {
  root: { props: { title: 'Home', description: 'Demo home page' } },
  content: [
    {
      type: 'Heading',
      props: { id: 'Heading-seed-1', text: 'Welcome to the CMS boilerplate', level: '1' },
    },
    {
      type: 'Text',
      props: {
        id: 'Text-seed-1',
        text: 'This page was seeded. Edit it at /admin.',
      },
    },
  ],
  zones: {},
};

async function main() {
  const db = createDb(DATABASE_URL, { max: 1 });

  await db
    .insert(users)
    .values({ id: 'system', email: 'system@cms.local', displayName: 'System' })
    .onConflictDoNothing();

  const [site] = await db
    .insert(sites)
    .values({
      slug: 'demo',
      domains: ['localhost'],
      defaultLocale: 'en',
      locales: ['en', 'de'],
    })
    .onConflictDoUpdate({ target: sites.slug, set: { domains: ['localhost'] } })
    .returning();
  if (!site) throw new Error('seed: site upsert failed');

  async function ensurePage(path: string, name: string, puckData: unknown, publish: boolean) {
    let page = await db.query.pages.findFirst({
      where: and(eq(pages.siteId, site!.id), eq(pages.path, path)),
    });
    if (!page) {
      [page] = await db.insert(pages).values({ siteId: site!.id, path, name }).returning();
    }
    if (!page) throw new Error('seed: page insert failed');

    let locale = await db.query.pageLocales.findFirst({
      where: and(eq(pageLocales.pageId, page.id), eq(pageLocales.locale, 'en')),
    });
    if (!locale) {
      [locale] = await db
        .insert(pageLocales)
        .values({ pageId: page.id, locale: 'en' })
        .returning();
    }
    if (!locale) throw new Error('seed: locale insert failed');

    let version = await db.query.pageVersions.findFirst({
      where: and(eq(pageVersions.pageLocaleId, locale.id), eq(pageVersions.versionNo, 1)),
    });
    if (!version) {
      [version] = await db
        .insert(pageVersions)
        .values({
          pageLocaleId: locale.id,
          versionNo: 1,
          puckData,
          status: publish ? 'published' : 'draft',
          createdBy: 'system',
        })
        .returning();
    }
    if (!version) throw new Error('seed: version insert failed');

    if (publish) {
      await db
        .insert(publishedPages)
        .values({
          siteId: site!.id,
          locale: 'en',
          path,
          pageId: page.id,
          versionId: version.id,
          puckData,
          seo: { title: name },
        })
        .onConflictDoNothing();
    }
  }

  await ensurePage('/', 'Home', homePuckData, true);
  await ensurePage('/about', 'About', emptyPuckData('About'), false);

  console.log('seed: done (site=demo, pages=/ published, /about draft)');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
