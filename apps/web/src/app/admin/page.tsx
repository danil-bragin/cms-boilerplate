import { listPages, listSites } from './actions';
import { CreatePageForm } from '@/components/admin/page-forms';
import { PagesTable } from '@/components/admin/pages-table';
import { Card, CardContent } from '@/components/ui/card';

export default async function AdminHome() {
  const sitesResult = await listSites();
  if (!sitesResult.ok || !sitesResult.data) {
    return <p className="text-destructive">Failed to load sites: {sitesResult.error?.message}</p>;
  }

  return (
    <div className="space-y-10">
      {await Promise.all(
        sitesResult.data.map(async (site) => {
          const pagesResult = await listPages(site.id);
          const pages = pagesResult.ok && pagesResult.data ? pagesResult.data : [];
          return (
            <section key={site.id}>
              <h2 className="mb-1 text-2xl font-semibold tracking-tight">{site.slug}</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {site.domains.join(', ')} · locales: {site.locales.join(', ')}
              </p>
              <Card className="mb-4">
                <CardContent className="pt-5">
                  <PagesTable site={site} pages={pages} />
                </CardContent>
              </Card>
              <CreatePageForm siteId={site.id} />
            </section>
          );
        }),
      )}
    </div>
  );
}
