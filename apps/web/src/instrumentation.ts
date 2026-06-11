import { registerOTel } from '@vercel/otel';

/**
 * Next.js instrumentation hook. Traces RSC renders, route handlers and
 * fetches; a MeterProvider is registered separately so the RUM web-vitals
 * histograms export too (@vercel/otel only wires tracing).
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */
export async function register(): Promise<void> {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'cms-web' });

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { metrics } = await import('@opentelemetry/api');
    const { MeterProvider, PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    metrics.setGlobalMeterProvider(
      new MeterProvider({
        resource: resourceFromAttributes({
          'service.name': process.env.OTEL_SERVICE_NAME ?? 'cms-web',
        }),
        readers: [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
            exportIntervalMillis: 15_000,
          }),
        ],
      }),
    );
  }
}
