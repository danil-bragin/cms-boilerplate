import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Render } from '@puckeditor/core/rsc';
import { renderConfig } from '@cms/puck-config/render';
import '@/lib/images.server';
import { getPublishedAlternates, getPublishedPage } from '@/lib/page-data';

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

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { siteId, locale, path } = await params;
  const page = await resolvePage(siteId, locale, pagePath(path));
  if (!page) return {};
  const alternates = await getPublishedAlternates(page.pageId);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    title: page.seo.title,
    description: page.seo.description,
    alternates: {
      canonical: `${base}/${page.locale}${page.path === '/' ? '' : page.path}`,
      languages: Object.fromEntries(
        alternates.map((a) => [a.locale, `${base}/${a.locale}${a.path === '/' ? '' : a.path}`]),
      ),
    },
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { siteId, locale, path } = await params;
  const page = await resolvePage(siteId, locale, pagePath(path));
  if (!page) notFound();
  return <Render config={renderConfig} data={page.puckData as never} />;
}
