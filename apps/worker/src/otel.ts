/**
 * OpenTelemetry bootstrap. Must be imported before anything else in main.ts
 * so auto-instrumentations can patch http/express/pg/ioredis at load time.
 *
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set — zero overhead by default.
 * Point it at any OTLP collector (Jaeger, Tempo, ADOT, …); the compose file
 * ships Jaeger under the `observability` profile.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'cms-worker',
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are pure noise for an http api
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
}
