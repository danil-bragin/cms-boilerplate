import { randomBytes } from 'node:crypto';
import { createDb } from './client.js';
import { sites, users, pages, pageLocales, pageVersions, publishedPages, authors } from './schema.js';
import { and, eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://cms:cms@localhost:5433/cms';

// --- Puck content builders (mirror @cms/puck-config component props) ---

type Block = { type: string; props: Record<string, unknown> };
let blockSeq = 0;
const block = (type: string, props: Record<string, unknown>, children?: Record<string, unknown>): Block => ({
  type,
  props: { id: `${type}-${blockSeq++}`, ...props, ...children },
});

const heading = (text: string, level: '1' | '2' | '3' | '4') => block('Heading', { text, level });
const text = (html: string) => block('Text', { text: html });
const button = (label: string, href: string, variant: 'primary' | 'secondary' = 'primary') =>
  block('Button', { label, href, variant });
const section = (
  children: Block[],
  opts: { maxWidth?: string; paddingY?: string } = {},
) => block('Section', { maxWidth: opts.maxWidth ?? '960px', paddingY: opts.paddingY ?? '48px' }, { children });
const columns = (cols: Block[][], gap: '16px' | '32px' = '32px') =>
  block(
    'Columns',
    { columns: String(cols.length), gap },
    { col1: cols[0] ?? [], col2: cols[1] ?? [], col3: cols[2] ?? [], col4: cols[3] ?? [] },
  );
const search = (placeholder: string) => block('Search', { placeholder });
const postList = (h: string, limit: number, paginated = false) =>
  block('PostList', { heading: h, limit, paginated });

const page = (title: string, description: string, content: Block[], ogImage?: undefined) => ({
  root: { props: { title, description, ...(ogImage ? { ogImage } : {}) } },
  content,
  zones: {},
});

// --- example pages ---

const homePage = page(
  'Modern CMS Boilerplate',
  'A production-grade, high-load CMS boilerplate — Puck visual editing, Next.js render, NestJS API, full technical SEO.',
  [
    section(
      [
        heading('Build content sites that win on speed and SEO', '1'),
        text(
          '<p>A production-grade CMS boilerplate: visual page building with Puck, a Next.js render layer that serves cached pages from shared Redis, a NestJS content API, and a complete technical-SEO arsenal — measured under load.</p>',
        ),
        block('Section', { maxWidth: 'none', paddingY: '0' }, {
          children: [columns([[button('Open the admin', '/admin')], [button('Read a post', '/blog', 'secondary')]], '16px')],
        }),
      ],
      { maxWidth: '960px', paddingY: '96px' },
    ),
    section(
      [
        heading('Everything a content team needs', '2'),
        columns([
          [heading('Visual editing', '3'), text('<p>Drag-and-drop pages with Puck, autosave, version history with diff, scheduled publishing and rollback.</p>')],
          [heading('High-load read path', '3'), text('<p>Full-page ISR in shared Redis, fast-404 at the edge, cross-replica invalidation. ~290 rps, p95 16ms, proven.</p>')],
          [heading('Maximum SEO', '3'), text('<p>Metadata, JSON-LD, hreflang, OG images, sitemaps with image &amp; news, RSS, IndexNow, GSC monitoring, RUM CWV.</p>')],
        ]),
      ],
      { maxWidth: '1280px', paddingY: '48px' },
    ),
    section(
      [
        heading('Search the site', '2'),
        text('<p>Full-text search powered by Postgres, ranked with snippet highlighting.</p>'),
        search('Search posts and pages…'),
      ],
      { maxWidth: '640px', paddingY: '48px' },
    ),
    section(
      [heading('Ready to explore?', '2'), text('<p>Log in to the admin and edit any of these pages live.</p>'), button('Go to the admin →', '/admin')],
      { maxWidth: '640px', paddingY: '96px' },
    ),
  ],
);

const aboutPage = page(
  'About this boilerplate',
  'Why this CMS boilerplate exists and what it is built for.',
  [
    section([
      heading('About', '1'),
      text(
        '<p>This boilerplate is the reference implementation of a high-load, SEO-first CMS. Every architectural claim — cross-replica cache invalidation, graceful degradation when Redis dies, field Core Web Vitals — is verified, not asserted.</p>',
      ),
    ]),
    section(
      [
        columns([
          [heading('Built for scale', '3'), text('<p>Read traffic is served from a shared Redis page cache; Postgres is touched only on cache fill. The write path is isolated and rate-limited. Multi-tenant from day one.</p>')],
          [heading('Built for ranking', '3'), text('<p>Canonical normalization, hreflang with x-default, Article and Organization schema, author E-E-A-T pages, news and image sitemaps — the full 2026 technical-SEO surface.</p>')],
        ]),
      ],
      { maxWidth: '1280px' },
    ),
    section([button('Back home', '/', 'secondary')], { maxWidth: '640px', paddingY: '24px' }),
  ],
);

const featuresPage = page(
  'Features',
  'Editor, performance, SEO, security and operations — what is in the box.',
  [
    section([heading('Features', '1'), text('<p>A tour of what ships in the box.</p>')], { paddingY: '96px' }),
    section(
      [
        columns([
          [heading('Editor', '3'), text('<p>Puck visual builder, rich text, media library with focal-point cropping, version diff, scheduled publishing, bulk operations, localized admin (EN/RU).</p>')],
          [heading('Performance', '3'), text('<p>Full-page ISR, hardened Redis cache handler, Speculation Rules prerender, view transitions, LCP image preload, AVIF/WebP via imgproxy, Lighthouse 100.</p>')],
        ]),
        columns([
          [heading('SEO', '3'), text('<p>Per-page metadata, JSON-LD graph, dynamic OG images, sitemaps (sharded + image + news), RSS, IndexNow, Search Console URL inspection, RUM field vitals.</p>')],
          [heading('Operations', '3'), text('<p>Helm chart, OpenTelemetry to Prometheus/Jaeger/Grafana, CDN purge, webhooks, k6 load stand, CI with lint + tests + migration checks.</p>')],
        ]),
      ],
      { maxWidth: '1280px' },
    ),
    section([heading('See it live', '2'), button('Open the admin', '/admin')], { maxWidth: '640px', paddingY: '48px' }),
  ],
);

const blogIndexPage = page(
  'Blog',
  'Articles on building high-load, SEO-first content sites.',
  [
    section([heading('Blog', '1'), text('<p>Notes on building high-load, SEO-first content sites.</p>'), search('Search the blog…')], {
      maxWidth: '760px',
      paddingY: '48px',
    }),
    section([postList('All posts', 5, true)], { maxWidth: '760px', paddingY: '24px' }),
  ],
);

const post1 = page(
  'Launching the CMS boilerplate',
  'What this project is, who it is for, and how to get started in five minutes.',
  [
    section([
      heading('Launching the CMS boilerplate', '1'),
      text(
        '<p>After many iterations, the boilerplate is feature-complete: a visual editor, a cached render layer, a content API, and a technical-SEO stack that has been audited end to end.</p><p>Clone it, run <code>docker compose up</code>, seed the demo, and you have a multi-tenant CMS serving cached pages in milliseconds. Every page you are reading was built with the same Puck components available in the editor.</p>',
      ),
    ]),
    section([heading('Where to start', '2'), text('<p>Open the admin, edit this post, and publish. Then watch the public URL update instantly across replicas.</p>'), button('Open the admin', '/admin')], {
      maxWidth: '760px',
    }),
  ],
);

const post2 = page(
  'The high-load read path, explained',
  'How published pages are served from a shared Redis cache and stay fast under load — with the numbers.',
  [
    section([
      heading('The high-load read path, explained', '1'),
      text(
        '<p>Public pages are denormalized into a single snapshot row and rendered once, then cached as full HTML in Redis shared by every replica. A cache hit costs zero React work. The proxy resolves the host and rejects unknown paths at the edge before any rendering.</p>',
      ),
    ]),
    section(
      [
        columns([
          [heading('~290 rps', '2'), text('<p>Sustained throughput on a laptop, three replicas, mixed traffic.</p>')],
          [heading('16 ms', '2'), text('<p>p95 latency; cached-page TTFB p95 is 13.7 ms.</p>')],
          [heading('0.05%', '2'), text('<p>Error rate during a Redis outage with the hardened cache handler — down from 24%.</p>')],
        ]),
      ],
      { maxWidth: '1280px' },
    ),
    section([text('<p>Publishing invalidates exactly the affected tags; the invalidation reaches every replica through the shared cache. Read-your-writes, no stampede.</p>')], { maxWidth: '760px' }),
  ],
);

const post3 = page(
  'A technical SEO playbook for 2026',
  'The metadata, structured data, sitemaps and signals that actually move indexation and ranking.',
  [
    section([
      heading('A technical SEO playbook for 2026', '1'),
      text(
        '<p>SEO is not a plugin — it is plumbing. Canonical URLs normalized at the edge, hreflang with a real x-default, an Organization and Article JSON-LD graph, author pages for E-E-A-T, and sitemaps that carry images and news.</p><p>Google ranks on field data, so the boilerplate ships a RUM pipeline: real-user LCP/INP/CLS flow to Prometheus and a Grafana panel against Google&rsquo;s thresholds. Lab scores (Lighthouse 100) gate CI; field scores close the loop.</p>',
      ),
    ]),
    section([heading('The short list', '2'), text('<ul><li>Accurate <code>lastmod</code> and conditional 304s on sitemaps</li><li>IndexNow on publish for Bing-backed engines</li><li>max-image-preview:large for Discover and AI Overviews</li><li>Visible dates and bylines for freshness signals</li></ul>')], {
      maxWidth: '760px',
    }),
    section([button('Read more on the blog', '/blog', 'secondary')], { maxWidth: '640px', paddingY: '24px' }),
  ],
);

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
      settings: {
        indexNowKey: randomBytes(16).toString('hex'),
        org: { name: 'Demo CMS', sameAs: ['https://github.com'] },
      },
    })
    .onConflictDoUpdate({ target: sites.slug, set: { domains: ['localhost'] } })
    .returning();
  if (!site) throw new Error('seed: site upsert failed');

  const settings = site.settings as { indexNowKey?: string; org?: unknown };
  if (!settings.indexNowKey) {
    await db
      .update(sites)
      .set({ settings: { ...settings, indexNowKey: randomBytes(16).toString('hex') } })
      .where(eq(sites.id, site.id));
  }

  // demo author for E-E-A-T
  const [author] = await db
    .insert(authors)
    .values({
      siteId: site.id,
      slug: 'jane-doe',
      name: 'Jane Doe',
      bio: 'Staff engineer writing about high-load content platforms and technical SEO.',
      sameAs: ['https://github.com', 'https://www.linkedin.com'],
    })
    .onConflictDoUpdate({ target: [authors.siteId, authors.slug], set: { name: 'Jane Doe' } })
    .returning();

  interface PageOpts {
    kind?: 'page' | 'post';
    authorId?: string;
    publish?: boolean;
  }

  async function ensurePage(
    path: string,
    name: string,
    puck: ReturnType<typeof page>,
    opts: PageOpts = {},
  ) {
    const { kind = 'page', authorId, publish = true } = opts;
    const seo = {
      title: (puck.root.props.title as string) ?? name,
      description: (puck.root.props.description as string) ?? '',
    };

    let p = await db.query.pages.findFirst({
      where: and(eq(pages.siteId, site!.id), eq(pages.path, path)),
    });
    if (!p) {
      [p] = await db
        .insert(pages)
        .values({
          siteId: site!.id,
          path,
          name,
          kind,
          author: authorId ? author!.name : null,
          authorId: authorId ?? null,
          firstPublishedAt: publish ? new Date() : null,
        })
        .returning();
    } else {
      await db
        .update(pages)
        .set({ kind, authorId: authorId ?? null, author: authorId ? author!.name : null })
        .where(eq(pages.id, p.id));
    }
    if (!p) throw new Error('seed: page insert failed');

    let locale = await db.query.pageLocales.findFirst({
      where: and(eq(pageLocales.pageId, p.id), eq(pageLocales.locale, 'en')),
    });
    if (!locale) {
      [locale] = await db.insert(pageLocales).values({ pageId: p.id, locale: 'en' }).returning();
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
          puckData: puck,
          status: publish ? 'published' : 'draft',
          createdBy: 'system',
        })
        .returning();
    } else {
      await db.update(pageVersions).set({ puckData: puck }).where(eq(pageVersions.id, version.id));
    }
    if (!version) throw new Error('seed: version insert failed');

    if (publish) {
      const searchText = [seo.title, seo.description].join(' ');
      await db
        .insert(publishedPages)
        .values({ siteId: site!.id, locale: 'en', path, pageId: p.id, versionId: version.id, puckData: puck, seo, searchText })
        .onConflictDoUpdate({
          target: [publishedPages.siteId, publishedPages.locale, publishedPages.path],
          set: { puckData: puck, seo, searchText, versionId: version.id },
        });
    }
  }

  await ensurePage('/', 'Home', homePage);
  await ensurePage('/about', 'About', aboutPage);
  await ensurePage('/features', 'Features', featuresPage);
  await ensurePage('/blog', 'Blog', blogIndexPage);
  await ensurePage('/blog/launching-the-cms', 'Launching the CMS', post1, { kind: 'post', authorId: author!.id });
  await ensurePage('/blog/high-load-read-path', 'High-load read path', post2, { kind: 'post', authorId: author!.id });
  await ensurePage('/blog/seo-playbook-2026', 'SEO playbook 2026', post3, { kind: 'post', authorId: author!.id });

  console.log('seed: done — demo site with home, about, features, blog + 3 posts (author jane-doe), all published');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
