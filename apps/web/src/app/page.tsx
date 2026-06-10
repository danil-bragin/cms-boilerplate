import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getSiteByHost } from '@/lib/page-data';

export default async function RootRedirect() {
  const host = (await headers()).get('host') ?? 'localhost';
  const site = await getSiteByHost(host);
  if (!site) notFound();
  redirect(`/${site.defaultLocale}`);
}
