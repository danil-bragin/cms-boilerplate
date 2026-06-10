import { NextResponse } from 'next/server';
import { imageUrl } from '@cms/puck-config';
import '@/lib/images.server';
import { getSession } from '@/lib/session';

/**
 * Authenticated image proxy for the editor canvas: signs the imgproxy URL
 * server-side and redirects, so signing keys never ship to the browser.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { key } = await params;
  const s3Key = key.join('/');
  if (s3Key.includes('..')) return NextResponse.json({ error: 'bad key' }, { status: 400 });

  const url = new URL(req.url);
  const width = Number(url.searchParams.get('w') ?? 0) || undefined;
  const height = Number(url.searchParams.get('h') ?? 0) || undefined;

  const target = imageUrl(s3Key, { width, height });
  if (!target) return NextResponse.json({ error: 'images not configured' }, { status: 503 });
  return NextResponse.redirect(target, { status: 302 });
}
