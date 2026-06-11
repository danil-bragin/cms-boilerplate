import { listSites } from '../actions';
import { AuthorsManager } from '@/components/admin/authors-manager';

export default async function AuthorsPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">Authors</h2>
      <AuthorsManager sites={sites.data} />
    </div>
  );
}
