import { listSites } from '../actions';
import { GscDashboard } from '@/components/admin/gsc-dashboard';

export default async function GscPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">Search Console — index status</h2>
      <GscDashboard sites={sites.data} />
    </div>
  );
}
