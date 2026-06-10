import { ImageResponse } from 'next/og';
import { eq, and } from 'drizzle-orm';
import { publishedPages, sites } from '@cms/db';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Dynamic OG image (1200×630, the one spec every platform accepts).
 * URL is versioned with ?v=<publishedAt> so scraper caches (Facebook, Slack)
 * bust on republish; the response itself is immutable for CDNs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ pageId: string }> },
): Promise<Response> {
  const { pageId } = await params;
  const url = new URL(req.url);
  const locale = url.searchParams.get('locale') ?? '';

  const page = await db().query.publishedPages.findFirst({
    where: and(
      eq(publishedPages.pageId, pageId),
      ...(locale ? [eq(publishedPages.locale, locale)] : []),
    ),
  });
  if (!page) return new Response('Not found', { status: 404 });

  const site = await db().query.sites.findFirst({ where: eq(sites.id, page.siteId) });
  const seo = page.seo as { title?: string; description?: string };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 4 }}>
          {site?.slug ?? ''}
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.15, maxWidth: 1000 }}>
          {(seo.title ?? '').slice(0, 90)}
        </div>
        <div style={{ fontSize: 30, opacity: 0.85, maxWidth: 1000 }}>
          {(seo.description ?? '').slice(0, 140)}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'cache-control': 'public, immutable, no-transform, max-age=31536000',
      },
    },
  );
}
