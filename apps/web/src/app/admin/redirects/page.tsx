import { listSites } from '../actions';
import { RedirectsManager } from '@/components/admin/simple-managers';

export default async function RedirectsManagerPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">Redirects</h2>
      <RedirectsManager sites={sites.data} />
    </div>
  );
}
