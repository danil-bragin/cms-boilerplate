import { listSites } from '../actions';
import { WebhooksManager } from '@/components/admin/simple-managers';

export default async function WebhooksManagerPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Webhooks</h2>
      <WebhooksManager sites={sites.data} />
    </div>
  );
}
