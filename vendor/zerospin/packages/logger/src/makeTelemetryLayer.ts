import { Layer, Logger } from 'effect';

import { makeTelemetryLogger } from './makeTelemetryLogger.ts';
import { makeTelemetryTracer } from './makeTelemetryTracer.ts';
import {
  TelemetryCollector,
  type ITelemetryCollector,
} from './TelemetryCollector.ts';

/** One layer per boundary invocation: tracer + logger + collector service. */
export const makeTelemetryLayer = (
  collector: ITelemetryCollector,
): Layer.Layer<TelemetryCollector> =>
  Layer.mergeAll(
    Layer.succeed(TelemetryCollector, collector),
    Layer.setTracer(makeTelemetryTracer(collector)),
    Logger.add(makeTelemetryLogger(collector)),
  );
