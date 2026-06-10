'use client';

import { useEffect, useState, useTransition } from 'react';
import type { SiteDto } from '@cms/contracts';
import { createSite, updateSite } from '@/app/admin/actions';

const row = { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' } as const;
const input = { padding: 6, flex: 1 } as const;

export function SiteForm() {
  const [slug, setSlug] = useState('');
  const [domains, setDomains] = useState('');
  const [locales, setLocales] = useState('en');
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await createSite({
            slug,
            domains: domains.split(',').map((d) => d.trim()).filter(Boolean),
            locales: locales.split(',').map((l) => l.trim()).filter(Boolean),
            defaultLocale,
          });
          if (!result.ok) setError(result.error?.message ?? 'failed');
        });
      }}
      style={{ maxWidth: 600 }}
    >
      <div style={row}>
        <input style={input} placeholder="slug (my-site)" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <input style={input} placeholder="domains (a.com, b.com)" value={domains} onChange={(e) => setDomains(e.target.value)} required />
      </div>
      <div style={row}>
        <input style={input} placeholder="locales (en, de)" value={locales} onChange={(e) => setLocales(e.target.value)} required />
        <input style={input} placeholder="default locale" value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)} required />
        <button disabled={pending} style={{ padding: '6px 16px' }}>Create</button>
      </div>
      {error && <p style={{ color: '#c5221f' }}>{error}</p>}
    </form>
  );
}

export function SiteEditor({ site }: { site: SiteDto & { settings?: { seo?: { blockAiTraining?: boolean } } } }) {
  const [domains, setDomains] = useState(site.domains.join(', '));
  const [locales, setLocales] = useState(site.locales.join(', '));
  const [defaultLocale, setDefaultLocale] = useState(site.defaultLocale);
  const [blockAi, setBlockAi] = useState(Boolean(site.settings?.seo?.blockAiTraining));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <strong>{site.slug}</strong>
      <div style={{ ...row, marginTop: 8 }}>
        <label style={{ width: 110, color: '#555' }}>Domains</label>
        <input style={input} value={domains} onChange={(e) => setDomains(e.target.value)} />
      </div>
      <div style={row}>
        <label style={{ width: 110, color: '#555' }}>Locales</label>
        <input style={input} value={locales} onChange={(e) => setLocales(e.target.value)} />
        <label style={{ color: '#555' }}>Default</label>
        <input style={{ padding: 6, width: 80 }} value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)} />
      </div>
      <div style={row}>
        <label style={{ color: '#555' }}>
          <input type="checkbox" checked={blockAi} onChange={(e) => setBlockAi(e.target.checked)} /> Block AI
          training bots in robots.txt
        </label>
        <span style={{ flex: 1 }} />
        <button
          disabled={pending}
          style={{ padding: '6px 16px' }}
          onClick={() =>
            start(async () => {
              const result = await updateSite(site.id, {
                domains: domains.split(',').map((d) => d.trim()).filter(Boolean),
                locales: locales.split(',').map((l) => l.trim()).filter(Boolean),
                defaultLocale,
                seo: { blockAiTraining: blockAi },
              });
              setMessage(result.ok ? 'Saved' : result.error?.message ?? 'failed');
            })
          }
        >
          Save
        </button>
      </div>
      {message && <p style={{ color: message === 'Saved' ? '#137333' : '#c5221f', margin: 0 }}>{message}</p>}
      <MembersEditor siteId={site.id} />
    </div>
  );
}

export function MembersEditor({ siteId }: { siteId: string }) {
  const [members, setMembers] = useState<Array<{ id: string; email: string; role: string }>>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function refresh() {
    const { listMembers } = await import('@/app/admin/actions');
    const result = await listMembers(siteId);
    if (result.ok && result.data) setMembers(result.data);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #ddd' }}>
      <strong style={{ fontSize: 13 }}>Members</strong>
      <p style={{ fontSize: 12, color: '#777', margin: '2px 0 6px' }}>
        Empty list = open to all editors. Once configured, only members (and admins) can touch this site.
      </p>
      {members.map((m) => (
        <div key={m.id} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>{m.email}</span>
          <span style={{ color: '#777' }}>{m.role}</span>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const { removeMember } = await import('@/app/admin/actions');
                await removeMember(m.id);
                await refresh();
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          placeholder="user@example.com (must have logged in once)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: 4, fontSize: 13 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} style={{ padding: 4 }}>
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>
        <button
          disabled={pending || !email}
          onClick={() =>
            start(async () => {
              setError(null);
              const { addMember } = await import('@/app/admin/actions');
              const result = await addMember(siteId, email, role);
              if (!result.ok) setError(result.error?.message ?? 'failed');
              else {
                setEmail('');
                await refresh();
              }
            })
          }
        >
          Add
        </button>
      </div>
      {error && <p style={{ color: '#c5221f', fontSize: 13 }}>{error}</p>}
    </div>
  );
}
