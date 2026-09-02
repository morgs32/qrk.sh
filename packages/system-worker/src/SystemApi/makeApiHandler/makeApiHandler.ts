import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { mapParseError, type IAnyError } from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Context, Effect, Result, Schema } from 'effect';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';

export class SystemApiAuthResults extends Context.Service<
  SystemApiAuthResults,
  {
    readonly systemId: ISystemId;
  }
>()('SystemApiAuthResults') {}

export function makeApiHandler<ARGS extends Array<unknown>, A, R>(props: {
  name: string;
  argsSchema: Schema.Schema<ARGS>;
  handler: (
    ...args: ARGS
  ) => Effect.Effect<A, IAnyError, R | SystemApiAuthResults>;
}) {
  const { argsSchema, handler, name } = props;

  return (request: IRpcRequest<ARGS>) =>
    Effect.gen(function* () {
      const validatedArgs = yield* Schema.decodeUnknownEffect(
        Schema.toType(argsSchema),
      )(request.args, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'system-api-arguments-invalid',
          prefix: `${name} received invalid arguments`,
        }),
        Effect.result,
      );

      if (Result.isFailure(validatedArgs)) {
        const result = yield* encodeRpc(Effect.fail(validatedArgs.failure));
        return {
          result,
          link: null,
        };
      }

      const authResults = yield* SystemApiAuthResults;
      const collector = makeTelemetryCollector();

      const settled = yield* handler(...validatedArgs.success).pipe(
        Effect.annotateSpans({ systemId: authResults.systemId }),
        Effect.provideService(SystemApiAuthResults, authResults),
        Effect.provide(makeTelemetryLayer(collector)),
        Effect.result,
      );
      const result = yield* Result.match(settled, {
        onFailure: error => encodeRpc(Effect.fail(error)),
        onSuccess: value => encodeRpc(Effect.succeed(value)),
      });

      const batch = collector.flush();
      const persisted = yield* appendTelemetryBatch({ batch }).pipe(
        Effect.result,
      );
      const rootSpan = batch.spans.at(-1);

      const link: ISpanLinkRecord | null =
        Result.isSuccess(persisted) &&
        request.traceContext !== null &&
        rootSpan !== undefined &&
        rootSpan.parentSpanId === null &&
        rootSpan.name === name
          ? {
              linkId: makeSpanLinkId(),
              traceId: rootSpan.traceId,
              spanId: rootSpan.spanId,
              priorTraceId: request.traceContext.traceId,
              priorSpanId: request.traceContext.parentSpanId,
              kind: 'causedBy',
            }
          : null;

      return {
        result,
        link,
      };
    });
}
