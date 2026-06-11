import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Render } from '@puckeditor/core/rsc';
import { renderConfig } from '@cms/puck-config/render';
import '@/lib/images.server';
import { imageUrl } from '@cms/puck-config';
import { findPriorityImage } from '@/lib/lcp-preload';
import {
  getPublishedAlternates,
  getPublishedPage,
  getSiteById,
  siteOrigin,
} from '@/lib/page-data';
import { JsonLd } from '@/components/seo/json-ld';

/**
 * Internal route behind the proxy rewrite (/en/about → /s/{siteId}/en/about).
 * No request headers are read here, so the rendered HTML itself is cached
 * (ISR, revalidate=false → cache until tag invalidation) in the shared Redis
 * cache handler. A cache hit serves prerendered HTML — no React render at all.
 */
export const revalidate = false;
export const dynamicParams = true;

// empty list + dynamicParams=true → on-demand ISR: without generateStaticParams
// Next treats a dynamic segment as always-SSR and never caches the HTML
export async function generateStaticParams(): Promise<never[]> {
  return [];
}

interface Params {
  siteId: string;
  locale: string;
  path?: string[];
}

// dedupe between generateMetadata and the page render
const resolvePage = cache(async (siteId: string, locale: string, path: string) =>
  getPublishedPage(siteId, locale, path),
);

const pagePath = (path: string[] | undefined) => '/' + (path ?? []).join('/');

const publicUrl = (origin: string, locale: string, path: string) =>
  `${origin}/${locale}${path === '/' ? '' : path}`;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { siteId, locale, path } = await params;
  const page = await resolvePage(siteId, locale, pagePath(path));
  if (!page) return {};

  const site = await getSiteById(siteId);
  if (!site) return {};
  const origin = siteOrigin(site);
  const alternates = await getPublishedAlternates(page.pageId);
  const canonical = publicUrl(origin, page.locale, page.path);
  const seoSettings = (site.settings as { seo?: { googleVerification?: string; bingVerification?: string } }).seo ?? {};

  // hreflang via link tags (single channel — not duplicated in the sitemap);
  // x-default points at the site's default locale when that variant exists
  const languages: Record<string, string> = Object.fromEntries(
    alternates.map((a) => [a.locale, publicUrl(origin, a.locale, a.path)]),
  );
  // x-default → default-locale variant if published, else the first available
  // alternate (never leave a multilingual page without an x-default)
  const xDefault = alternates.find((a) => a.locale === site.defaultLocale) ?? alternates[0];
  if (xDefault) {
    languages['x-default'] = publicUrl(origin, xDefault.locale, xDefault.path);
  }

  const siteName = (site.settings as { org?: { name?: string } }).org?.name ?? site.slug;
  const pageTitle = page.seo.title || siteName;
  // brand suffix on inner pages, bare name on the homepage
  const title = page.path === '/' ? pageTitle : `${pageTitle} | ${siteName}`;
  const description = page.seo.description ?? '';
  // editor-chosen social image wins; generated text card is the fallback
  const ogImage = page.seo.ogImageKey
    ? imageUrl(page.seo.ogImageKey, { width: 1200, height: 630 })
    : `${origin}/og/${page.pageId}?locale=${page.locale}&v=${page.publishedAt.getTime()}`;

  return {
    metadataBase: new URL(origin),
    title,
    ...(description ? { description } : {}),
    alternates: {
      canonical,
      languages,
      types: { 'application/rss+xml': `${origin}/feed.xml?locale=${page.locale}` },
    },
    robots: {
      index: !(page.seo as { noindex?: boolean }).noindex,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName,
      title: pageTitle,
      description,
      locale: page.locale,
      alternateLocale: alternates.map((a) => a.locale).filter((l) => l !== page.locale),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
      images: [ogImage],
    },
    ...(seoSettings.googleVerification || seoSettings.bingVerification
      ? {
          verification: {
            ...(seoSettings.googleVerification ? { google: seoSettings.googleVerification } : {}),
            ...(seoSettings.bingVerification
              ? { other: { 'msvalidate.01': seoSettings.bingVerification } }
              : {}),
          },
        }
      : {}),
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { siteId, locale, path } = await params;
  const page = await resolvePage(siteId, locale, pagePath(path));
  if (!page) notFound();

  const site = await getSiteById(siteId);
  const origin = site ? siteOrigin(site) : '';
  const siteName = site
    ? ((site.settings as { org?: { name?: string } }).org?.name ?? site.slug)
    : '';

  // preload the above-the-fold (priority) image so the browser fetches it
  // immediately instead of discovering it deep in the parsed HTML
  const lcp = findPriorityImage(page.puckData);

  return (
    <>
      {lcp && (
        <link
          rel="preload"
          as="image"
          imageSrcSet={[640, 1280, 1920].map((w) => `${imageUrl(lcp, { width: w })} ${w}w`).join(', ')}
          imageSizes="(max-width: 768px) 100vw, 1280px"
        />
      )}
      {page.kind === 'post' && (
        <p style={{ color: '#888', fontSize: 14, margin: '0 0 16px' }}>
          {page.author && (
            <>
              By{' '}
              {page.authorSlug ? (
                <a href={`/${page.locale}/author/${page.authorSlug}`}>{page.author}</a>
              ) : (
                page.author
              )}{' '}
              ·{' '}
            </>
          )}
          <time dateTime={(page.firstPublishedAt ?? page.publishedAt).toISOString()}>
            {(page.firstPublishedAt ?? page.publishedAt).toLocaleDateString(page.locale)}
          </time>
        </p>
      )}
      {site && (
        <JsonLd
          site={{
            name: site.slug,
            origin,
            org: (site.settings as { org?: { name?: string; logoUrl?: string; sameAs?: string[] } }).org,
          }}
          page={{
            title: page.seo.title || siteName,
            description: page.seo.description ?? '',
            url: publicUrl(origin, page.locale, page.path),
            locale: page.locale,
            path: page.path,
            publishedAt: page.publishedAt,
            isHome: page.path === '/',
            kind: page.kind,
            author: page.author,
            firstPublishedAt: page.firstPublishedAt,
            authorUrl: page.authorSlug ? `${origin}/${page.locale}/author/${page.authorSlug}` : undefined,
            image: `${origin}/og/${page.pageId}?locale=${page.locale}&v=${Date.parse(String(page.publishedAt))}`,
          }}
        />
      )}
      <Render config={renderConfig} data={page.puckData as never} />
    </>
  );
}
