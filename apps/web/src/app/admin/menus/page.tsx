import { listSites } from '../actions';
import { MenusManager } from '@/components/admin/simple-managers';

export default async function MenusManagerPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">Menus</h2>
      <MenusManager sites={sites.data} />
    </div>
  );
}
