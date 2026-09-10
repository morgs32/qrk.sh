/**
 * Bindings-only `Cloudflare.Env` augmentation maintained alongside
 * `system-worker/wrangler.jsonc`. Admin and other downstream packages can
 * reference it without pulling in the generated runtime declarations, which
 * would collide on `declare class DOMException` and other globals with the
 * consumer's own worker-configuration.d.ts.
 *
 * `wrangler types` runs with `--include-env=false`; when the Wrangler binding
 * configuration changes, update the non-namespace fields here and
 * DORepoNamespaces in src/makeDORepo/makeDORepo.ts.
 */
declare namespace Cloudflare {
  interface Env extends DORepoNamespaces {
    ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
    ZEROSPIN_PUBLISHABLE_KEY?: string;
    ZEROSPIN_SECRET_KEY?: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
    ZEROSPIN_VERSION_METADATA?: { id: string };
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?: string;
    OTEL_EXPORTER_OTLP_LOGS_HEADERS?: string;
    OTEL_SERVICE_NAME?: string;
  }
}
