'use client';

import { useEffect, useState, useTransition } from 'react';
import type { SiteDto } from '@cms/contracts';
import { createSite, updateSite } from '@/app/admin/actions';
import {
  Field,
  TagInput,
  UrlListInput,
  LocaleSelect,
  Toggle,
  inputStyle,
  isValidHostname,
  isValidLocale,
} from './inputs';

export function SiteForm() {
  const [slug, setSlug] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [locales, setLocales] = useState<string[]>(['en']);
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await createSite({ slug, domains, locales, defaultLocale });
          if (!result.ok) setError(result.error?.message ?? 'failed');
          else {
            setSlug('');
            setDomains([]);
            setLocales(['en']);
          }
        });
      }}
      style={{ maxWidth: 560 }}
    >
      <Field label="Slug" hint="Internal handle, e.g. my-site">
        <input style={inputStyle} placeholder="my-site" value={slug} onChange={(e) => setSlug(e.target.value)} required />
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
      <button disabled={pending || !slug || !domains.length || !locales.length} style={btn}>
        {pending ? 'Creating…' : 'Create site'}
      </button>
      {error && <p style={{ color: '#c5221f' }}>{error}</p>}
    </form>
  );
}

const btn: React.CSSProperties = {
  padding: '8px 18px',
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
};

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
  const [message, setMessage] = useState<string | null>(null);
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
      setMessage(result.ok ? 'Saved' : (result.error?.message ?? 'failed'));
    });
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16, maxWidth: 640 }}>
      <strong style={{ fontSize: 16 }}>{site.slug}</strong>
      <div style={{ marginTop: 12 }}>
        <Field label="Domains">
          <TagInput value={domains} onChange={setDomains} validate={isValidHostname} placeholder="example.com" />
        </Field>
        <Field label="Locales">
          <TagInput value={locales} onChange={setLocales} validate={isValidLocale} placeholder="en" />
        </Field>
        <Field label="Default locale">
          <LocaleSelect locales={locales} value={defaultLocale} onChange={setDefaultLocale} />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
          <Toggle checked={blockAi} onChange={setBlockAi} label="Block AI-training bots in robots.txt" />
          <Toggle
            checked={localeFallback}
            onChange={setLocaleFallback}
            label="Locale fallback (untranslated paths → default locale)"
          />
        </div>
      </div>
      <details style={{ margin: '8px 0' }}>
        <summary style={{ cursor: 'pointer', color: '#555', fontSize: 13, marginBottom: 8 }}>SEO & Organization</summary>
        <Field label="Google Search Console verification" hint="The google-site-verification token">
          <input style={inputStyle} value={googleVerify} onChange={(e) => setGoogleVerify(e.target.value)} placeholder="token" />
        </Field>
        <Field label="Bing verification" hint="The msvalidate.01 token">
          <input style={inputStyle} value={bingVerify} onChange={(e) => setBingVerify(e.target.value)} placeholder="token" />
        </Field>
        <Field label="Organization name" hint="Used in Organization JSON-LD and OG site name">
          <input style={inputStyle} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc" />
        </Field>
        <Field label="Logo URL">
          <input style={inputStyle} value={orgLogo} onChange={(e) => setOrgLogo(e.target.value)} placeholder="https://…/logo.png" />
        </Field>
        <Field label="Social profiles (sameAs)" hint="Press Enter to add each profile URL">
          <UrlListInput value={orgSameAs} onChange={setOrgSameAs} />
        </Field>
      </details>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button disabled={pending} style={btn} onClick={save}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        {message && <span style={{ color: message === 'Saved' ? '#137333' : '#c5221f' }}>{message}</span>}
      </div>
      <MembersEditor siteId={site.id} />
    </div>
  );
}

export function MembersEditor({ siteId }: { siteId: string }) {
  const [members, setMembers] = useState<Array<{ id: string; email: string; role: string }>>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState<string | null>(null);
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
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #ddd' }}>
      <strong style={{ fontSize: 13 }}>Members</strong>
      <p style={{ fontSize: 12, color: '#777', margin: '2px 0 6px' }}>
        Empty list = open to all editors. Once configured, only members (and admins) can touch this site.
      </p>
      {members.length === 0 && <p style={{ fontSize: 13, color: '#aaa', margin: '0 0 6px' }}>No members yet — site is open.</p>}
      {members.map((m) => (
        <div key={m.id} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{m.email}</span>
          <span style={{ color: '#777' }}>{m.role}</span>
          <button
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
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input
          placeholder="user@example.com (must have logged in once)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: 6, fontSize: 13, border: '1px solid #d0d0d8', borderRadius: 6 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} style={{ padding: 6, borderRadius: 6 }}>
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>
        <button
          disabled={pending || !email}
          onClick={() =>
            start(async () => {
              setError(null);
              const { addMember } = await import('@/app/admin/actions');
              const result = await addMember(siteId, email, role);
              if (!result.ok) setError(result.error?.message ?? 'failed');
              else {
                setEmail('');
                await refresh();
              }
            })
          }
        >
          Add
        </button>
      </div>
      {error && <p style={{ color: '#c5221f', fontSize: 13 }}>{error}</p>}
    </div>
  );
}
