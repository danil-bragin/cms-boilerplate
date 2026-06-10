import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Render } from '@puckeditor/core/rsc';
import { renderConfig } from '@cms/puck-config/render';
import '@/lib/images.server';
import { getPublishedAlternates, getPublishedPage, getSiteByHost } from '@/lib/page-data';

interface Params {
  locale: string;
  path?: string[];
}

async function resolvePage(params: Promise<Params>) {
  const { locale, path = [] } = await params;
  const host = (await headers()).get('host') ?? 'localhost';
  const site = await getSiteByHost(host);
  if (!site || !site.locales.includes(locale)) return null;
  const pagePath = '/' + path.join('/');
  const page = await getPublishedPage(site.id, locale, pagePath);
  return page ? { page, site } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const resolved = await resolvePage(params);
  if (!resolved) return {};
  const { page } = resolved;
  const alternates = await getPublishedAlternates(page.pageId, page.siteId);
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
  const resolved = await resolvePage(params);
  if (!resolved) notFound();
  return <Render config={renderConfig} data={resolved.page.puckData as never} />;
}
