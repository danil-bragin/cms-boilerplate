import { listSites } from '../actions';
import { AuthorsManager } from '@/components/admin/authors-manager';

export default async function AuthorsPage() {
  const sites = await listSites();
  if (!sites.ok || !sites.data?.length) return <p style={{ padding: 24 }}>No sites.</p>;
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Authors</h2>
      <AuthorsManager sites={sites.data} />
    </div>
  );
}
