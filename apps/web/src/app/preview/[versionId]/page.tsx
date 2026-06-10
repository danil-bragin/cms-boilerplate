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
}: {
  params: Promise<{ versionId: string }>;
}) {
  const session = await getSession({ refresh: true });
  if (!session) redirect('/api/auth/login?returnTo=/admin');

  const { versionId } = await params;
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
