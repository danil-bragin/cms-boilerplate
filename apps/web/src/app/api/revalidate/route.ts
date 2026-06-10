import { revalidateTag } from 'next/cache';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const bodySchema = z.object({ tags: z.array(z.string().min(1)).min(1).max(100) });

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'revalidation not configured' }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get('x-revalidate-signature') ?? '';
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  for (const tag of parsed.data.tags) {
    // expire:0 = hard invalidation — publish must be read-your-writes,
    // SWR ('max') would serve one stale response after publishing
    revalidateTag(tag, { expire: 0 });
  }
  return NextResponse.json({ revalidated: true, tags: parsed.data.tags });
}
