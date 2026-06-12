import { randomBytes } from 'node:crypto';
import { createDb } from './client.js';
import {
  sites,
  users,
  pages,
  pageLocales,
  pageVersions,
  publishedPages,
  authors,
  menus,
  redirects,
  webhooks,
  scheduledPublishes,
} from './schema.js';
import { and, eq } from 'drizzle-orm';
import { seedMedia, type SeededMedia, type DemoMedia } from './seed-media.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://cms:cms@localhost:5433/cms';

// --- Puck content builders (mirror @cms/puck-config component props) ---

type Block = { type: string; props: Record<string, unknown> };
let blockSeq = 0;
const block = (type: string, props: Record<string, unknown>, children?: Record<string, unknown>): Block => ({
  type,
  props: { id: `${type}-${blockSeq++}`, ...props, ...children },
});

const mediaRef = (m: SeededMedia) => ({
  mediaId: m.mediaId,
  s3Key: m.s3Key,
  width: m.width,
  height: m.height,
  blurDataUrl: m.blurDataUrl,
  alt: m.alt,
  focalX: 50,
  focalY: 50,
});

// Like mediaRef but carries the inline LCP data-URI — use ONLY for the
// above-the-fold hero image (one per page) so the rest of the page's media
// refs don't bloat the HTML/snapshot.
const lcpMediaRef = (m: SeededMedia) => ({ ...mediaRef(m), lcpInline: m.lcpInline });

const heading = (text: string, level: '1' | '2' | '3' | '4') => block('Heading', { text, level });
const text = (html: string) => block('Text', { text: html });
const image = (m: SeededMedia, opts: { ratio?: string; rounded?: boolean; priority?: boolean } = {}) =>
  block('Image', { media: mediaRef(m), alt: m.alt, rounded: opts.rounded ?? true, priority: opts.priority ?? false, ratio: opts.ratio ?? 'auto' });
const section = (
  children: Block[],
  opts: { maxWidth?: string; paddingY?: string; background?: 'default' | 'muted' | 'dark' } = {},
) =>
  block(
    'Section',
    { maxWidth: opts.maxWidth ?? '960px', paddingY: opts.paddingY ?? '48px', background: opts.background ?? 'default' },
    { children },
  );
const columns = (cols: Block[][], gap: '16px' | '32px' = '32px') =>
  block(
    'Columns',
    { columns: String(cols.length), gap },
    { col1: cols[0] ?? [], col2: cols[1] ?? [], col3: cols[2] ?? [], col4: cols[3] ?? [] },
  );
const search = (placeholder: string) => block('Search', { placeholder });
const postList = (h: string, limit: number, paginated = false) =>
  block('PostList', { heading: h, limit, paginated });
const hero = (props: {
  eyebrow?: string;
  heading: string;
  subtext?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  image?: SeededMedia;
  backgroundImage?: SeededMedia;
}) =>
  block('Hero', {
    eyebrow: props.eyebrow ?? '',
    heading: props.heading,
    subtext: props.subtext ?? '',
    primaryLabel: props.primaryLabel ?? '',
    primaryHref: props.primaryHref ?? '#',
    secondaryLabel: props.secondaryLabel ?? '',
    secondaryHref: props.secondaryHref ?? '#',
    ...(props.image ? { image: lcpMediaRef(props.image) } : {}),
    ...(props.backgroundImage ? { backgroundImage: mediaRef(props.backgroundImage) } : {}),
  });
const card = (m: SeededMedia | undefined, h: string, t: string, href = '') =>
  block('Card', { ...(m ? { image: mediaRef(m) } : {}), heading: h, text: t, href });
const stats = (items: Array<{ value: string; label: string }>) => block('Stats', { items });
const ctaBanner = (h: string, subtext: string, buttonLabel: string, buttonHref: string) =>
  block('CTABanner', { heading: h, subtext, buttonLabel, buttonHref });

const page = (title: string, description: string, content: Block[], ogImage?: SeededMedia) => ({
  root: { props: { title, description, ...(ogImage ? { ogImage: mediaRef(ogImage) } : {}) } },
  content,
  zones: {},
});

// --- example pages (localized) ---

export type Locale = 'en' | 'de';

// All page copy lives in one table per locale so the page structure stays
// single-source and every locale renders identical components.
interface Copy {
  home: {
    title: string; description: string;
    heroEyebrow: string; heroHeading: string; heroSubtext: string;
    primary: string; secondary: string;
    stats: Array<{ value: string; label: string }>;
    pillarsHeading: string; pillarsIntro: string;
    cards: Array<[string, string]>;
    searchHeading: string; searchIntro: string; searchPlaceholder: string;
    ctaHeading: string; ctaSubtext: string; ctaButton: string;
  };
  about: {
    title: string; description: string;
    heroEyebrow: string; heroHeading: string; heroSubtext: string; primary: string;
    cards: Array<[string, string]>;
    ctaHeading: string; ctaSubtext: string; ctaButton: string;
  };
  features: {
    title: string; description: string;
    heroEyebrow: string; heroHeading: string; heroSubtext: string;
    cards: Array<[string, string]>;
    ctaHeading: string; ctaSubtext: string; ctaButton: string;
  };
  blog: {
    title: string; description: string;
    heroEyebrow: string; heroHeading: string; heroSubtext: string;
    searchPlaceholder: string; postListHeading: string;
  };
  post1: { title: string; description: string; h1: string; body: string; ctaHeading: string; ctaSubtext: string; ctaButton: string };
  post2: { title: string; description: string; h1: string; body: string; stats: Array<{ value: string; label: string }>; closing: string };
  post3: { title: string; description: string; h1: string; body: string; list: string };
}

const EN: Copy = {
  home: {
    title: 'Modern CMS Boilerplate',
    description: 'A production-grade, high-load CMS boilerplate — Puck visual editing, Next.js render, NestJS API, full technical SEO.',
    heroEyebrow: 'Open-source · Self-hosted',
    heroHeading: 'Build content sites that win on speed and SEO',
    heroSubtext: 'Visual page building with Puck, a Next.js render layer that serves cached pages from shared Redis, a NestJS content API, and a complete technical-SEO arsenal — measured under load, not just claimed.',
    primary: 'Open the admin', secondary: 'Read the blog',
    stats: [
      { value: '290', label: 'req/s sustained' },
      { value: '16ms', label: 'p95 latency' },
      { value: '100', label: 'Lighthouse score' },
      { value: '0.05%', label: 'errors under chaos' },
    ],
    pillarsHeading: 'Everything a content team needs',
    pillarsIntro: 'Three pillars, every one production-grade and verified.',
    cards: [
      ['Visual editing', 'Drag-and-drop pages with Puck, autosave, version history with diff, scheduled publishing and rollback.'],
      ['High-load read path', 'Full-page ISR in shared Redis, fast-404 at the edge, cross-replica invalidation. ~290 rps, p95 16ms, proven.'],
      ['Maximum SEO', 'Metadata, JSON-LD, hreflang, OG images, sitemaps with image & news, RSS, IndexNow, GSC monitoring, RUM CWV.'],
    ],
    searchHeading: 'Search the site',
    searchIntro: 'Full-text search powered by Postgres, ranked with snippet highlighting.',
    searchPlaceholder: 'Search posts and pages…',
    ctaHeading: 'Ready to explore?', ctaSubtext: 'Log in to the admin and edit any of these pages live with the visual editor.', ctaButton: 'Go to the admin →',
  },
  about: {
    title: 'About this boilerplate',
    description: 'Why this CMS boilerplate exists and what it is built for.',
    heroEyebrow: 'About', heroHeading: 'A reference implementation, not a toy',
    heroSubtext: 'Every architectural claim — cross-replica cache invalidation, graceful degradation when Redis dies, field Core Web Vitals — is verified, not asserted.',
    primary: 'See the features',
    cards: [
      ['Built for scale', 'Read traffic is served from a shared Redis page cache; Postgres is touched only on cache fill. The write path is isolated and rate-limited. Multi-tenant from day one.'],
      ['Built for ranking', 'Canonical normalization, hreflang with x-default, Article and Organization schema, author E-E-A-T pages, news and image sitemaps — the full 2026 technical-SEO surface.'],
    ],
    ctaHeading: 'Take it for a spin', ctaSubtext: 'Clone the repo, run docker compose, seed the demo.', ctaButton: 'Open the admin',
  },
  features: {
    title: 'Features',
    description: 'Editor, performance, SEO, security and operations — what is in the box.',
    heroEyebrow: 'Features', heroHeading: 'Everything in the box', heroSubtext: 'A tour of what ships, across four areas.',
    cards: [
      ['Editor', 'Puck visual builder, rich text, media library with focal-point cropping, version diff, scheduled publishing, bulk operations, localized admin (EN/DE).'],
      ['Performance', 'Full-page ISR, hardened Redis cache handler, Speculation Rules prerender, view transitions, LCP image preload, AVIF/WebP via imgproxy, Lighthouse 100.'],
      ['SEO', 'Per-page metadata, JSON-LD graph, dynamic OG images, sitemaps (sharded + image + news), RSS, IndexNow, Search Console URL inspection, RUM field vitals.'],
      ['Operations', 'Helm chart, OpenTelemetry to Prometheus/Jaeger/Grafana, CDN purge, webhooks, k6 load stand, CI with lint + tests + migration checks.'],
    ],
    ctaHeading: 'See it live', ctaSubtext: 'Open the admin and start building.', ctaButton: 'Open the admin',
  },
  blog: {
    title: 'Blog',
    description: 'Articles on building high-load, SEO-first content sites.',
    heroEyebrow: 'Blog', heroHeading: 'Notes from the build', heroSubtext: 'On high-load architecture, technical SEO, and shipping a CMS.',
    searchPlaceholder: 'Search the blog…', postListHeading: 'All posts',
  },
  post1: {
    title: 'Launching the CMS boilerplate',
    description: 'What this project is, who it is for, and how to get started in five minutes.',
    h1: 'Launching the CMS boilerplate',
    body: '<p>After many iterations, the boilerplate is feature-complete: a visual editor, a cached render layer, a content API, and a technical-SEO stack that has been audited end to end.</p><p>Clone it, run <code>docker compose up</code>, seed the demo, and you have a multi-tenant CMS serving cached pages in milliseconds. Every page you are reading was built with the same Puck components available in the editor.</p>',
    ctaHeading: 'Try it now', ctaSubtext: 'Open the admin, edit this post, and publish.', ctaButton: 'Open the admin',
  },
  post2: {
    title: 'The high-load read path, explained',
    description: 'How published pages are served from a shared Redis cache and stay fast under load — with the numbers.',
    h1: 'The high-load read path, explained',
    body: '<p>Public pages are denormalized into a single snapshot row and rendered once, then cached as full HTML in Redis shared by every replica. A cache hit costs zero React work. The proxy resolves the host and rejects unknown paths at the edge before any rendering.</p>',
    stats: [
      { value: '~290', label: 'req/s' },
      { value: '16ms', label: 'p95 latency' },
      { value: '0.05%', label: 'errors under chaos' },
    ],
    closing: '<p>Publishing invalidates exactly the affected tags; the invalidation reaches every replica through the shared cache. Read-your-writes, no stampede.</p>',
  },
  post3: {
    title: 'A technical SEO playbook for 2026',
    description: 'The metadata, structured data, sitemaps and signals that actually move indexation and ranking.',
    h1: 'A technical SEO playbook for 2026',
    body: '<p>SEO is not a plugin — it is plumbing. Canonical URLs normalized at the edge, hreflang with a real x-default, an Organization and Article JSON-LD graph, author pages for E-E-A-T, and sitemaps that carry images and news.</p><p>Google ranks on field data, so the boilerplate ships a RUM pipeline: real-user LCP/INP/CLS flow to Prometheus and a Grafana panel against Google&rsquo;s thresholds. Lab scores (Lighthouse 100) gate CI; field scores close the loop.</p>',
    list: '<p>The short list:</p><ul><li>Accurate <code>lastmod</code> and conditional 304s on sitemaps</li><li>IndexNow on publish for Bing-backed engines</li><li>max-image-preview:large for Discover and AI Overviews</li><li>Visible dates and bylines for freshness signals</li></ul>',
  },
};

const DE: Copy = {
  home: {
    title: 'Modernes CMS-Boilerplate',
    description: 'Ein produktionsreifes CMS-Boilerplate für hohe Last — visuelles Bearbeiten mit Puck, Next.js-Rendering, NestJS-API, vollständiges technisches SEO.',
    heroEyebrow: 'Open Source · Selbst gehostet',
    heroHeading: 'Content-Seiten, die bei Geschwindigkeit und SEO gewinnen',
    heroSubtext: 'Visueller Seitenaufbau mit Puck, eine Next.js-Render-Schicht, die zwischengespeicherte Seiten aus gemeinsamem Redis liefert, eine NestJS-Content-API und ein komplettes technisches SEO-Arsenal — unter Last gemessen, nicht nur behauptet.',
    primary: 'Zum Admin', secondary: 'Zum Blog',
    stats: [
      { value: '290', label: 'Req/s dauerhaft' },
      { value: '16ms', label: 'p95-Latenz' },
      { value: '100', label: 'Lighthouse-Score' },
      { value: '0,05%', label: 'Fehler unter Chaos' },
    ],
    pillarsHeading: 'Alles, was ein Content-Team braucht',
    pillarsIntro: 'Drei Säulen, jede produktionsreif und verifiziert.',
    cards: [
      ['Visuelles Bearbeiten', 'Drag-and-Drop-Seiten mit Puck, Autospeichern, Versionsverlauf mit Diff, geplantes Veröffentlichen und Rollback.'],
      ['Lese-Pfad für hohe Last', 'Ganzseitiges ISR im gemeinsamen Redis, Fast-404 am Edge, replikatübergreifende Invalidierung. ~290 Req/s, p95 16 ms, bewiesen.'],
      ['Maximales SEO', 'Metadaten, JSON-LD, hreflang, OG-Bilder, Sitemaps mit Bild & News, RSS, IndexNow, GSC-Monitoring, RUM-CWV.'],
    ],
    searchHeading: 'Website durchsuchen',
    searchIntro: 'Volltextsuche auf Basis von Postgres, gewichtet mit Snippet-Hervorhebung.',
    searchPlaceholder: 'Beiträge und Seiten durchsuchen…',
    ctaHeading: 'Bereit zum Entdecken?', ctaSubtext: 'Melde dich im Admin an und bearbeite jede dieser Seiten live mit dem visuellen Editor.', ctaButton: 'Zum Admin →',
  },
  about: {
    title: 'Über dieses Boilerplate',
    description: 'Warum dieses CMS-Boilerplate existiert und wofür es gebaut ist.',
    heroEyebrow: 'Über uns', heroHeading: 'Eine Referenzimplementierung, kein Spielzeug',
    heroSubtext: 'Jede Architektur-Aussage — replikatübergreifende Cache-Invalidierung, geordneter Abbau bei Redis-Ausfall, Core Web Vitals aus dem Feld — ist verifiziert, nicht behauptet.',
    primary: 'Funktionen ansehen',
    cards: [
      ['Für Skalierung gebaut', 'Lese-Traffic wird aus einem gemeinsamen Redis-Seiten-Cache bedient; Postgres wird nur beim Cache-Füllen berührt. Der Schreibpfad ist isoliert und rate-limitiert. Mandantenfähig ab Tag eins.'],
      ['Für Ranking gebaut', 'Canonical-Normalisierung, hreflang mit x-default, Article- und Organization-Schema, Autoren-Seiten für E-E-A-T, News- und Bild-Sitemaps — die volle technische SEO-Oberfläche für 2026.'],
    ],
    ctaHeading: 'Probier es aus', ctaSubtext: 'Repo klonen, docker compose starten, Demo seeden.', ctaButton: 'Zum Admin',
  },
  features: {
    title: 'Funktionen',
    description: 'Editor, Performance, SEO, Sicherheit und Betrieb — was drin ist.',
    heroEyebrow: 'Funktionen', heroHeading: 'Alles mit an Bord', heroSubtext: 'Ein Rundgang durch das, was mitgeliefert wird — in vier Bereichen.',
    cards: [
      ['Editor', 'Visueller Puck-Builder, Rich Text, Medienbibliothek mit Fokuspunkt-Zuschnitt, Versions-Diff, geplantes Veröffentlichen, Massenaktionen, lokalisierter Admin (EN/DE).'],
      ['Performance', 'Ganzseitiges ISR, gehärteter Redis-Cache-Handler, Speculation-Rules-Prerender, View Transitions, LCP-Bild-Preload, AVIF/WebP via imgproxy, Lighthouse 100.'],
      ['SEO', 'Metadaten pro Seite, JSON-LD-Graph, dynamische OG-Bilder, Sitemaps (sharded + Bild + News), RSS, IndexNow, Search-Console-URL-Inspektion, RUM-Feld-Vitals.'],
      ['Betrieb', 'Helm-Chart, OpenTelemetry zu Prometheus/Jaeger/Grafana, CDN-Purge, Webhooks, k6-Last-Stand, CI mit Lint + Tests + Migrations-Checks.'],
    ],
    ctaHeading: 'Live ansehen', ctaSubtext: 'Öffne den Admin und fang an zu bauen.', ctaButton: 'Zum Admin',
  },
  blog: {
    title: 'Blog',
    description: 'Artikel über den Bau von Content-Seiten für hohe Last mit SEO-Fokus.',
    heroEyebrow: 'Blog', heroHeading: 'Notizen aus dem Bau', heroSubtext: 'Über Architektur für hohe Last, technisches SEO und das Ausliefern eines CMS.',
    searchPlaceholder: 'Blog durchsuchen…', postListHeading: 'Alle Beiträge',
  },
  post1: {
    title: 'Start des CMS-Boilerplates',
    description: 'Was dieses Projekt ist, für wen es gedacht ist und wie man in fünf Minuten loslegt.',
    h1: 'Start des CMS-Boilerplates',
    body: '<p>Nach vielen Iterationen ist das Boilerplate funktionsvollständig: ein visueller Editor, eine zwischengespeicherte Render-Schicht, eine Content-API und ein technischer SEO-Stack, der Ende zu Ende auditiert wurde.</p><p>Klonen, <code>docker compose up</code> ausführen, die Demo seeden — und schon hast du ein mandantenfähiges CMS, das zwischengespeicherte Seiten in Millisekunden ausliefert. Jede Seite, die du liest, wurde mit denselben Puck-Komponenten gebaut, die im Editor verfügbar sind.</p>',
    ctaHeading: 'Jetzt ausprobieren', ctaSubtext: 'Öffne den Admin, bearbeite diesen Beitrag und veröffentliche.', ctaButton: 'Zum Admin',
  },
  post2: {
    title: 'Der Lese-Pfad für hohe Last, erklärt',
    description: 'Wie veröffentlichte Seiten aus einem gemeinsamen Redis-Cache bedient werden und unter Last schnell bleiben — mit den Zahlen.',
    h1: 'Der Lese-Pfad für hohe Last, erklärt',
    body: '<p>Öffentliche Seiten werden in eine einzige Snapshot-Zeile denormalisiert, einmal gerendert und dann als vollständiges HTML in einem von allen Replikaten geteilten Redis zwischengespeichert. Ein Cache-Treffer kostet null React-Arbeit. Der Proxy löst den Host auf und weist unbekannte Pfade am Edge ab, bevor irgendetwas gerendert wird.</p>',
    stats: [
      { value: '~290', label: 'Req/s' },
      { value: '16ms', label: 'p95-Latenz' },
      { value: '0,05%', label: 'Fehler unter Chaos' },
    ],
    closing: '<p>Das Veröffentlichen invalidiert genau die betroffenen Tags; die Invalidierung erreicht jedes Replikat über den gemeinsamen Cache. Read-your-writes, kein Stampede.</p>',
  },
  post3: {
    title: 'Ein technisches SEO-Playbook für 2026',
    description: 'Die Metadaten, strukturierten Daten, Sitemaps und Signale, die Indexierung und Ranking wirklich bewegen.',
    h1: 'Ein technisches SEO-Playbook für 2026',
    body: '<p>SEO ist kein Plugin — es ist Installation. Canonical-URLs am Edge normalisiert, hreflang mit echtem x-default, ein Organization- und Article-JSON-LD-Graph, Autoren-Seiten für E-E-A-T und Sitemaps, die Bilder und News transportieren.</p><p>Google rankt nach Felddaten, also liefert das Boilerplate eine RUM-Pipeline: echte Nutzer-LCP/INP/CLS fließen zu Prometheus und in ein Grafana-Panel gegen Googles Schwellen. Laborwerte (Lighthouse 100) gaten die CI; Felddaten schließen den Kreis.</p>',
    list: '<p>Die Kurzliste:</p><ul><li>Genaues <code>lastmod</code> und bedingte 304s bei Sitemaps</li><li>IndexNow beim Veröffentlichen für Bing-gestützte Engines</li><li>max-image-preview:large für Discover und AI Overviews</li><li>Sichtbare Daten und Bylines als Frische-Signale</li></ul>',
  },
};

const COPY: Record<Locale, Copy> = { en: EN, de: DE };

function buildPages(m: DemoMedia, locale: Locale) {
  const t = COPY[locale];
  // locale-prefix internal page links so they resolve through the proxy
  const lp = (p: string) => (p === '/' ? `/${locale}` : `/${locale}${p}`);

  const homePage = page(
    t.home.title,
    t.home.description,
    [
      hero({
        eyebrow: t.home.heroEyebrow,
        heading: t.home.heroHeading,
        subtext: t.home.heroSubtext,
        primaryLabel: t.home.primary,
        primaryHref: '/admin',
        secondaryLabel: t.home.secondary,
        secondaryHref: lp('/blog'),
        image: m.product,
        backgroundImage: m.heroBg,
      }),
      section([stats(t.home.stats)], { maxWidth: '1100px', paddingY: '48px' }),
      section(
        [
          heading(t.home.pillarsHeading, '2'),
          text(`<p style="color:#5b6072">${t.home.pillarsIntro}</p>`),
          block('Section', { maxWidth: 'none', paddingY: '24px', background: 'default' }, {
            children: [
              columns([
                [card(m.feature1, t.home.cards[0]![0], t.home.cards[0]![1])],
                [card(m.feature2, t.home.cards[1]![0], t.home.cards[1]![1])],
                [card(m.feature3, t.home.cards[2]![0], t.home.cards[2]![1])],
              ], '32px'),
            ],
          }),
        ],
        { maxWidth: '1100px', paddingY: '64px', background: 'muted' },
      ),
      section(
        [
          heading(t.home.searchHeading, '2'),
          text(`<p style="color:#5b6072">${t.home.searchIntro}</p>`),
          search(t.home.searchPlaceholder),
        ],
        { maxWidth: '640px', paddingY: '64px' },
      ),
      section([ctaBanner(t.home.ctaHeading, t.home.ctaSubtext, t.home.ctaButton, '/admin')], {
        maxWidth: '1100px',
        paddingY: '64px',
      }),
    ],
    m.product,
  );

  const aboutPage = page(
    t.about.title,
    t.about.description,
    [
      hero({
        eyebrow: t.about.heroEyebrow,
        heading: t.about.heroHeading,
        subtext: t.about.heroSubtext,
        primaryLabel: t.about.primary,
        primaryHref: lp('/features'),
        backgroundImage: m.heroBg,
      }),
      section(
        [
          columns([
            [card(m.feature2, t.about.cards[0]![0], t.about.cards[0]![1])],
            [card(m.feature3, t.about.cards[1]![0], t.about.cards[1]![1])],
          ], '32px'),
        ],
        { maxWidth: '1000px', paddingY: '64px' },
      ),
      section([ctaBanner(t.about.ctaHeading, t.about.ctaSubtext, t.about.ctaButton, '/admin')], { maxWidth: '1000px', paddingY: '48px' }),
    ],
  );

  const featuresPage = page(
    t.features.title,
    t.features.description,
    [
      hero({ eyebrow: t.features.heroEyebrow, heading: t.features.heroHeading, subtext: t.features.heroSubtext, backgroundImage: m.heroBg }),
      section(
        [
          columns([
            [card(m.feature1, t.features.cards[0]![0], t.features.cards[0]![1])],
            [card(m.feature2, t.features.cards[1]![0], t.features.cards[1]![1])],
          ], '32px'),
          block('Section', { maxWidth: 'none', paddingY: '32px', background: 'default' }, {
            children: [columns([
              [card(m.feature3, t.features.cards[2]![0], t.features.cards[2]![1])],
              [card(m.product, t.features.cards[3]![0], t.features.cards[3]![1])],
            ], '32px')],
          }),
        ],
        { maxWidth: '1000px', paddingY: '64px' },
      ),
      section([ctaBanner(t.features.ctaHeading, t.features.ctaSubtext, t.features.ctaButton, '/admin')], { maxWidth: '1000px', paddingY: '48px' }),
    ],
  );

  const blogIndexPage = page(
    t.blog.title,
    t.blog.description,
    [
      hero({ eyebrow: t.blog.heroEyebrow, heading: t.blog.heroHeading, subtext: t.blog.heroSubtext, backgroundImage: m.heroBg }),
      section([search(t.blog.searchPlaceholder), postList(t.blog.postListHeading, 5, true)], { maxWidth: '820px', paddingY: '48px' }),
    ],
  );

  const post1 = page(
    t.post1.title,
    t.post1.description,
    [
      section([
        heading(t.post1.h1, '1'),
        ...(m.product ? [image(m.product, { rounded: true, priority: true })] : []),
        text(t.post1.body),
      ], { maxWidth: '760px' }),
      section([ctaBanner(t.post1.ctaHeading, t.post1.ctaSubtext, t.post1.ctaButton, '/admin')], { maxWidth: '760px', paddingY: '32px' }),
    ],
    m.product,
  );

  const post2 = page(
    t.post2.title,
    t.post2.description,
    [
      section([
        heading(t.post2.h1, '1'),
        text(t.post2.body),
      ], { maxWidth: '760px' }),
      section([stats(t.post2.stats)], { maxWidth: '900px', paddingY: '48px', background: 'muted' }),
      section([text(t.post2.closing)], { maxWidth: '760px' }),
    ],
    m.feature2,
  );

  const post3 = page(
    t.post3.title,
    t.post3.description,
    [
      section([
        heading(t.post3.h1, '1'),
        text(t.post3.body),
      ], { maxWidth: '760px' }),
      section([text(t.post3.list)], { maxWidth: '760px' }),
    ],
    m.feature3,
  );

  return { homePage, aboutPage, featuresPage, blogIndexPage, post1, post2, post3 };
}

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
        // serve the default locale instead of 404 when a requested locale page is missing
        localeFallback: true,
      },
    })
    .onConflictDoUpdate({ target: sites.slug, set: { domains: ['localhost'] } })
    .returning();
  if (!site) throw new Error('seed: site upsert failed');

  const settings = site.settings as { indexNowKey?: string; org?: unknown; localeFallback?: boolean };
  if (!settings.indexNowKey || settings.localeFallback !== true) {
    await db
      .update(sites)
      .set({ settings: { ...settings, indexNowKey: settings.indexNowKey ?? randomBytes(16).toString('hex'), localeFallback: true } })
      .where(eq(sites.id, site.id));
  }

  // generate + upload the demo media (hero/product/feature/avatar images)
  const m = await seedMedia(db, site.id);

  // demo author for E-E-A-T (with generated avatar)
  const [author] = await db
    .insert(authors)
    .values({
      siteId: site.id,
      slug: 'jane-doe',
      name: 'Jane Doe',
      bio: 'Staff engineer writing about high-load content platforms and technical SEO.',
      avatarKey: m.avatarJane?.s3Key ?? null,
      sameAs: ['https://github.com', 'https://www.linkedin.com'],
    })
    .onConflictDoUpdate({ target: [authors.siteId, authors.slug], set: { name: 'Jane Doe', avatarKey: m.avatarJane?.s3Key ?? null } })
    .returning();

  const en = buildPages(m, 'en');
  const de = buildPages(m, 'de');
  // localized content per page path: { en, de }
  const tr = (k: keyof typeof en): Record<Locale, ReturnType<typeof page>> => ({ en: en[k], de: de[k] });

  interface PageOpts {
    kind?: 'page' | 'post';
    authorId?: string;
    publish?: boolean;
  }

  // Writes the locale-agnostic page row plus one page_locale + version + published
  // snapshot per locale, so /en/<path> and /de/<path> both serve and hreflang
  // alternates (built from published_pages sharing page_id) link them together.
  async function ensurePage(
    path: string,
    name: string,
    translations: Record<Locale, ReturnType<typeof page>>,
    opts: PageOpts = {},
  ): Promise<string> {
    const { kind = 'page', authorId, publish = true } = opts;

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

    for (const loc of Object.keys(translations) as Locale[]) {
      const puck = translations[loc];
      const seo = {
        title: (puck.root.props.title as string) ?? name,
        description: (puck.root.props.description as string) ?? '',
      };

      let locale = await db.query.pageLocales.findFirst({
        where: and(eq(pageLocales.pageId, p.id), eq(pageLocales.locale, loc)),
      });
      if (!locale) {
        [locale] = await db.insert(pageLocales).values({ pageId: p.id, locale: loc }).returning();
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
          .values({ siteId: site!.id, locale: loc, path, pageId: p.id, versionId: version.id, puckData: puck, seo, searchText })
          .onConflictDoUpdate({
            target: [publishedPages.siteId, publishedPages.locale, publishedPages.path],
            set: { puckData: puck, seo, searchText, versionId: version.id },
          });
      }
    }
    return p.id;
  }

  await ensurePage('/', 'Home', tr('homePage'));
  await ensurePage('/about', 'About', tr('aboutPage'));
  await ensurePage('/features', 'Features', tr('featuresPage'));
  await ensurePage('/blog', 'Blog', tr('blogIndexPage'));
  await ensurePage('/blog/launching-the-cms', 'Launching the CMS', tr('post1'), { kind: 'post', authorId: author!.id });
  await ensurePage('/blog/high-load-read-path', 'High-load read path', tr('post2'), { kind: 'post', authorId: author!.id });
  await ensurePage('/blog/seo-playbook-2026', 'SEO playbook 2026', tr('post3'), { kind: 'post', authorId: author!.id });

  // --- navigation menus (per-locale labels, consumed by getMenu / admin) ---
  const menuItems = [
    { label: { en: 'Home', de: 'Start' }, href: '/en', children: [] },
    { label: { en: 'About', de: 'Über uns' }, href: '/en/about', children: [] },
    { label: { en: 'Features', de: 'Funktionen' }, href: '/en/features', children: [] },
    {
      label: { en: 'Blog', de: 'Blog' },
      href: '/en/blog',
      children: [
        { label: { en: 'Launching the CMS', de: 'Start des CMS' }, href: '/en/blog/launching-the-cms' },
        { label: { en: 'High-load read path', de: 'Lese-Pfad für hohe Last' }, href: '/en/blog/high-load-read-path' },
        { label: { en: 'SEO playbook 2026', de: 'SEO-Playbook 2026' }, href: '/en/blog/seo-playbook-2026' },
      ],
    },
  ];
  const footerItems = [
    { label: { en: 'About', de: 'Über uns' }, href: '/en/about', children: [] },
    { label: { en: 'Blog', de: 'Blog' }, href: '/en/blog', children: [] },
    { label: { en: 'Admin', de: 'Admin' }, href: '/admin', children: [] },
  ];
  for (const [slug, items] of [['main', menuItems], ['footer', footerItems]] as const) {
    await db
      .insert(menus)
      .values({ siteId: site.id, slug, items })
      .onConflictDoUpdate({ target: [menus.siteId, menus.slug], set: { items } });
  }

  // --- redirects (applied by the web proxy before render; locale-prefixed paths) ---
  const redirectRows = [
    { fromPath: '/en/old-about', toPath: '/en/about', status: '301' as const },
    { fromPath: '/de/alte-ueber-uns', toPath: '/de/about', status: '301' as const },
    { fromPath: '/en/home', toPath: '/en', status: '301' as const },
    { fromPath: '/en/docs', toPath: 'https://github.com', status: '302' as const },
  ];
  for (const r of redirectRows) {
    await db
      .insert(redirects)
      .values({ siteId: site.id, ...r, createdBy: 'system' })
      .onConflictDoUpdate({ target: [redirects.siteId, redirects.fromPath], set: { toPath: r.toPath, status: r.status } });
  }

  // --- outbound webhook (publish events; demo endpoint) ---
  const existingHook = await db.query.webhooks.findFirst({ where: eq(webhooks.siteId, site.id) });
  if (!existingHook) {
    await db.insert(webhooks).values({
      siteId: site.id,
      url: 'https://example.com/cms-webhook',
      secret: randomBytes(16).toString('hex'),
      events: ['page.published', 'page.unpublished'],
      active: true,
    });
  }

  // --- scheduled publish: a future-dated draft (v2) of the home page (en) ---
  const homeEnLocale = await db.query.pageLocales.findFirst({
    where: and(eq(pageLocales.pageId, (await db.query.pages.findFirst({ where: and(eq(pages.siteId, site.id), eq(pages.path, '/')) }))!.id), eq(pageLocales.locale, 'en')),
  });
  if (homeEnLocale) {
    const existingDraft = await db.query.pageVersions.findFirst({
      where: and(eq(pageVersions.pageLocaleId, homeEnLocale.id), eq(pageVersions.versionNo, 2)),
    });
    if (!existingDraft) {
      const [draft] = await db
        .insert(pageVersions)
        .values({ pageLocaleId: homeEnLocale.id, versionNo: 2, puckData: en.homePage, status: 'draft', createdBy: 'system' })
        .returning();
      const publishAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h
      await db.insert(scheduledPublishes).values({
        pageLocaleId: homeEnLocale.id,
        versionId: draft!.id,
        puckData: en.homePage,
        publishAt,
        status: 'pending',
        createdBy: 'system',
      });
    }
  }

  console.log(
    'seed: done — demo site (en+de): home, about, features, blog + 3 posts (author jane-doe), all published;\n' +
      '       + 2 menus (main/footer), 4 redirects, 1 webhook, 1 scheduled publish (+24h)',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
