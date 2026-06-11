'use client';

import { useEffect, useState, useTransition } from 'react';
import type { PageSummary, SiteDto } from '@cms/contracts';
import { gscInspect, listPages, updateGscSettings, type GscResult } from '@/app/admin/actions';
import { SitePicker } from './simple-managers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/sonner';

const verdictVariant = (v?: string): 'success' | 'outline' | 'destructive' =>
  v === 'PASS' ? 'success' : v === 'FAIL' ? 'destructive' : 'outline';

export function GscDashboard({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [results, setResults] = useState<Record<string, GscResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sa, setSa] = useState<{ client_email: string; private_key: string } | null>(null);
  const [propertyUrl, setPropertyUrl] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
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

      <Card className="mb-5">
        <CardContent className="pt-4">
          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {configOpen ? '▾' : '▸'} Configure service account
          </button>
          {configOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload a Google service-account JSON key. Add its <code>client_email</code> as a user of the
                GSC property. Stored in site settings; quota 2000 inspections/day.
              </p>
              <input
                type="file"
                accept="application/json,.json"
                className="block text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-accent"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const parsed = JSON.parse(await file.text()) as { client_email?: string; private_key?: string };
                    if (!parsed.client_email || !parsed.private_key) {
                      toast.error('That JSON has no client_email / private_key — is it a service-account key?');
                      return;
                    }
                    setSa({ client_email: parsed.client_email, private_key: parsed.private_key });
                    toast.success(`Loaded ${parsed.client_email}`);
                  } catch {
                    toast.error('Could not parse that file as JSON');
                  }
                }}
              />
              {sa && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Loaded: <code>{sa.client_email}</code>
                </p>
              )}
              <Input
                value={propertyUrl}
                onChange={(e) => setPropertyUrl(e.target.value)}
                placeholder="Property URL (optional, e.g. sc-domain:example.com)"
                className="max-w-md"
              />
              <Button
                disabled={pending || !sa}
                onClick={() =>
                  start(async () => {
                    const result = await updateGscSettings(siteId, {
                      serviceAccount: sa,
                      ...(propertyUrl ? { propertyUrl } : {}),
                    });
                    if (result.ok) toast.success('Credentials saved');
                    else toast.error(result.error?.message ?? 'failed');
                  })
                }
              >
                Save credentials
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead>Locale</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Last crawl</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.flatMap((page) =>
                page.locales
                  .filter((l) => l.publishedVersionId)
                  .map((l) => {
                    const key = `${page.id}:${l.locale}`;
                    const r = results[key];
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-mono text-xs">{page.path}</TableCell>
                        <TableCell>{l.locale}</TableCell>
                        <TableCell>{r?.verdict ? <Badge variant={verdictVariant(r.verdict)}>{r.verdict}</Badge> : '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{r?.coverageState ?? ''}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r?.lastCrawlTime ? new Date(r.lastCrawlTime).toLocaleDateString() : ''}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" disabled={busy === key} onClick={() => inspect(page, l.locale)}>
                            {busy === key ? '…' : r ? 'Refresh' : 'Inspect'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }),
              )}
            </TableBody>
          </Table>
          {pages.length > 0 && Object.values(results)[0]?.configured === false && (
            <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
              Search Console is not configured for this site — add a service account above.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
