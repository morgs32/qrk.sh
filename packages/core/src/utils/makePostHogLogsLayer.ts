import { Layer } from 'effect';

const authorizationHeaderPrefix = 'Authorization=';
const bearerPrefix = 'Bearer ';

export function makePostHogLogsLayer(props: {
  otelExporterOtlpLogsEndpoint: string | undefined;
  otelExporterOtlpLogsHeaders: string | undefined;
  otelServiceName: string | undefined;
}) {
  const {
    otelExporterOtlpLogsEndpoint,
    otelExporterOtlpLogsHeaders,
    otelServiceName,
  } = props;

  if (
    !otelExporterOtlpLogsEndpoint ||
    !otelExporterOtlpLogsHeaders ||
    !otelServiceName
  ) {
    return Layer.empty;
  }

  if (!otelExporterOtlpLogsHeaders.startsWith(authorizationHeaderPrefix)) {
    return Layer.empty;
  }

  const authorization = otelExporterOtlpLogsHeaders.slice(
    authorizationHeaderPrefix.length,
  );

  if (
    !authorization.startsWith(bearerPrefix) ||
    authorization.length === bearerPrefix.length
  ) {
    return Layer.empty;
  }

  // OtlpLogger.layer uses Logger.addScoped / async exporter fibers. Wiring that
  // into ManagedRuntime used by Workers (and DO runSync paths) surfaces as
  // AsyncFiberException and masks real domain errors. Keep the config gate
  // above for when a sync-safe exporter exists; do not install the scoped layer.
  return Layer.empty;
}
