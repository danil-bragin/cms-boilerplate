'use client';

import { useState, useTransition } from 'react';
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
    </div>
  );
}
