import { Layer, References } from 'effect';

export const TraceLoggerLayer = Layer.succeed(
  References.MinimumLogLevel,
  'Trace',
);
