import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { recordVital, type VitalName } from '@/lib/vitals-metrics';
import { resolveSiteByHost } from '@/lib/site-resolver';

/**
 * RUM beacon sink. Public by design (real users post here) — hardened by
 * strict schema, value caps, batch cap, and a per-IP rate limit.
 */

const metricSchema = z.object({
  name: z.enum(['LCP', 'INP', 'CLS', 'TTFB', 'FCP']),
  value: z.number().min(0).max(120_000),
  path: z.string().max(500),
  device: z.enum(['mobile', 'desktop']).default('desktop'),
  connection: z.string().max(20).default('unknown'),
});

const bodySchema = z.object({ metrics: z.array(metricSchema).min(1).max(20) });

const WINDOW_MS = 60_000;
const LIMIT = 60;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) return true;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 50_000) hits.clear();
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim();
  if (rateLimited(ip)) return new NextResponse(null, { status: 429 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  // bound host-label cardinality: only known site hosts, else '_other'
  const rawHost = (req.headers.get('host') ?? '').split(':')[0]!;
  const site = await resolveSiteByHost(rawHost);
  const host = site ? rawHost : '_other';
  for (const metric of parsed.data.metrics) {
    recordVital(metric.name as VitalName, metric.value, {
      host,
      path: metric.path,
      device: metric.device,
      connection: metric.connection,
    });
  }
  return new NextResponse(null, { status: 204 });
}
