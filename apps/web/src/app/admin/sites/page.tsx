import { listSites } from '../actions';
import { SiteForm, SiteEditor } from '@/components/admin/site-forms';

export default async function SitesAdmin() {
  const sites = await listSites();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Sites</h2>
      {sites.ok &&
        sites.data?.map((site) => <SiteEditor key={site.id} site={site} />)}
      <h3 style={{ marginTop: 32 }}>Create site</h3>
      <SiteForm />
    </div>
  );
}
