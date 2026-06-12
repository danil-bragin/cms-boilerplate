'use client';

import { useEffect } from 'react';

/**
 * Field Core Web Vitals reporter. Google ranks on field data (CrUX) — this is
 * our own copy of what Chrome reports there, per page, in near-realtime.
 *
 * - web-vitals lib: correct handling of prerendered pages (speculation rules)
 *   and bfcache restores — naive observers double-count both.
 * - Lazy-loaded after hydration; ~2KB; sampled via NEXT_PUBLIC_VITALS_SAMPLE.
 * - Zero PII: metric name/value, path, device class, connection type.
 * - sendBeacon on visibility hidden — survives tab close, never blocks unload.
 */

interface QueuedMetric {
  name: string;
  value: number;
  path: string;
  device: 'mobile' | 'desktop';
  connection: string;
}

export function VitalsReporter() {
  useEffect(() => {
    const start = () => {
      const sample = Number(process.env.NEXT_PUBLIC_VITALS_SAMPLE ?? '1');
      if (Math.random() >= sample) return;

      const queue: QueuedMetric[] = [];
      const device = window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';
      const connection =
        (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? 'unknown';

      const flush = () => {
        if (queue.length === 0) return;
        const body = JSON.stringify({ metrics: queue.splice(0) });
        navigator.sendBeacon('/api/vitals', new Blob([body], { type: 'application/json' }));
      };

      void import('web-vitals').then(({ onLCP, onINP, onCLS, onTTFB, onFCP }) => {
        const report = (metric: { name: string; value: number }) => {
          queue.push({
            name: metric.name,
            value: metric.value,
            path: location.pathname,
            device,
            connection,
          });
        };
        onLCP(report);
        onINP(report);
        onCLS(report);
        onTTFB(report);
        onFCP(report);
      });

      const onHidden = () => {
        if (document.visibilityState === 'hidden') flush();
      };
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('pagehide', flush);
      return () => {
        document.removeEventListener('visibilitychange', onHidden);
        window.removeEventListener('pagehide', flush);
      };
    };
    let cleanup: (() => void) | undefined;
    const useRic = typeof window.requestIdleCallback === 'function';
    const idle = useRic
      ? window.requestIdleCallback(() => { cleanup = start(); })
      : window.setTimeout(() => { cleanup = start(); }, 2000);
    return () => {
      if (useRic) window.cancelIdleCallback(idle as number);
      else clearTimeout(idle as number);
      cleanup?.();
    };
  }, []);

  return null;
}
