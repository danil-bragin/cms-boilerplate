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
  const [saJson, setSaJson] = useState('');
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
        <textarea
          value={saJson}
          onChange={(e) => setSaJson(e.target.value)}
          rows={6}
          placeholder='{"client_email":"…","private_key":"…"}'
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8 }}
        />
        <button
          disabled={pending}
          style={{ padding: '6px 16px', marginTop: 6 }}
          onClick={() =>
            start(async () => {
              setMessage(null);
              try {
                const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
                const result = await updateGscSettings(siteId, { serviceAccount: sa });
                setMessage(result.ok ? 'Saved' : result.error?.message ?? 'failed');
              } catch {
                setMessage('Invalid JSON');
              }
            })
          }
        >
          Save
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
