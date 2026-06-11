import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/lib/db';
import { resolveSiteByHost } from '@/lib/site-resolver';

export const dynamic = 'force-dynamic';

/** IndexNow key file (referenced via keyLocation in the ping payload). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const site = await resolveSiteByHost(host);
  const key = (site?.settings as { indexNowKey?: string } | undefined)?.indexNowKey;
  if (!key) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(key, {
    headers: { 'content-type': 'text/plain', 'cache-control': 'public, s-maxage=3600' },
  });
}
