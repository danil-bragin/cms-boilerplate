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

export async function createPage(siteId: string, path: string, name: string) {
  const result = await run(() =>
    api<PageSummary>(`/sites/${siteId}/pages`, {
      method: 'POST',
      body: JSON.stringify({ path, name }),
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

export async function saveDraft(pageLocaleId: string, puckData: unknown, baseVersionNo?: number) {
  return run(() =>
    api<VersionDto>(`/page-locales/${pageLocaleId}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ puckData, baseVersionNo }),
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
