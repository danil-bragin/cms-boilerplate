'use client';

import { useEffect, useState, useTransition } from 'react';
import type { SiteDto } from '@cms/contracts';
import { createSite, updateSite } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { Field, TagInput, UrlListInput, LocaleSelect, Toggle, isValidHostname, isValidLocale } from './inputs';

export function SiteForm() {
  const [slug, setSlug] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [locales, setLocales] = useState<string[]>(['en']);
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardContent className="pt-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const result = await createSite({ slug, domains, locales, defaultLocale });
              if (!result.ok) toast.error(result.error?.message ?? 'failed');
              else {
                toast.success('Site created');
                setSlug('');
                setDomains([]);
                setLocales(['en']);
              }
            });
          }}
        >
          <Field label="Slug" hint="Internal handle, e.g. my-site">
            <Input placeholder="my-site" value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </Field>
          <Field label="Domains" hint="Press Enter to add each hostname">
            <TagInput value={domains} onChange={setDomains} validate={isValidHostname} placeholder="example.com" />
          </Field>
          <Field label="Locales" hint="Press Enter to add each locale code (en, de, en-US)">
            <TagInput value={locales} onChange={setLocales} validate={isValidLocale} placeholder="en" />
          </Field>
          <Field label="Default locale">
            <LocaleSelect locales={locales} value={defaultLocale} onChange={setDefaultLocale} />
          </Field>
          <Button type="submit" disabled={pending || !slug || !domains.length || !locales.length}>
            {pending ? 'Creating…' : 'Create site'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface SiteSettings {
  seo?: { blockAiTraining?: boolean; googleVerification?: string; bingVerification?: string };
  localeFallback?: boolean;
  org?: { name?: string; logoUrl?: string; sameAs?: string[] };
}

export function SiteEditor({ site }: { site: SiteDto & { settings?: SiteSettings } }) {
  const [domains, setDomains] = useState<string[]>(site.domains);
  const [locales, setLocales] = useState<string[]>(site.locales);
  const [defaultLocale, setDefaultLocale] = useState(site.defaultLocale);
  const [blockAi, setBlockAi] = useState(Boolean(site.settings?.seo?.blockAiTraining));
  const [localeFallback, setLocaleFallback] = useState(Boolean(site.settings?.localeFallback));
  const [googleVerify, setGoogleVerify] = useState(site.settings?.seo?.googleVerification ?? '');
  const [bingVerify, setBingVerify] = useState(site.settings?.seo?.bingVerification ?? '');
  const [orgName, setOrgName] = useState(site.settings?.org?.name ?? '');
  const [orgLogo, setOrgLogo] = useState(site.settings?.org?.logoUrl ?? '');
  const [orgSameAs, setOrgSameAs] = useState<string[]>(site.settings?.org?.sameAs ?? []);
  const [seoOpen, setSeoOpen] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const result = await updateSite(site.id, {
        domains,
        locales,
        defaultLocale,
        localeFallback,
        seo: {
          blockAiTraining: blockAi,
          ...(googleVerify ? { googleVerification: googleVerify } : {}),
          ...(bingVerify ? { bingVerification: bingVerify } : {}),
        },
        org: orgName ? { name: orgName, ...(orgLogo ? { logoUrl: orgLogo } : {}), sameAs: orgSameAs } : undefined,
      });
      if (result.ok) toast.success('Saved');
      else toast.error(result.error?.message ?? 'failed');
    });
  }

  return (
    <Card className="mb-5">
      <CardContent className="pt-5">
        <h3 className="mb-4 text-base font-semibold">{site.slug}</h3>
        <Field label="Domains">
          <TagInput value={domains} onChange={setDomains} validate={isValidHostname} placeholder="example.com" />
        </Field>
        <Field label="Locales">
          <TagInput value={locales} onChange={setLocales} validate={isValidLocale} placeholder="en" />
        </Field>
        <Field label="Default locale">
          <LocaleSelect locales={locales} value={defaultLocale} onChange={setDefaultLocale} />
        </Field>
        <div className="my-3 flex flex-col gap-2.5">
          <Toggle checked={blockAi} onChange={setBlockAi} label="Block AI-training bots in robots.txt" />
          <Toggle
            checked={localeFallback}
            onChange={setLocaleFallback}
            label="Locale fallback (untranslated paths → default locale)"
          />
        </div>

        <button
          type="button"
          onClick={() => setSeoOpen((v) => !v)}
          className="mb-3 text-sm text-muted-foreground hover:text-foreground"
        >
          {seoOpen ? '▾' : '▸'} SEO & Organization
        </button>
        {seoOpen && (
          <div className="mb-3 rounded-lg border bg-muted/30 p-4">
            <Field label="Google Search Console verification" hint="The google-site-verification token">
              <Input value={googleVerify} onChange={(e) => setGoogleVerify(e.target.value)} placeholder="token" />
            </Field>
            <Field label="Bing verification" hint="The msvalidate.01 token">
              <Input value={bingVerify} onChange={(e) => setBingVerify(e.target.value)} placeholder="token" />
            </Field>
            <Field label="Organization name" hint="Used in Organization JSON-LD and OG site name">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc" />
            </Field>
            <Field label="Logo URL">
              <Input value={orgLogo} onChange={(e) => setOrgLogo(e.target.value)} placeholder="https://…/logo.png" />
            </Field>
            <Field label="Social profiles (sameAs)" hint="Press Enter to add each profile URL">
              <UrlListInput value={orgSameAs} onChange={setOrgSameAs} />
            </Field>
          </div>
        )}

        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>

        <Separator className="my-5" />
        <MembersEditor siteId={site.id} />
      </CardContent>
    </Card>
  );
}

export function MembersEditor({ siteId }: { siteId: string }) {
  const [members, setMembers] = useState<Array<{ id: string; email: string; role: string }>>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [pending, start] = useTransition();

  async function refresh() {
    const { listMembers } = await import('@/app/admin/actions');
    const result = await listMembers(siteId);
    if (result.ok && result.data) setMembers(result.data);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return (
    <div>
      <h4 className="text-sm font-semibold">Members</h4>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
        Empty list = open to all editors. Once configured, only members (and admins) can touch this site.
      </p>
      {members.length === 0 && <p className="mb-2 text-sm text-muted-foreground">No members yet — site is open.</p>}
      {members.map((m) => (
        <div key={m.id} className="mb-1 flex items-center gap-2 text-sm">
          <span className="flex-1">{m.email}</span>
          <span className="text-muted-foreground">{m.role}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const { removeMember } = await import('@/app/admin/actions');
                await removeMember(m.id);
                await refresh();
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <div className="mt-2 flex gap-2">
        <Input
          placeholder="user@example.com (must have logged in once)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Select value={role} onValueChange={(v) => setRole(v as 'editor' | 'viewer')}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="editor">editor</SelectItem>
            <SelectItem value="viewer">viewer</SelectItem>
          </SelectContent>
        </Select>
        <Button
          disabled={pending || !email}
          onClick={() =>
            start(async () => {
              const { addMember } = await import('@/app/admin/actions');
              const result = await addMember(siteId, email, role);
              if (!result.ok) toast.error(result.error?.message ?? 'failed');
              else {
                setEmail('');
                await refresh();
              }
            })
          }
        >
          Add
        </Button>
      </div>
    </div>
  );
}
