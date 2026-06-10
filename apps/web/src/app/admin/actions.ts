'use server';

import { revalidatePath } from 'next/cache';
import type { PageSummary, PresignResult, PublishResult, SiteDto, VersionDto } from '@cms/contracts';
import { api, ApiError } from '@/lib/api-client';

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  error?: { status: number; code: string; message: string };
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: { status: err.status, code: err.code, message: err.message } };
    }
    return { ok: false, error: { status: 500, code: 'internal', message: String(err) } };
  }
}

export async function listSites() {
  return run(() => api<SiteDto[]>('/sites'));
}

export async function listPages(siteId: string) {
  return run(() => api<PageSummary[]>(`/sites/${siteId}/pages`));
}

export async function createPage(
  siteId: string,
  path: string,
  name: string,
  kind: 'page' | 'post' = 'page',
  author?: string,
) {
  const result = await run(() =>
    api<PageSummary>(`/sites/${siteId}/pages`, {
      method: 'POST',
      body: JSON.stringify({ path, name, kind, author }),
    }),
  );
  revalidatePath('/admin');
  return result;
}

export async function addLocale(pageId: string, locale: string) {
  const result = await run(() =>
    api(`/pages/${pageId}/locales`, { method: 'POST', body: JSON.stringify({ locale }) }),
  );
  revalidatePath('/admin');
  return result;
}

export async function saveDraft(
  pageLocaleId: string,
  puckData: unknown,
  baseVersionNo?: number,
  baseUpdatedAt?: string,
) {
  return run(() =>
    api<VersionDto>(`/page-locales/${pageLocaleId}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ puckData, baseVersionNo, baseUpdatedAt }),
    }),
  );
}

export async function publishVersion(pageLocaleId: string, versionId: string) {
  return run(() =>
    api<PublishResult>(`/page-locales/${pageLocaleId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  );
}

export async function unpublish(pageLocaleId: string) {
  return run(() => api(`/page-locales/${pageLocaleId}/unpublish`, { method: 'POST' }));
}

export async function listMedia(siteId: string, status?: string) {
  const qs = status ? `?status=${status}` : '';
  return run(() => api<unknown[]>(`/sites/${siteId}/media${qs}`));
}

export async function presignUpload(siteId: string, filename: string, mime: string, size: number) {
  return run(() =>
    api<PresignResult>(`/sites/${siteId}/media/presign`, {
      method: 'POST',
      body: JSON.stringify({ filename, mime, size }),
    }),
  );
}

export async function confirmUpload(mediaId: string) {
  return run(() => api(`/media/${mediaId}/confirm`, { method: 'POST' }));
}

// --- versions & scheduling ---

export async function listVersions(pageLocaleId: string) {
  return run(() => api<import('@cms/contracts').VersionListItem[]>(`/page-locales/${pageLocaleId}/versions`));
}

export async function getVersion(versionId: string) {
  return run(() => api<import('@cms/contracts').VersionDto>(`/versions/${versionId}`));
}

/** Rollback = copy an old version's content into a fresh draft. */
export async function restoreVersion(pageLocaleId: string, versionId: string) {
  return run(async () => {
    const version = await api<import('@cms/contracts').VersionDto>(`/versions/${versionId}`);
    return api(`/page-locales/${pageLocaleId}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ puckData: version.puckData }),
    });
  });
}

export async function publishOldVersion(pageLocaleId: string, versionId: string) {
  return run(() =>
    api(`/page-locales/${pageLocaleId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  );
}

export async function listSchedules(pageLocaleId: string) {
  return run(() => api<import('@cms/contracts').ScheduleDto[]>(`/page-locales/${pageLocaleId}/schedules`));
}

export async function schedulePublish(pageLocaleId: string, versionId: string, publishAt: string) {
  return run(() =>
    api<import('@cms/contracts').ScheduleDto>(`/page-locales/${pageLocaleId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ versionId, publishAt }),
    }),
  );
}

export async function cancelSchedule(scheduleId: string) {
  return run(() => api(`/schedules/${scheduleId}`, { method: 'DELETE' }));
}

export async function createPreviewLink(versionId: string) {
  // server actions are externally callable POST endpoints — auth is mandatory
  const { getSession } = await import('@/lib/session');
  const session = await getSession();
  if (!session || session.roles.length === 0) {
    return { ok: false as const, error: { status: 401, code: 'no_session', message: 'Not authenticated' } };
  }
  // ownership check: the API 404s versions the caller cannot see
  const version = await run(() => api(`/versions/${versionId}`));
  if (!version.ok) return { ok: false as const, error: version.error };
  const { createPreviewToken } = await import('@/lib/preview-token');
  return { ok: true as const, data: `/preview/${versionId}?token=${createPreviewToken(versionId)}` };
}

// --- site management ---

export async function createSite(body: import('@cms/contracts').CreateSiteBody) {
  const result = await run(() => api('/sites', { method: 'POST', body: JSON.stringify(body) }));
  revalidatePath('/admin');
  return result;
}

export async function updateSite(siteId: string, body: import('@cms/contracts').UpdateSiteBody) {
  const result = await run(() =>
    api(`/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
  revalidatePath('/admin');
  return result;
}

export async function updateSlugOverride(pageLocaleId: string, slugOverride: string | null) {
  const result = await run(() =>
    api(`/page-locales/${pageLocaleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ slugOverride }),
    }),
  );
  revalidatePath('/admin');
  return result;
}

// --- redirects ---

export async function listRedirects(siteId: string) {
  return run(() => api<import('@cms/contracts').RedirectDto[]>(`/sites/${siteId}/redirects`));
}

export async function createRedirect(siteId: string, body: import('@cms/contracts').CreateRedirectBody) {
  const result = await run(() =>
    api(`/sites/${siteId}/redirects`, { method: 'POST', body: JSON.stringify(body) }),
  );
  revalidatePath('/admin/redirects');
  return result;
}

export async function deleteRedirect(id: string) {
  const result = await run(() => api(`/redirects/${id}`, { method: 'DELETE' }));
  revalidatePath('/admin/redirects');
  return result;
}

// --- menus ---

export async function listMenus(siteId: string) {
  return run(() => api<Array<{ id: string; slug: string; items: import('@cms/contracts').MenuItem[] }>>(`/sites/${siteId}/menus`));
}

export async function upsertMenu(siteId: string, body: import('@cms/contracts').UpsertMenuBody) {
  const result = await run(() =>
    api(`/sites/${siteId}/menus`, { method: 'PUT', body: JSON.stringify(body) }),
  );
  revalidatePath('/admin/menus');
  return result;
}

export async function deleteMenu(id: string) {
  const result = await run(() => api(`/menus/${id}`, { method: 'DELETE' }));
  revalidatePath('/admin/menus');
  return result;
}

// --- webhooks ---

export async function listWebhooks(siteId: string) {
  return run(() => api<import('@cms/contracts').WebhookDto[]>(`/sites/${siteId}/webhooks`));
}

export async function createWebhook(siteId: string, body: import('@cms/contracts').CreateWebhookBody) {
  const result = await run(() =>
    api<import('@cms/contracts').WebhookDto>(`/sites/${siteId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  revalidatePath('/admin/webhooks');
  return result;
}

export async function deleteWebhook(id: string) {
  const result = await run(() => api(`/webhooks/${id}`, { method: 'DELETE' }));
  revalidatePath('/admin/webhooks');
  return result;
}

// --- media v2 ---

export async function updateMediaAlt(mediaId: string, alt: Record<string, string>) {
  return run(() => api(`/media/${mediaId}`, { method: 'PATCH', body: JSON.stringify({ alt }) }));
}

export async function deleteMedia(mediaId: string) {
  return run(() => api(`/media/${mediaId}`, { method: 'DELETE' }));
}

// --- members (cms-admin) ---

export interface MemberRow {
  id: string;
  email: string;
  displayName: string;
  role: 'editor' | 'viewer';
}

export async function listMembers(siteId: string) {
  return run(() => api<MemberRow[]>(`/sites/${siteId}/members`));
}

export async function addMember(siteId: string, email: string, role: 'editor' | 'viewer') {
  return run(() => api(`/sites/${siteId}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }));
}

export async function removeMember(memberId: string) {
  return run(() => api(`/members/${memberId}`, { method: 'DELETE' }));
}

// --- page lifecycle ---

export async function renamePage(pageId: string, body: { path?: string; name?: string }) {
  const result = await run(() => api(`/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(body) }));
  revalidatePath('/admin');
  return result;
}

export async function deletePage(pageId: string) {
  const result = await run(() => api(`/pages/${pageId}`, { method: 'DELETE' }));
  revalidatePath('/admin');
  return result;
}

export async function duplicatePage(pageId: string, path: string, name: string) {
  const result = await run(() =>
    api(`/pages/${pageId}/duplicate`, { method: 'POST', body: JSON.stringify({ path, name }) }),
  );
  revalidatePath('/admin');
  return result;
}
