interface JsonLdProps {
  site: {
    name: string;
    origin: string;
    org?: { name?: string; logoUrl?: string; sameAs?: string[] };
  };
  page: {
    title: string;
    description: string;
    url: string;
    locale: string;
    path: string;
    publishedAt: Date;
    kind?: 'page' | 'post';
    author?: string | null;
    firstPublishedAt?: Date | null;
    image?: string;
    isHome?: boolean;
    authorUrl?: string;
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
        name: site.org?.name ?? site.name,
        inLanguage: page.locale,
        ...(site.org ? { publisher: { '@id': `${site.origin}/#organization` } } : {}),
      },
      ...(site.org
        ? [
            {
              '@type': 'Organization',
              '@id': `${site.origin}/#organization`,
              name: site.org.name ?? site.name,
              url: site.origin,
              ...(site.org.logoUrl ? { logo: site.org.logoUrl } : {}),
              ...(site.org.sameAs?.length ? { sameAs: site.org.sameAs } : {}),
            },
          ]
        : []),
      {
        '@type': 'WebPage',
        '@id': `${page.url}/#webpage`,
        url: page.url,
        name: page.title,
        description: page.description,
        inLanguage: page.locale,
        datePublished: (page.firstPublishedAt ?? page.publishedAt).toISOString(),
        dateModified: page.publishedAt.toISOString(),
        isPartOf: { '@id': `${site.origin}/#website` },
      },
      ...(page.kind === 'post'
        ? [
            {
              '@type': 'Article',
              '@id': `${page.url}/#article`,
              headline: page.title,
              description: page.description,
              inLanguage: page.locale,
              datePublished: (page.firstPublishedAt ?? page.publishedAt).toISOString(),
              dateModified: page.publishedAt.toISOString(),
              mainEntityOfPage: { '@id': `${page.url}/#webpage` },
              ...(page.author
                ? {
                    author: {
                      '@type': 'Person',
                      name: page.author,
                      ...(page.authorUrl ? { url: page.authorUrl } : {}),
                    },
                  }
                : {}),
              ...(page.image
                ? { image: [{ '@type': 'ImageObject', url: page.image, width: 1200, height: 630 }] }
                : {}),
              ...(site.org ? { publisher: { '@id': `${site.origin}/#organization` } } : {}),
            },
          ]
        : []),
      ...(page.isHome
        ? []
        : [{
        '@type': 'BreadcrumbList',
        '@id': `${page.url}/#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: site.name,
            item: `${site.origin}/${page.locale}`,
          },
          ...breadcrumbs,
        ],
      }]),
    ],
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
  );
}
