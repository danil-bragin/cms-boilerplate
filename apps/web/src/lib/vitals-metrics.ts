import 'server-only';
import { metrics } from '@opentelemetry/api';

/**
 * OTel histograms for field Web Vitals. Bucket boundaries align with Google's
 * good/needs-improvement/poor thresholds so the dashboard can read pass rates
 * straight off the buckets. CLS is unitless 0..n — recorded ×1000 to keep
 * integer-ish buckets.
 *
 * Cardinality guard: the `path` label is normalized and capped at
 * MAX_TRACKED_PATHS unique values per replica; overflow lands in `_other`.
 */

const MAX_TRACKED_PATHS = 500;
const seenPaths = new Set<string>();

const meter = metrics.getMeter('cms-web-vitals');

const histograms = {
  LCP: meter.createHistogram('web_vitals_lcp', {
    unit: 'ms',
    description: 'Largest Contentful Paint (field)',
    advice: { explicitBucketBoundaries: [500, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 8000, 12000] },
  }),
  INP: meter.createHistogram('web_vitals_inp', {
    unit: 'ms',
    description: 'Interaction to Next Paint (field)',
    advice: { explicitBucketBoundaries: [50, 100, 150, 200, 300, 500, 750, 1000, 2000] },
  }),
  CLS: meter.createHistogram('web_vitals_cls_x1000', {
    description: 'Cumulative Layout Shift ×1000 (field)',
    advice: { explicitBucketBoundaries: [10, 25, 50, 100, 150, 250, 500, 1000] },
  }),
  TTFB: meter.createHistogram('web_vitals_ttfb', {
    unit: 'ms',
    description: 'Time To First Byte (field)',
    advice: { explicitBucketBoundaries: [100, 200, 400, 800, 1200, 1800, 3000] },
  }),
  FCP: meter.createHistogram('web_vitals_fcp', {
    unit: 'ms',
    description: 'First Contentful Paint (field)',
    advice: { explicitBucketBoundaries: [500, 1000, 1800, 2500, 3000, 4000, 6000] },
  }),
} as const;

export type VitalName = keyof typeof histograms;

export function normalizePath(path: string): string {
  const clean = path.split('?')[0]!.toLowerCase().slice(0, 100) || '/';
  if (seenPaths.has(clean)) return clean;
  if (seenPaths.size >= MAX_TRACKED_PATHS) return '_other';
  seenPaths.add(clean);
  return clean;
}

export function recordVital(
  name: VitalName,
  value: number,
  attrs: { host: string; path: string; device: string; connection: string },
): void {
  const histogram = histograms[name];
  const recorded = name === 'CLS' ? Math.round(value * 1000) : value;
  histogram.record(recorded, {
    host: attrs.host,
    path: normalizePath(attrs.path),
    device: attrs.device === 'mobile' ? 'mobile' : 'desktop',
    connection: ['slow-2g', '2g', '3g', '4g'].includes(attrs.connection) ? attrs.connection : 'unknown',
  });
}
