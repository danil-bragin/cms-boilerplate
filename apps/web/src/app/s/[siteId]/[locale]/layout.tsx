import type { ReactNode } from 'react';
import { VitalsReporter } from '@/components/vitals-reporter';
import { renderCss } from '@cms/puck-config';

/**
 * Root layout for public pages (no app/layout.tsx above — this owns <html>).
 * Lives inside the [locale] segment so the lang attribute is correct per page.
 */

/**
 * Speculation Rules: Chrome prerenders/prefetches likely next pages on hover
 * or viewport heuristics (moderate eagerness, 2-slot FIFO — negligible server
 * load on an ISR site, Chrome p75 LCP for prerendered navigations is ~320ms).
 * Non-supporting browsers ignore the script. Same-document exclusions keep
 * admin/api out of speculation.
 */
const speculationRules = JSON.stringify({
  prefetch: [
    {
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: ['/admin/*', '/api/*', '/preview/*', '/og/*', '/s/*', '/*\\?*'] } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
  prerender: [
    {
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: ['/admin/*', '/api/*', '/preview/*', '/og/*', '/s/*', '/*\\?*'] } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
});

// cross-document view transitions: progressive enhancement (Chrome 126+, Safari 18.2+)
const globalCss = `
@view-transition { navigation: auto; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
`;

export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // When images are served same-origin (IMAGE_PUBLIC_BASE="/img" behind nginx),
  // the connection is already open — a cross-origin preconnect would be useless.
  const sameOriginImages = (process.env.IMAGE_PUBLIC_BASE ?? '').startsWith('/');
  const imgproxyOrigin = process.env.NEXT_PUBLIC_IMGPROXY_URL ?? process.env.IMGPROXY_URL;

  return (
    <html lang={locale}>
      <head>
        {!sameOriginImages && imgproxyOrigin && <link rel="preconnect" href={imgproxyOrigin} />}
        <meta name="theme-color" content="#1a1a2e" />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
        <style dangerouslySetInnerHTML={{ __html: renderCss }} />
        <script type="speculationrules" dangerouslySetInnerHTML={{ __html: speculationRules }} />
      </head>
      <body>
        {children}
        <VitalsReporter />
      </body>
    </html>
  );
}
