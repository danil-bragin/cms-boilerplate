import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Render } from '@puckeditor/core/rsc';
import { renderConfig } from '@cms/puck-config/render';
import '@/lib/images.server';
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

  // hreflang via link tags (single channel — not duplicated in the sitemap);
  // x-default points at the site's default locale when that variant exists
  const languages: Record<string, string> = Object.fromEntries(
    alternates.map((a) => [a.locale, publicUrl(origin, a.locale, a.path)]),
  );
  const defaultVariant = alternates.find((a) => a.locale === site.defaultLocale);
  if (defaultVariant) {
    languages['x-default'] = publicUrl(origin, defaultVariant.locale, defaultVariant.path);
  }

  const title = page.seo.title ?? '';
  const description = page.seo.description ?? '';
  const ogImage = `${origin}/og/${page.pageId}?locale=${page.locale}&v=${page.publishedAt.getTime()}`;

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
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: site.slug,
      title,
      description,
      locale: page.locale,
      alternateLocale: alternates.map((a) => a.locale).filter((l) => l !== page.locale),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { siteId, locale, path } = await params;
  const page = await resolvePage(siteId, locale, pagePath(path));
  if (!page) notFound();

  const site = await getSiteById(siteId);
  const origin = site ? siteOrigin(site) : '';

  return (
    <>
      {site && (
        <JsonLd
          site={{ name: site.slug, origin }}
          page={{
            title: page.seo.title ?? '',
            description: page.seo.description ?? '',
            url: publicUrl(origin, page.locale, page.path),
            locale: page.locale,
            path: page.path,
            publishedAt: page.publishedAt,
            kind: page.kind,
            author: page.author,
            firstPublishedAt: page.firstPublishedAt,
            image: `${origin}/og/${page.pageId}?locale=${page.locale}&v=${Date.parse(String(page.publishedAt))}`,
          }}
        />
      )}
      <Render config={renderConfig} data={page.puckData as never} />
    </>
  );
}
