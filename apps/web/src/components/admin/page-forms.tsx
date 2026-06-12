'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { PageSummary } from '@cms/contracts';
import { addLocale, createPage, listAuthors, type AuthorRow } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field } from './inputs';
import { toast } from '@/components/ui/sonner';

/** Full create-page form for the dedicated /admin/pages/new route. */
export function CreatePageForm({ siteId }: { siteId: string }) {
  const t = useTranslations('pages');
  const router = useRouter();
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
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const selected = authors.find((a) => a.id === authorId);
          const result = await createPage(siteId, path, name, kind, selected?.name, authorId || null);
          if (!result.ok) toast.error(result.error?.message ?? 'failed');
          else {
            toast.success('Page created — opening editor');
            const pl = result.data?.locales?.[0]?.pageLocaleId;
            router.push(pl ? `/admin/edit/${pl}` : '/admin/pages');
          }
        });
      }}
    >
      <Field label="Path" hint="URL path, e.g. /about or /blog/my-post">
        <Input
          placeholder="/about"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          required
          pattern="^/([-a-z0-9]+(/[-a-z0-9]+)*)?$"
          className="font-mono"
        />
      </Field>
      <Field label="Name" hint="Internal name shown in the pages list">
        <Input placeholder={t('pageName')} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Type">
        <Select value={kind} onValueChange={(v) => setKind(v as 'page' | 'post')}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="page">page</SelectItem>
            <SelectItem value="post">post (blog article)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {kind === 'post' && (
        <Field label="Author" hint="Links the post to an author page for E-E-A-T">
          <Select value={authorId} onValueChange={setAuthorId}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="— select author —" />
            </SelectTrigger>
            <SelectContent>
              {authors.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No authors yet</div>}
              {authors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !path || !name}>
          {pending ? t('creating') : t('createPage')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/pages')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AddLocaleButton({ pageId, locale }: { pageId: string; locale: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await addLocale(pageId, locale);
          toast.success(`Added ${locale}`);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
      title={`Add ${locale} translation`}
    >
      <Plus className="h-3 w-3" /> {locale}
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
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? '');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        title={`Localized slug for ${locale}${current ? `: ${current}` : ''}`}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        ✎ {locale}
        {current ? `:${current}` : ''}
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Localized slug — {locale}</DialogTitle>
          <DialogDescription>Override the URL slug for this locale (leave empty to use the page path).</DialogDescription>
        </DialogHeader>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="localized-slug" pattern="[-a-z0-9]*" />
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const { updateSlugOverride } = await import('@/app/admin/actions');
              await updateSlugOverride(pageLocaleId, value.trim() || null);
              toast.success('Slug saved');
              setOpen(false);
              router.refresh();
            })
          }
        >
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({ page, onClose }: { page: PageSummary; onClose: () => void }) {
  const [value, setValue] = useState(page.path);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move / rename page</DialogTitle>
          <DialogDescription>Changing the path sets up an automatic 301 redirect from the old URL.</DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          pattern="^/([-a-z0-9]+(/[-a-z0-9]+)*)?$"
          className="font-mono"
        />
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const { renamePage } = await import('@/app/admin/actions');
              const r = await renamePage(page.id, { path: value });
              if (r.ok) {
                toast.success('Page moved (301 set)');
                onClose();
                router.refresh();
              } else toast.error(r.error?.message ?? 'failed');
            })
          }
        >
          Move
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function DuplicateDialog({ page, onClose }: { page: PageSummary; onClose: () => void }) {
  const [value, setValue] = useState(`${page.path === '/' ? '' : page.path}-copy`);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate page</DialogTitle>
          <DialogDescription>Creates a copy of “{page.name}” at a new path.</DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="/new-path"
          pattern="^/([-a-z0-9]+(/[-a-z0-9]+)*)?$"
          className="font-mono"
        />
        <Button
          disabled={pending || !value}
          onClick={() =>
            startTransition(async () => {
              const { duplicatePage } = await import('@/app/admin/actions');
              const r = await duplicatePage(page.id, value, `Copy of ${page.name}`);
              if (r.ok) {
                toast.success('Page duplicated');
                onClose();
                router.refresh();
              } else toast.error(r.error?.message ?? 'failed');
            })
          }
        >
          Duplicate
        </Button>
      </DialogContent>
    </Dialog>
  );
}
