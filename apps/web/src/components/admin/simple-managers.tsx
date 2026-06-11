'use client';

import { useEffect, useState, useTransition } from 'react';
import type { MenuItem, RedirectDto, SiteDto, WebhookDto } from '@cms/contracts';
import { WEBHOOK_EVENTS } from '@cms/contracts';
import {
  createRedirect,
  createWebhook,
  deleteMenu,
  deleteRedirect,
  deleteWebhook,
  listMenus,
  listRedirects,
  listWebhooks,
  upsertMenu,
} from '@/app/admin/actions';
import { MenuTreeEditor } from './menu-editor';
import { CheckboxGroup } from './inputs';

const input = { padding: 6 } as const;


export function SitePicker({
  sites,
  value,
  onChange,
}: {
  sites: SiteDto[];
  value: string;
  onChange: (siteId: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: 6, marginBottom: 16 }}>
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.slug}
        </option>
      ))}
    </select>
  );
}

// --- redirects ---

export function RedirectsManager({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [rows, setRows] = useState<RedirectDto[]>([]);
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [status, setStatus] = useState<'301' | '302'>('301');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function refresh(id = siteId) {
    const result = await listRedirects(id);
    if (result.ok && result.data) setRows(result.data);
  }
  useEffect(() => {
    if (siteId) void refresh(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return (
    <div>
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#666', fontSize: 13 }}>
            <th style={{ padding: 6 }}>From</th>
            <th style={{ padding: 6 }}>To</th>
            <th style={{ padding: 6 }}>Code</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 6, fontFamily: 'monospace' }}>{r.fromPath}</td>
              <td style={{ padding: 6, fontFamily: 'monospace' }}>{r.toPath}</td>
              <td style={{ padding: 6 }}>{r.status}</td>
              <td style={{ padding: 6 }}>
                <button disabled={pending} onClick={() => start(async () => { await deleteRedirect(r.id); await refresh(); })}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        style={{ display: 'flex', gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = await createRedirect(siteId, { fromPath, toPath, status });
            if (!result.ok) setError(result.error?.message ?? 'failed');
            else {
              setFromPath('');
              setToPath('');
              await refresh();
            }
          });
        }}
      >
        <input style={{ ...input, flex: 1 }} placeholder="/en/old-path" value={fromPath} onChange={(e) => setFromPath(e.target.value)} required />
        <input style={{ ...input, flex: 1 }} placeholder="/en/new-path or https://…" value={toPath} onChange={(e) => setToPath(e.target.value)} required />
        <select style={input} value={status} onChange={(e) => setStatus(e.target.value as '301' | '302')}>
          <option value="301">301 permanent</option>
          <option value="302">302 temporary</option>
        </select>
        <button disabled={pending} style={{ padding: '6px 16px' }}>Add</button>
      </form>
      {error && <p style={{ color: '#c5221f' }}>{error}</p>}
    </div>
  );
}

// --- menus ---

interface MenuRow {
  id: string;
  slug: string;
  items: MenuItem[];
}

export function MenusManager({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [slug, setSlug] = useState('main');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const siteLocales = sites.find((s) => s.id === siteId)?.locales ?? ['en'];

  async function refresh(id = siteId) {
    const result = await listMenus(id);
    if (result.ok && result.data) setRows(result.data);
  }
  useEffect(() => {
    if (siteId) void refresh(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return (
    <div>
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
      {rows.map((m) => (
        <div key={m.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{m.slug}</strong>
            <span>
              <button onClick={() => { setSlug(m.slug); setItems(m.items); }}>Edit</button>{' '}
              <button disabled={pending} onClick={() => start(async () => { await deleteMenu(m.id); await refresh(); })}>Delete</button>
            </span>
          </div>
          <code style={{ fontSize: 12, color: '#777' }}>{m.items.length} items</code>
        </div>
      ))}
      {rows.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>No menus yet.</p>}
      <h4>Create / update menu</h4>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input style={{ ...input, border: '1px solid #d0d0d8', borderRadius: 6 }} placeholder="slug (e.g. main)" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <button
          disabled={pending || !slug}
          style={{ padding: '7px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          onClick={() =>
            start(async () => {
              const result = await upsertMenu(siteId, { slug, items });
              setMessage(result.ok ? 'Saved' : result.error?.message ?? 'failed');
              await refresh();
            })
          }
        >
          {pending ? 'Saving…' : 'Save menu'}
        </button>
        {message && <span style={{ color: message === 'Saved' ? '#137333' : '#c5221f' }}>{message}</span>}
      </div>
      <MenuTreeEditor locales={siteLocales} value={items} onChange={setItems} />
    </div>
  );
}

// --- webhooks ---

export function WebhooksManager({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [rows, setRows] = useState<WebhookDto[]>([]);
  const [url, setUrl] = useState('');
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>(['page.published', 'page.unpublished']);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function refresh(id = siteId) {
    const result = await listWebhooks(id);
    if (result.ok && result.data) setRows(result.data);
  }
  useEffect(() => {
    if (siteId) void refresh(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return (
    <div>
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
      {newSecret && (
        <p style={{ background: '#fef7e0', padding: 8, borderRadius: 6 }}>
          Signing secret (shown once): <code>{newSecret}</code>
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 6, fontFamily: 'monospace' }}>{w.url}</td>
              <td style={{ padding: 6, color: '#777' }}>{w.events.join(', ')}</td>
              <td style={{ padding: 6 }}>
                <button disabled={pending} onClick={() => start(async () => { await deleteWebhook(w.id); await refresh(); })}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>No webhooks yet.</p>}
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = await createWebhook(siteId, { url, events: events as ('page.published' | 'page.unpublished')[] });
            if (!result.ok) setError(result.error?.message ?? 'failed');
            else {
              setNewSecret(result.data?.secret ?? null);
              setUrl('');
              await refresh();
            }
          });
        }}
      >
        <input
          style={{ ...input, border: '1px solid #d0d0d8', borderRadius: 6 }}
          placeholder="https://example.com/hooks/cms"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <div>
          <span style={{ fontSize: 12, color: '#999' }}>Subscribe to events</span>
          <CheckboxGroup
            options={WEBHOOK_EVENTS.map((ev) => ({ value: ev, label: ev }))}
            value={events}
            onChange={setEvents}
          />
        </div>
        <button
          disabled={pending || !url || events.length === 0}
          style={{ padding: '7px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          Add webhook
        </button>
      </form>
      {error && <p style={{ color: '#c5221f' }}>{error}</p>}
      <p style={{ color: '#777', fontSize: 13 }}>
        Deliveries are POSTs with <code>x-cms-event</code> and <code>x-cms-signature: sha256=HMAC(body)</code>,
        retried 5× with backoff.
      </p>
    </div>
  );
}
