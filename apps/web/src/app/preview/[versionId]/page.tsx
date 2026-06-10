import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { pageVersions } from '@cms/db';
import { Render } from '@puckeditor/core/rsc';
import { renderConfig } from '@cms/puck-config/render';
import '@/lib/images.server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { versionId } = await params;
  const { token } = await searchParams;

  // shareable link (HMAC token) or an authenticated editor session
  const { verifyPreviewToken } = await import('@/lib/preview-token');
  if (!token || !verifyPreviewToken(versionId, token)) {
    const session = await getSession({ refresh: true });
    if (!session) redirect('/api/auth/login?returnTo=/admin');
  }
  const version = await db().query.pageVersions.findFirst({
    where: eq(pageVersions.id, versionId),
  });
  if (!version) notFound();

  return (
    <>
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: '#fef7e0',
          borderBottom: '1px solid #f3d19c',
          padding: '4px 16px',
          fontSize: 13,
          zIndex: 100,
        }}
      >
        Preview — v{version.versionNo} ({version.status}), not public
      </div>
      <Render config={renderConfig} data={version.puckData as never} />
    </>
  );
}
