import { listSites } from '../actions';
import { GscDashboard } from '@/components/admin/gsc-dashboard';

export default async function GscPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h2>Search Console — index status</h2>
      <GscDashboard sites={sites.data} />
    </div>
  );
}
