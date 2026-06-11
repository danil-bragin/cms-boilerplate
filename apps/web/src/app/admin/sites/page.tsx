import { listSites } from '../actions';
import { SiteForm, SiteEditor } from '@/components/admin/site-forms';

export default async function SitesAdmin() {
  const sites = await listSites();

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">Sites</h2>
      {sites.ok && sites.data?.length === 0 && (
        <p style={{ color: '#888' }}>No sites yet — create your first one below.</p>
      )}
      {sites.ok && sites.data?.map((site) => <SiteEditor key={site.id} site={site} />)}
      <h3 className="mb-3 mt-8 text-lg font-semibold">Create site</h3>
      <SiteForm />
    </div>
  );
}
