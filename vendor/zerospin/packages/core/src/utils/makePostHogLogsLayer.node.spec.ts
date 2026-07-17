import { Effect, ManagedRuntime } from 'effect';
import { describe, expect, it } from 'vitest';

import { makePostHogLogsLayer } from './makePostHogLogsLayer.ts';

describe('makePostHogLogsLayer', () => {
  it('does not install a PostHog exporter when config is missing', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    const testFetch: typeof globalThis.fetch = () => {
      fetchCalls += 1;
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    globalThis.fetch = testFetch;
    try {
      const runtime = ManagedRuntime.make(
        makePostHogLogsLayer({
          otelExporterOtlpLogsEndpoint: undefined,
          otelExporterOtlpLogsHeaders: undefined,
          otelServiceName: undefined,
        }),
      );

      await runtime.runPromise(Effect.log('Missing PostHog config'));
      await runtime.dispose();

      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not install a PostHog exporter when headers are malformed', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    const testFetch: typeof globalThis.fetch = () => {
      fetchCalls += 1;
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    globalThis.fetch = testFetch;
    try {
      const runtime = ManagedRuntime.make(
        makePostHogLogsLayer({
          otelExporterOtlpLogsEndpoint: 'https://us.i.posthog.com/otlp/v1/logs',
          otelExporterOtlpLogsHeaders: 'X-Token=phc_test',
          otelServiceName: 'unit-test',
        }),
      );

      await runtime.runPromise(Effect.log('Malformed PostHog config'));
      await runtime.dispose();

      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not install the scoped OTLP exporter even when config is valid', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    const testFetch: typeof globalThis.fetch = () => {
      fetchCalls += 1;
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    globalThis.fetch = testFetch;
    try {
      const runtime = ManagedRuntime.make(
        makePostHogLogsLayer({
          otelExporterOtlpLogsEndpoint: 'https://us.i.posthog.com/otlp/v1/logs',
          otelExporterOtlpLogsHeaders: 'Authorization=Bearer phc_test',
          otelServiceName: 'unit-test',
        }),
      );

      await runtime.runPromise(
        Effect.log('Hello PostHog').pipe(
          Effect.annotateLogs({
            subsystem: 'makePostHogLogsLayer',
          }),
        ),
      );
      await runtime.dispose();

      // Scoped OtlpLogger breaks Workers ManagedRuntime / DO runSync; keep empty.
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
