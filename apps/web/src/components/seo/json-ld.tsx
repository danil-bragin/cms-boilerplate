interface JsonLdProps {
  site: { name: string; origin: string };
  page: {
    title: string;
    description: string;
    url: string;
    locale: string;
    path: string;
    publishedAt: Date;
  };
}

/**
 * WebSite + WebPage + BreadcrumbList JSON-LD.
 * SearchAction omitted: Google killed the sitelinks search box (Oct 2024);
 * WebSite itself still feeds site-name display. dateModified comes from the
 * real publish timestamp — accuracy matters (Google ignores fake dates).
 */
export function JsonLd({ site, page }: JsonLdProps) {
  const breadcrumbs = page.path
    .split('/')
    .filter(Boolean)
    .map((segment, i, all) => ({
      '@type': 'ListItem',
      position: i + 2,
      name: segment.replace(/-/g, ' '),
      item: `${site.origin}/${page.locale}/${all.slice(0, i + 1).join('/')}`,
    }));

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site.origin}/#website`,
        url: site.origin,
        name: site.name,
        inLanguage: page.locale,
      },
      {
        '@type': 'WebPage',
        '@id': `${page.url}/#webpage`,
        url: page.url,
        name: page.title,
        description: page.description,
        inLanguage: page.locale,
        dateModified: page.publishedAt.toISOString(),
        isPartOf: { '@id': `${site.origin}/#website` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: site.name,
            item: `${site.origin}/${page.locale}`,
          },
          ...breadcrumbs,
        ],
      },
    ],
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
  );
}
