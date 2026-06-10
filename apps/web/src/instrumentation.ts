import { registerOTel } from '@vercel/otel';

/**
 * Next.js instrumentation hook. Traces RSC renders, route handlers and
 * fetches. No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */
export function register(): void {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'cms-web' });
  }
}
