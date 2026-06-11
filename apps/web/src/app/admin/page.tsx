import { listPages, listSites } from './actions';
import { CreatePageForm } from '@/components/admin/page-forms';
import { PagesTable } from '@/components/admin/pages-table';

export default async function AdminHome() {
  const sitesResult = await listSites();
  if (!sitesResult.ok || !sitesResult.data) {
    return <p style={{ padding: 24 }}>Failed to load sites: {sitesResult.error?.message}</p>;
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      {await Promise.all(
        sitesResult.data.map(async (site) => {
          const pagesResult = await listPages(site.id);
          const pages = pagesResult.ok && pagesResult.data ? pagesResult.data : [];
          return (
            <section key={site.id} style={{ marginBottom: 40 }}>
              <h2>
                {site.slug}{' '}
                <small style={{ fontWeight: 400, color: '#777' }}>
                  {site.domains.join(', ')} · locales: {site.locales.join(', ')}
                </small>
              </h2>
              <PagesTable site={site} pages={pages} />
              <CreatePageForm siteId={site.id} />
            </section>
          );
        }),
      )}
    </div>
  );
}
