'use client';

import { useEffect, useState, useTransition } from 'react';
import type { SiteDto } from '@cms/contracts';
import { deleteAuthor, listAuthors, upsertAuthor, type AuthorRow } from '@/app/admin/actions';
import { SitePicker } from './simple-managers';

const input = { padding: 6 } as const;

export function AuthorsManager({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [rows, setRows] = useState<AuthorRow[]>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [sameAs, setSameAs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function refresh(id = siteId) {
    const r = await listAuthors(id);
    if (r.ok && r.data) setRows(r.data);
  }
  useEffect(() => {
    if (siteId) void refresh(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return (
    <div>
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
      {rows.map((a) => (
        <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{a.name}</strong>
            <span>
              <button onClick={() => { setSlug(a.slug); setName(a.name); setBio(a.bio); setSameAs(a.sameAs.join(', ')); }}>Edit</button>{' '}
              <button disabled={pending} onClick={() => start(async () => { await deleteAuthor(a.id); await refresh(); })}>Delete</button>
            </span>
          </div>
          <code style={{ fontSize: 12, color: '#777' }}>/author/{a.slug}</code>
        </div>
      ))}
      <h4>Create / update author</h4>
      <div style={{ display: 'grid', gap: 6, maxWidth: 600 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={{ ...input, flex: 1 }} placeholder="slug (jane-doe)" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input style={{ ...input, flex: 1 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <textarea style={input} placeholder="Bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        <input style={input} placeholder="Social profiles (sameAs): https://x.com/jane, …" value={sameAs} onChange={(e) => setSameAs(e.target.value)} />
        <button
          disabled={pending || !slug || !name}
          style={{ padding: '6px 16px', width: 120 }}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await upsertAuthor(siteId, {
                slug,
                name,
                bio,
                avatarKey: null,
                sameAs: sameAs.split(',').map((u) => u.trim()).filter(Boolean),
              });
              if (!result.ok) setError(result.error?.message ?? 'failed');
              else { setSlug(''); setName(''); setBio(''); setSameAs(''); await refresh(); }
            })
          }
        >
          Save
        </button>
        {error && <p style={{ color: '#c5221f' }}>{error}</p>}
      </div>
    </div>
  );
}
