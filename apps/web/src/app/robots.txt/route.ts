import { NextResponse, type NextRequest } from 'next/server';
import { sites } from '@cms/db';
import { db } from '@/lib/db';
import { siteOrigin } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/**
 * Bots that scrape for model TRAINING only. Blocking them does not affect
 * AI search visibility — search indexers (OAI-SearchBot, Claude-SearchBot,
 * PerplexityBot) and user-triggered fetchers stay allowed regardless,
 * because being citable in AI answers is traffic.
 */
const AI_TRAINING_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'FacebookBot',
  'CCBot',
  'Bytespider',
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const allSites = await db().select().from(sites);
  const site = allSites.find((s) => s.domains.includes(host));
  if (!site) {
    return new NextResponse('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain' },
    });
  }

  const origin = siteOrigin({ ...site, settings: site.settings as Record<string, unknown> });
  const settings = site.settings as { seo?: { blockAiTraining?: boolean } };

  const lines = [
    'User-agent: *',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /preview/',
    'Disallow: /s/',
    '',
  ];

  if (settings.seo?.blockAiTraining) {
    for (const bot of AI_TRAINING_BOTS) {
      lines.push(`User-agent: ${bot}`, 'Disallow: /', '');
    }
  }

  lines.push(`Sitemap: ${origin}/sitemap.xml`, '');

  return new NextResponse(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, s-maxage=3600',
    },
  });
}
