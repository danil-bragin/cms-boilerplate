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

export function SlugOverrideButton({
  pageLocaleId,
  locale,
  current,
}: {
  pageLocaleId: string;
  locale: string;
  current: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? '');
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title={`Localized slug for ${locale}${current ? `: ${current}` : ''}`}
        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#888' }}
      >
        ✎{current ? ` ${current}` : ''}
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="localized-slug"
        pattern="[a-z0-9-]*"
        style={{ padding: 2, fontSize: 12, width: 110 }}
      />
      <button
        disabled={pending}
        style={{ fontSize: 12 }}
        onClick={() =>
          startTransition(async () => {
            const { updateSlugOverride } = await import('@/app/admin/actions');
            await updateSlugOverride(pageLocaleId, value.trim() || null);
            setEditing(false);
          })
        }
      >
        ✓
      </button>
    </span>
  );
}

export function PageRowActions({ pageId, path }: { pageId: string; path: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(path);
  const [pending, startTransition] = useTransition();

  return (
    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
      {editing ? (
        <>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            pattern="^/([a-z0-9-]+(/[a-z0-9-]+)*)?$"
            style={{ padding: 2, fontSize: 12, width: 140, fontFamily: 'monospace' }}
          />
          <button
            disabled={pending}
            style={{ fontSize: 12 }}
            onClick={() =>
              startTransition(async () => {
                const { renamePage } = await import('@/app/admin/actions');
                await renamePage(pageId, { path: value });
                setEditing(false);
              })
            }
          >
            ✓ move (auto-301)
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)} style={{ fontSize: 12, color: '#888', border: 'none', background: 'none', cursor: 'pointer' }}>
          rename
        </button>
      )}
      <button
        disabled={pending}
        style={{ fontSize: 12, color: '#888', border: 'none', background: 'none', cursor: 'pointer' }}
        onClick={() =>
          startTransition(async () => {
            const newPath = window.prompt('Path for the copy:', `${path === '/' ? '' : path}-copy`);
            if (newPath) {
              const { duplicatePage } = await import('@/app/admin/actions');
              await duplicatePage(pageId, newPath, `Copy of ${path}`);
            }
          })
        }
      >
        duplicate
      </button>
      <button
        disabled={pending}
        style={{ fontSize: 12, color: '#c5221f', border: 'none', background: 'none', cursor: 'pointer' }}
        onClick={() =>
          startTransition(async () => {
            if (window.confirm(`Delete ${path} with all versions and locales?`)) {
              const { deletePage } = await import('@/app/admin/actions');
              await deletePage(pageId);
            }
          })
        }
      >
        delete
      </button>
    </span>
  );
}
