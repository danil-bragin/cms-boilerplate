'use client';

import { useState, useTransition } from 'react';
import { addLocale, createPage } from '@/app/admin/actions';

export function CreatePageForm({ siteId }: { siteId: string }) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      style={{ display: 'flex', gap: 8, marginTop: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createPage(siteId, path, name);
          if (!result.ok) setError(result.error?.message ?? 'failed');
          else {
            setPath('');
            setName('');
          }
        });
      }}
    >
      <input
        placeholder="/path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        required
        pattern="^/([a-z0-9-]+(/[a-z0-9-]+)*)?$"
        style={{ padding: 6, fontFamily: 'monospace' }}
      />
      <input
        placeholder="Page name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        style={{ padding: 6 }}
      />
      <button type="submit" disabled={pending} style={{ padding: '6px 14px' }}>
        {pending ? 'Creating…' : 'Create page'}
      </button>
      {error && <span style={{ color: '#c5221f', alignSelf: 'center' }}>{error}</span>}
    </form>
  );
}

export function AddLocaleButton({ pageId, locale }: { pageId: string; locale: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => void (await addLocale(pageId, locale)))}
      style={{
        padding: '2px 10px',
        marginRight: 6,
        borderRadius: 12,
        fontSize: 13,
        background: '#fff',
        border: '1px dashed #aaa',
        color: '#555',
        cursor: 'pointer',
      }}
    >
      + {locale}
    </button>
  );
}
