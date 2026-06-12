import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listPages, listSites } from '../actions';
import { PagesTable } from '@/components/admin/pages-table';
import { SiteSwitcher } from '@/components/admin/site-switcher';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function PagesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site: siteParam } = await searchParams;
  const sitesResult = await listSites();
  if (!sitesResult.ok || !sitesResult.data?.length) {
    return <p className="text-muted-foreground">No sites yet — create one in Settings → Sites first.</p>;
  }
  const sites = sitesResult.data;
  const site = sites.find((s) => s.id === siteParam) ?? sites[0]!;
  const pagesResult = await listPages(site.id);
  const pages = pagesResult.ok && pagesResult.data ? pagesResult.data : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
          <p className="text-sm text-muted-foreground">
            {site.slug} · {site.domains.join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sites.length > 1 && <SiteSwitcher sites={sites} current={site.id} basePath="/admin/pages" />}
          <Button asChild>
            <Link href={`/admin/pages/new?site=${site.id}`}>
              <Plus className="h-4 w-4" /> New page
            </Link>
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-5">
          <PagesTable site={site} pages={pages} />
        </CardContent>
      </Card>
    </div>
  );
}
