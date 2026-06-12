'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { addLocale, createPage, listAuthors, type AuthorRow } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';

export function CreatePageForm({ siteId }: { siteId: string }) {
  const t = useTranslations('pages');
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'page' | 'post'>('page');
  const [authorId, setAuthorId] = useState('');
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (kind === 'post' && authors.length === 0) {
      void listAuthors(siteId).then((r) => r.ok && r.data && setAuthors(r.data));
    }
  }, [kind, siteId, authors.length]);

  return (
    <Card>
      <CardContent className="pt-5">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const selected = authors.find((a) => a.id === authorId);
              const result = await createPage(siteId, path, name, kind, selected?.name, authorId || null);
              if (!result.ok) toast.error(result.error?.message ?? 'failed');
              else {
                toast.success('Page created');
                setPath('');
                setName('');
              }
            });
          }}
        >
          <Input
            placeholder="/path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            required
            pattern="^/([a-z0-9-]+(/[a-z0-9-]+)*)?$"
            className="w-40 font-mono"
          />
          <Input placeholder={t('pageName')} value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
          <Select value={kind} onValueChange={(v) => setKind(v as 'page' | 'post')}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="page">page</SelectItem>
              <SelectItem value="post">post</SelectItem>
            </SelectContent>
          </Select>
          {kind === 'post' && (
            <Select value={authorId} onValueChange={setAuthorId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="— author —" />
              </SelectTrigger>
              <SelectContent>
                {authors.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? t('creating') : t('createPage')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AddLocaleButton({ pageId, locale }: { pageId: string; locale: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => void (await addLocale(pageId, locale)))}
      className="mr-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
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
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ✎{current ? ` ${current}` : ''}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="localized-slug"
        pattern="[a-z0-9-]*"
        className="h-7 w-28 text-xs"
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { updateSlugOverride } = await import('@/app/admin/actions');
            await updateSlugOverride(pageLocaleId, value.trim() || null);
            setEditing(false);
          })
        }
      >
        ✓
      </Button>
    </span>
  );
}

export function PageRowActions({ pageId, path }: { pageId: string; path: string }) {
  const t = useTranslations('pages');
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [value, setValue] = useState(path);
  const [dupPath, setDupPath] = useState(`${path === '/' ? '' : path}-copy`);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-1">
      {editing ? (
        <>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            pattern="^/([a-z0-9-]+(/[a-z0-9-]+)*)?$"
            className="h-7 w-36 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const { renamePage } = await import('@/app/admin/actions');
                await renamePage(pageId, { path: value });
                setEditing(false);
              })
            }
          >
            ✓ move
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            ✕
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {t('rename')}
        </Button>
      )}
      {duplicating ? (
        <>
          <Input
            value={dupPath}
            onChange={(e) => setDupPath(e.target.value)}
            pattern="^/([a-z0-9-]+(/[a-z0-9-]+)*)?$"
            placeholder="/new-path"
            className="h-7 w-36 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !dupPath}
            onClick={() =>
              startTransition(async () => {
                const { duplicatePage } = await import('@/app/admin/actions');
                await duplicatePage(pageId, dupPath, `Copy of ${path}`);
                setDuplicating(false);
              })
            }
          >
            ✓ copy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDuplicating(false)}>
            ✕
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDuplicating(true)}>
          {t('duplicate')}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        className="text-destructive hover:text-destructive"
        onClick={() =>
          startTransition(async () => {
            if (window.confirm(`Delete ${path} with all versions and locales?`)) {
              const { deletePage } = await import('@/app/admin/actions');
              await deletePage(pageId);
            }
          })
        }
      >
        {t('delete')}
      </Button>
    </span>
  );
}
