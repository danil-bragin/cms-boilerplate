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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';

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
    <div className="mb-5">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sites.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.slug}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// --- redirects ---

export function RedirectsManager({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [rows, setRows] = useState<RedirectDto[]>([]);
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [status, setStatus] = useState<'301' | '302'>('301');
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
      <Card className="mb-5">
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Code</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    No redirects yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.fromPath}</TableCell>
                  <TableCell className="font-mono text-xs">{r.toPath}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => start(async () => { await deleteRedirect(r.id); await refresh(); })}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await createRedirect(siteId, { fromPath, toPath, status });
                if (!result.ok) toast.error(result.error?.message ?? 'failed');
                else {
                  toast.success('Redirect added');
                  setFromPath('');
                  setToPath('');
                  await refresh();
                }
              });
            }}
          >
            <Input className="flex-1 font-mono" placeholder="/en/old-path" value={fromPath} onChange={(e) => setFromPath(e.target.value)} required />
            <Input className="flex-1 font-mono" placeholder="/en/new-path or https://…" value={toPath} onChange={(e) => setToPath(e.target.value)} required />
            <Select value={status} onValueChange={(v) => setStatus(v as '301' | '302')}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="301">301 permanent</SelectItem>
                <SelectItem value="302">302 temporary</SelectItem>
              </SelectContent>
            </Select>
            <Button disabled={pending}>Add</Button>
          </form>
        </CardContent>
      </Card>
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
      <div className="mb-4 space-y-2">
        {rows.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <strong className="text-sm">{m.slug}</strong>
                <span className="ml-2 text-xs text-muted-foreground">{m.items.length} items</span>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setSlug(m.slug); setItems(m.items); }}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => start(async () => { await deleteMenu(m.id); await refresh(); })}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No menus yet.</p>}
      </div>
      <Card>
        <CardContent className="pt-5">
          <h4 className="mb-3 text-sm font-semibold">Create / update menu</h4>
          <div className="mb-4 flex items-center gap-2">
            <Input className="w-56" placeholder="slug (e.g. main)" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <Button
              disabled={pending || !slug}
              onClick={() =>
                start(async () => {
                  const result = await upsertMenu(siteId, { slug, items });
                  if (result.ok) toast.success('Menu saved');
                  else toast.error(result.error?.message ?? 'failed');
                  await refresh();
                })
              }
            >
              {pending ? 'Saving…' : 'Save menu'}
            </Button>
          </div>
          <MenuTreeEditor locales={siteLocales} value={items} onChange={setItems} />
        </CardContent>
      </Card>
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
        <Card className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-3 text-sm">
            Signing secret (shown once): <code className="font-mono">{newSecret}</code>
          </CardContent>
        </Card>
      )}
      <Card className="mb-5">
        <CardContent className="pt-5">
          <Table>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    No webhooks yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.url}</TableCell>
                  <TableCell className="text-muted-foreground">{w.events.join(', ')}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => start(async () => { await deleteWebhook(w.id); await refresh(); })}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <form
            className="mt-4 flex max-w-lg flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await createWebhook(siteId, { url, events: events as ('page.published' | 'page.unpublished')[] });
                if (!result.ok) toast.error(result.error?.message ?? 'failed');
                else {
                  setNewSecret(result.data?.secret ?? null);
                  setUrl('');
                  toast.success('Webhook added');
                  await refresh();
                }
              });
            }}
          >
            <Input placeholder="https://example.com/hooks/cms" value={url} onChange={(e) => setUrl(e.target.value)} required />
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Subscribe to events</span>
              <CheckboxGroup options={WEBHOOK_EVENTS.map((ev) => ({ value: ev, label: ev }))} value={events} onChange={setEvents} />
            </div>
            <Button className="self-start" disabled={pending || !url || events.length === 0}>
              Add webhook
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Deliveries are POSTs with <code>x-cms-event</code> and <code>x-cms-signature: sha256=HMAC(body)</code>, retried 5× with backoff.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
