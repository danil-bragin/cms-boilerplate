'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { LocaleSummary, PageSummary, SiteDto } from '@cms/contracts';
import { useTranslations } from 'next-intl';
import { bulkPages } from '@/app/admin/actions';
import { AddLocaleButton, SlugOverrideButton, PageRowActions } from './page-forms';

function LocaleChip({ summary }: { summary: LocaleSummary }) {
  const published = summary.publishedVersionId !== null;
  return (
    <Link
      href={`/admin/edit/${summary.pageLocaleId}`}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        marginRight: 4,
        borderRadius: 12,
        fontSize: 12,
        textDecoration: 'none',
        background: published ? '#e6f4ea' : '#fef7e0',
        color: published ? '#137333' : '#b06000',
        border: '1px solid ' + (published ? '#b7dfc2' : '#f3d19c'),
      }}
    >
      {summary.locale} v{summary.latestVersionNo} {published ? '●' : '○'}
    </Link>
  );
}

export function PagesTable({ site, pages }: { site: SiteDto; pages: PageSummary[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addLocale, setAddLocale] = useState(site.locales[0] ?? 'en');
  const [message, setMessage] = useState<string | null>(null);
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

  // publish/unpublish/delete operate on the default-locale page-locale id;
  // delete/add-locale on the page id
  function run(action: 'publish' | 'unpublish' | 'delete' | 'add-locale') {
    start(async () => {
      setMessage(null);
      const pageIds = [...selected];
      let ids = pageIds;
      if (action === 'publish' || action === 'unpublish') {
        // map page → its default-locale page-locale id (publish latest)
        ids = pages
          .filter((p) => selected.has(p.id))
          .flatMap((p) => p.locales.map((l) => l.pageLocaleId));
      }
      const result = await bulkPages(site.id, action, ids, addLocale);
      if (result.ok && result.data) {
        const fail = result.data.results.filter((r) => !r.ok);
        setMessage(fail.length ? `${fail.length} failed` : `Done (${result.data.results.length})`);
        setSelected(new Set());
      } else {
        setMessage(result.error?.message ?? 'failed');
      }
    });
  }

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#666', fontSize: 13 }}>
            <th style={{ padding: 8, width: 24 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(pages.map((p) => p.id)) : new Set())}
              />
            </th>
            <th style={{ padding: 8 }}>{t('path')}</th>
            <th style={{ padding: 8 }}>{t('name')}</th>
            <th style={{ padding: 8 }}>{t('kind')}</th>
            <th style={{ padding: 8 }}>{t('locales')}</th>
            <th style={{ padding: 8 }}>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id} style={{ borderTop: '1px solid #eee', background: selected.has(page.id) ? '#f0f4ff' : undefined }}>
              <td style={{ padding: 8 }}>
                <input type="checkbox" checked={selected.has(page.id)} onChange={() => toggle(page.id)} />
              </td>
              <td style={{ padding: 8, fontFamily: 'monospace' }}>{page.path}</td>
              <td style={{ padding: 8 }}>{page.name}</td>
              <td style={{ padding: 8, color: '#777' }}>{page.kind}</td>
              <td style={{ padding: 8 }}>
                {page.locales.map((l) => (
                  <span key={l.pageLocaleId} style={{ whiteSpace: 'nowrap' }}>
                    <LocaleChip summary={l} />
                    <SlugOverrideButton pageLocaleId={l.pageLocaleId} locale={l.locale} current={l.slugOverride} />
                  </span>
                ))}
                {site.locales
                  .filter((loc) => !page.locales.some((pl) => pl.locale === loc))
                  .map((loc) => (
                    <AddLocaleButton key={loc} pageId={page.id} locale={loc} />
                  ))}
              </td>
              <td style={{ padding: 8 }}>
                <PageRowActions pageId={page.id} path={page.path} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected.size > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#1a1a2e',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            marginTop: 12,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <strong>{t('selected', { count: selected.size })}</strong>
          <button disabled={pending} onClick={() => run('publish')}>{t('publishLatest')}</button>
          <button disabled={pending} onClick={() => run('unpublish')}>{t('unpublish')}</button>
          <span>
            <select value={addLocale} onChange={(e) => setAddLocale(e.target.value)}>
              {site.locales.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>{' '}
            <button disabled={pending} onClick={() => run('add-locale')}>{t('addLocale')}</button>
          </span>
          <button
            disabled={pending}
            style={{ color: '#ff9a9a' }}
            onClick={() => {
              if (window.confirm(t('deleteConfirm', { count: selected.size }))) run('delete');
            }}
          >
            {t('delete')}
          </button>
          {message && <span>{message}</span>}
        </div>
      )}
    </>
  );
}
