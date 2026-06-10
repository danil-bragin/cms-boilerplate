import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { pageLocales, pages, pageVersions } from '@cms/db';
import { puckPermissionsFor } from '@cms/auth';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { EditorClient } from '@/components/admin/editor-client';

export const dynamic = 'force-dynamic';

export default async function EditPage({
  params,
}: {
  params: Promise<{ pageLocaleId: string }>;
}) {
  const session = await getSession({ refresh: true });
  if (!session) redirect('/api/auth/login?returnTo=/admin');

  const { pageLocaleId } = await params;

  const locale = await db().query.pageLocales.findFirst({
    where: eq(pageLocales.id, pageLocaleId),
  });
  if (!locale) notFound();

  const page = await db().query.pages.findFirst({ where: eq(pages.id, locale.pageId) });
  const latest = await db().query.pageVersions.findFirst({
    where: eq(pageVersions.pageLocaleId, pageLocaleId),
    orderBy: desc(pageVersions.versionNo),
  });
  if (!page || !latest) notFound();

  return (
    <EditorClient
      pageLocaleId={pageLocaleId}
      siteId={page.siteId}
      pagePath={page.path}
      pageName={page.name}
      locale={locale.locale}
      initialData={latest.puckData}
      initialVersionNo={latest.versionNo}
      initialVersionId={latest.id}
      initialStatus={latest.status}
      permissions={puckPermissionsFor(session.roles)}
    />
  );
}
