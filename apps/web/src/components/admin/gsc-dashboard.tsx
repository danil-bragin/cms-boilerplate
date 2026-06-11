'use client';

import { useEffect, useState, useTransition } from 'react';
import type { PageSummary, SiteDto } from '@cms/contracts';
import { gscInspect, listPages, updateGscSettings, type GscResult } from '@/app/admin/actions';
import { SitePicker } from './simple-managers';

const verdictColor = (v?: string) =>
  v === 'PASS' ? '#137333' : v === 'NEUTRAL' ? '#b06000' : v === 'FAIL' ? '#c5221f' : '#888';

export function GscDashboard({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [results, setResults] = useState<Record<string, GscResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sa, setSa] = useState<{ client_email: string; private_key: string } | null>(null);
  const [propertyUrl, setPropertyUrl] = useState('');
  const [saError, setSaError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (siteId) void listPages(siteId).then((r) => r.ok && r.data && setPages(r.data));
  }, [siteId]);

  async function inspect(page: PageSummary, locale: string) {
    const key = `${page.id}:${locale}`;
    setBusy(key);
    const r = await gscInspect(siteId, locale, page.path);
    if (r.ok && r.data) setResults((prev) => ({ ...prev, [key]: r.data! }));
    setBusy(null);
  }

  return (
    <div>
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />

      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', color: '#555' }}>Configure service account</summary>
        <p style={{ fontSize: 13, color: '#777' }}>
          Paste a Google service-account JSON. Add its <code>client_email</code> as a user of the GSC
          property. Stored in site settings; quota 2000 inspections/day.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          style={{ display: 'block', marginBottom: 8 }}
          onChange={async (e) => {
            setSaError(null);
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const parsed = JSON.parse(await file.text()) as { client_email?: string; private_key?: string };
              if (!parsed.client_email || !parsed.private_key) {
                setSaError('That JSON has no client_email / private_key — is it a service-account key file?');
                return;
              }
              setSa({ client_email: parsed.client_email, private_key: parsed.private_key });
            } catch {
              setSaError('Could not parse that file as JSON');
            }
          }}
        />
        {sa && (
          <p style={{ fontSize: 13, color: '#137333', margin: '0 0 8px' }}>
            ✓ Loaded service account: <code>{sa.client_email}</code>
          </p>
        )}
        {saError && <p style={{ fontSize: 13, color: '#c5221f', margin: '0 0 8px' }}>{saError}</p>}
        <input
          value={propertyUrl}
          onChange={(e) => setPropertyUrl(e.target.value)}
          placeholder="Property URL (optional, e.g. sc-domain:example.com)"
          style={{ display: 'block', width: '100%', maxWidth: 420, padding: 7, marginBottom: 8, border: '1px solid #d0d0d8', borderRadius: 6 }}
        />
        <button
          disabled={pending || !sa}
          style={{ padding: '7px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          onClick={() =>
            start(async () => {
              setMessage(null);
              const result = await updateGscSettings(siteId, {
                serviceAccount: sa,
                ...(propertyUrl ? { propertyUrl } : {}),
              });
              setMessage(result.ok ? 'Saved' : result.error?.message ?? 'failed');
            })
          }
        >
          Save credentials
        </button>
        {message && <span style={{ marginLeft: 8, color: message === 'Saved' ? '#137333' : '#c5221f' }}>{message}</span>}
      </details>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#666', fontSize: 13 }}>
            <th style={{ padding: 6 }}>Path</th>
            <th style={{ padding: 6 }}>Locale</th>
            <th style={{ padding: 6 }}>Verdict</th>
            <th style={{ padding: 6 }}>Coverage</th>
            <th style={{ padding: 6 }}>Last crawl</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pages.flatMap((page) =>
            page.locales
              .filter((l) => l.publishedVersionId)
              .map((l) => {
                const key = `${page.id}:${l.locale}`;
                const r = results[key];
                return (
                  <tr key={key} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: 6, fontFamily: 'monospace' }}>{page.path}</td>
                    <td style={{ padding: 6 }}>{l.locale}</td>
                    <td style={{ padding: 6, color: verdictColor(r?.verdict) }}>{r?.verdict ?? '—'}</td>
                    <td style={{ padding: 6, color: '#555' }}>{r?.coverageState ?? ''}</td>
                    <td style={{ padding: 6, color: '#888', fontSize: 12 }}>
                      {r?.lastCrawlTime ? new Date(r.lastCrawlTime).toLocaleDateString() : ''}
                    </td>
                    <td style={{ padding: 6 }}>
                      <button disabled={busy === key} onClick={() => inspect(page, l.locale)}>
                        {busy === key ? '…' : r ? 'Refresh' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              }),
          )}
        </tbody>
      </table>
      {pages.length > 0 &&
        Object.values(results)[0]?.configured === false && (
          <p style={{ color: '#b06000', marginTop: 12 }}>
            Search Console is not configured for this site — add a service account above.
          </p>
        )}
    </div>
  );
}
