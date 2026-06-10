import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession({ refresh: true });
  if (!session) redirect('/api/auth/login?returnTo=/admin');

  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid #ddd',
          background: '#fafafa',
        }}
      >
        <Link href="/admin" style={{ fontWeight: 600, textDecoration: 'none', color: '#1a1a2e' }}>
          CMS Admin
        </Link>
        <span style={{ fontSize: 14, color: '#555' }}>
          {session.email} ({session.roles.join(', ') || 'no role'}) ·{' '}
          <a href="/api/auth/logout">Logout</a>
        </span>
      </header>
      {children}
    </div>
  );
}
