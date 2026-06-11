'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { LocaleSummary, PageSummary, SiteDto } from '@cms/contracts';
import { useTranslations } from 'next-intl';
import { bulkPages } from '@/app/admin/actions';
import { AddLocaleButton, SlugOverrideButton, PageRowActions } from './page-forms';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';

function LocaleChip({ summary }: { summary: LocaleSummary }) {
  const published = summary.publishedVersionId !== null;
  return (
    <Link href={`/admin/edit/${summary.pageLocaleId}`} className="mr-1 inline-block">
      <Badge variant={published ? 'success' : 'outline'} className={cn(!published && 'text-amber-600 dark:text-amber-400')}>
        {summary.locale} v{summary.latestVersionNo} {published ? '●' : '○'}
      </Badge>
    </Link>
  );
}

export function PagesTable({ site, pages }: { site: SiteDto; pages: PageSummary[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addLocale, setAddLocale] = useState(site.locales[0] ?? 'en');
  const [pending, start] = useTransition();
  const t = useTranslations('pages');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = pages.length > 0 && selected.size === pages.length;

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
            <TableHead>{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                No pages yet — create one below.
              </TableCell>
            </TableRow>
          )}
          {pages.map((page) => (
            <TableRow key={page.id} data-state={selected.has(page.id) ? 'selected' : undefined}>
              <TableCell>
                <Checkbox checked={selected.has(page.id)} onCheckedChange={() => toggle(page.id)} />
              </TableCell>
              <TableCell className="font-mono text-xs">{page.path}</TableCell>
              <TableCell>{page.name}</TableCell>
              <TableCell className="text-muted-foreground">{page.kind}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  {page.locales.map((l) => (
                    <span key={l.pageLocaleId} className="inline-flex items-center whitespace-nowrap">
                      <LocaleChip summary={l} />
                      <SlugOverrideButton pageLocaleId={l.pageLocaleId} locale={l.locale} current={l.slugOverride} />
                    </span>
                  ))}
                  {site.locales
                    .filter((loc) => !page.locales.some((pl) => pl.locale === loc))
                    .map((loc) => (
                      <AddLocaleButton key={loc} pageId={page.id} locale={loc} />
                    ))}
                </div>
              </TableCell>
              <TableCell>
                <PageRowActions pageId={page.id} path={page.path} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
              {t('addLocale')}
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
