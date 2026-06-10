import Link from 'next/link';
import type { LocaleSummary, PageSummary, SiteDto } from '@cms/contracts';
import { listPages, listSites } from './actions';
import { CreatePageForm, AddLocaleButton, SlugOverrideButton, PageRowActions } from '@/components/admin/page-forms';

function LocaleChip({ pageId, summary }: { pageId: string; summary: LocaleSummary }) {
  const published = summary.publishedVersionId !== null;
  return (
    <Link
      href={`/admin/edit/${summary.pageLocaleId}`}
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        marginRight: 6,
        borderRadius: 12,
        fontSize: 13,
        textDecoration: 'none',
        background: published ? '#e6f4ea' : '#fef7e0',
        color: published ? '#137333' : '#b06000',
        border: '1px solid ' + (published ? '#b7dfc2' : '#f3d19c'),
      }}
      title={`v${summary.latestVersionNo} ${summary.latestStatus}`}
    >
      {summary.locale} · v{summary.latestVersionNo} {published ? '●' : '○'}
    </Link>
  );
}

function PageRow({ page, site }: { page: PageSummary; site: SiteDto }) {
  const missing = site.locales.filter((l) => !page.locales.some((pl) => pl.locale === l));
  return (
    <tr style={{ borderTop: '1px solid #eee' }}>
      <td style={{ padding: 8, fontFamily: 'monospace' }}>
        {page.path}
        <PageRowActions pageId={page.id} path={page.path} />
      </td>
      <td style={{ padding: 8 }}>{page.name}</td>
      <td style={{ padding: 8 }}>
        {page.locales.map((l) => (
          <span key={l.pageLocaleId} style={{ whiteSpace: 'nowrap' }}>
            <LocaleChip pageId={page.id} summary={l} />
            <SlugOverrideButton pageLocaleId={l.pageLocaleId} locale={l.locale} current={l.slugOverride} />
          </span>
        ))}
        {missing.map((locale) => (
          <AddLocaleButton key={locale} pageId={page.id} locale={locale} />
        ))}
      </td>
    </tr>
  );
}

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
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#666', fontSize: 13 }}>
                    <th style={{ padding: 8 }}>Path</th>
                    <th style={{ padding: 8 }}>Name</th>
                    <th style={{ padding: 8 }}>Locales</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <PageRow key={p.id} page={p} site={site} />
                  ))}
                </tbody>
              </table>
              <CreatePageForm siteId={site.id} />
            </section>
          );
        }),
      )}
    </div>
  );
}
