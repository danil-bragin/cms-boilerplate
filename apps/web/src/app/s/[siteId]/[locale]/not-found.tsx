import { SearchBox } from '@cms/puck-config/render-search';

/** Branded 404 for public pages: keeps lost visitors with search + home link. */
export default function NotFound() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: 96, margin: 0, fontWeight: 700, color: '#1a1a2e' }}>404</p>
      <h1 style={{ marginTop: 0 }}>Page not found</h1>
      <p style={{ color: '#555' }}>The page you are looking for does not exist or has moved.</p>
      <div style={{ margin: '24px auto', textAlign: 'left' }}>
        <SearchBox placeholder="Search this site…" />
      </div>
      <a href="/" style={{ color: '#1a1a2e' }}>
        ← Back to the homepage
      </a>
    </main>
  );
}
