import { listSites } from '../actions';
import { WebhooksManager } from '@/components/admin/simple-managers';

export default async function WebhooksManagerPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">Webhooks</h2>
      <WebhooksManager sites={sites.data} />
    </div>
  );
}
