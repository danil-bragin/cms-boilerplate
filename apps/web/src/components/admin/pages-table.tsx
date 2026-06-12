'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { LocaleSummary, PageSummary, SiteDto } from '@cms/contracts';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { bulkPages } from '@/app/admin/actions';
import { AddLocaleButton, RenameDialog, DuplicateDialog, SlugOverrideButton } from './page-forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';

/** A page's locale status chips, each linking into the Puck editor. */
function LocaleChips({ page, site }: { page: PageSummary; site: SiteDto }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {page.locales.map((l: LocaleSummary) => {
        const published = l.publishedVersionId !== null;
        return (
          <Link key={l.pageLocaleId} href={`/admin/edit/${l.pageLocaleId}`} title={`Edit ${l.locale}`}>
            <Badge variant={published ? 'success' : 'outline'} className="cursor-pointer hover:opacity-80">
              {l.locale} {published ? '●' : '○'}
            </Badge>
          </Link>
        );
      })}
      {site.locales
        .filter((loc) => !page.locales.some((pl) => pl.locale === loc))
        .map((loc) => (
          <AddLocaleButton key={loc} pageId={page.id} locale={loc} />
        ))}
    </div>
  );
}

export function PagesTable({ site, pages }: { site: SiteDto; pages: PageSummary[] }) {
  const router = useRouter();
  const t = useTranslations('pages');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addLocale, setAddLocale] = useState(site.locales[0] ?? 'en');
  const [renaming, setRenaming] = useState<PageSummary | null>(null);
  const [duplicating, setDuplicating] = useState<PageSummary | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = pages.length > 0 && selected.size === pages.length;

  const defaultEditor = (page: PageSummary) => {
    const def = page.locales.find((l) => l.locale === site.defaultLocale) ?? page.locales[0];
    return def ? `/admin/edit/${def.pageLocaleId}` : '#';
  };

  function run(action: 'publish' | 'unpublish' | 'delete' | 'add-locale') {
    start(async () => {
      const pageIds = [...selected];
      let ids = pageIds;
      if (action === 'publish' || action === 'unpublish') {
        ids = pages.filter((p) => selected.has(p.id)).flatMap((p) => p.locales.map((l) => l.pageLocaleId));
      }
      const result = await bulkPages(site.id, action, ids, addLocale);
      if (result.ok && result.data) {
        const fail = result.data.results.filter((r) => !r.ok);
        if (fail.length) toast.error(`${fail.length} failed`);
        else toast.success(`Done (${result.data.results.length})`);
        setSelected(new Set());
      } else {
        toast.error(result.error?.message ?? 'failed');
      }
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(c) => setSelected(c ? new Set(pages.map((p) => p.id)) : new Set())}
              />
            </TableHead>
            <TableHead>{t('path')}</TableHead>
            <TableHead>{t('name')}</TableHead>
            <TableHead>{t('kind')}</TableHead>
            <TableHead>{t('locales')}</TableHead>
            <TableHead className="text-right">{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                No pages yet. Click “{t('newPage')}” to create one.
              </TableCell>
            </TableRow>
          )}
          {pages.map((page) => (
            <TableRow key={page.id} data-state={selected.has(page.id) ? 'selected' : undefined}>
              <TableCell>
                <Checkbox checked={selected.has(page.id)} onCheckedChange={() => toggle(page.id)} />
              </TableCell>
              <TableCell className="font-mono text-xs">{page.path}</TableCell>
              <TableCell className="font-medium">{page.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{page.kind}</Badge>
              </TableCell>
              <TableCell>
                <LocaleChips page={page} site={site} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={defaultEditor(page)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {t('edit')}
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{page.path}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setRenaming(page)}>{t('rename')} (move)</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDuplicating(page)}>{t('duplicate')}</DropdownMenuItem>
                      {page.locales.map((l) => (
                        <DropdownMenuItem key={l.pageLocaleId} asChild>
                          <Link href={`/admin/edit/${l.pageLocaleId}`}>Edit {l.locale}</Link>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        onSelect={() =>
                          start(async () => {
                            if (window.confirm(`Delete ${page.path} with all versions and locales?`)) {
                              const { deletePage } = await import('@/app/admin/actions');
                              await deletePage(page.id);
                              toast.success('Page deleted');
                              router.refresh();
                            }
                          })
                        }
                      >
                        {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-1 flex justify-end gap-1">
                  {page.locales.map((l) => (
                    <SlugOverrideButton key={l.pageLocaleId} pageLocaleId={l.pageLocaleId} locale={l.locale} current={l.slugOverride} />
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {renaming && <RenameDialog page={renaming} onClose={() => setRenaming(null)} />}
      {duplicating && <DuplicateDialog page={duplicating} onClose={() => setDuplicating(null)} />}

      {selected.size > 0 && (
        <div className="sticky bottom-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-lg">
          <strong className="text-sm">{t('selected', { count: selected.size })}</strong>
          <Button size="sm" disabled={pending} onClick={() => run('publish')}>
            {t('publishLatest')}
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run('unpublish')}>
            {t('unpublish')}
          </Button>
          <div className="flex items-center gap-1">
            <Select value={addLocale} onValueChange={setAddLocale}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {site.locales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run('add-locale')}>
              <Plus className="h-3.5 w-3.5" /> {t('addLocale')}
            </Button>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t('deleteConfirm', { count: selected.size }))) run('delete');
            }}
          >
            {t('delete')}
          </Button>
        </div>
      )}
    </>
  );
}
