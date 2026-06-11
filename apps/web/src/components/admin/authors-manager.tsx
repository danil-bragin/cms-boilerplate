'use client';

import { useEffect, useState, useTransition } from 'react';
import type { SiteDto } from '@cms/contracts';
import { deleteAuthor, listAuthors, upsertAuthor, type AuthorRow } from '@/app/admin/actions';
import { SitePicker } from './simple-managers';
import { Field, UrlListInput } from './inputs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';

export function AuthorsManager({ sites }: { sites: SiteDto[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [rows, setRows] = useState<AuthorRow[]>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [sameAs, setSameAs] = useState<string[]>([]);
  const [pending, start] = useTransition();

  async function refresh(id = siteId) {
    const r = await listAuthors(id);
    if (r.ok && r.data) setRows(r.data);
  }
  useEffect(() => {
    if (siteId) void refresh(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return (
    <div>
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
      <div className="mb-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No authors yet.</p>}
        {rows.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <strong className="text-sm">{a.name}</strong>
                <code className="ml-2 text-xs text-muted-foreground">/author/{a.slug}</code>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setSlug(a.slug); setName(a.name); setBio(a.bio); setSameAs(a.sameAs); }}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await deleteAuthor(a.id); await refresh(); })}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="max-w-2xl">
        <CardContent className="pt-5">
          <h4 className="mb-3 text-sm font-semibold">Create / update author</h4>
          <div className="mb-3 flex gap-2">
            <Input className="flex-1" placeholder="slug (jane-doe)" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <Input className="flex-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Textarea className="mb-3" placeholder="Bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          <Field label="Social profiles (sameAs)" hint="Press Enter to add each profile URL — strengthens E-E-A-T">
            <UrlListInput value={sameAs} onChange={setSameAs} />
          </Field>
          <Button
            disabled={pending || !slug || !name}
            onClick={() =>
              start(async () => {
                const result = await upsertAuthor(siteId, { slug, name, bio, avatarKey: null, sameAs });
                if (!result.ok) toast.error(result.error?.message ?? 'failed');
                else {
                  toast.success('Author saved');
                  setSlug('');
                  setName('');
                  setBio('');
                  setSameAs([]);
                  await refresh();
                }
              })
            }
          >
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
