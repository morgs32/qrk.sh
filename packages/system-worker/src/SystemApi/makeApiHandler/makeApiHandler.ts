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
import { Context, Effect, Exit, Result, Schema } from 'effect';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';

export class SystemApiAuthResults extends Context.Service<
  SystemApiAuthResults,
  {
    readonly systemId: ISystemId;
  }
>()('SystemApiAuthResults') {}

/*
 * SystemApi methods use this boundary to validate argument tuples and encode
 * domain outcomes with trace links. Telemetry persistence controls link emission
 * without replacing the already settled domain result.
 *
 * 1. Capture the method contract.
 * 2. Validate each incoming argument tuple.
 * 3. Return malformed requests immediately.
 * 4. Run the handler in the capability context.
 * 5. Persist collected telemetry.
 * 6. Link only a persisted matching root span.
 * 7. Return the encoded result and optional link.
 */
export function makeApiHandler<ARGS extends Array<unknown>, A, R>(props: {
  name: string;
  argsSchema: Schema.Schema<ARGS>;
  persistTelemetry?: boolean;
  handler: (
    ...args: ARGS
  ) => Effect.Effect<A, IAnyError, R | SystemApiAuthResults>;
}) {
  // 1 — retain the method name, argument schema, and domain handler
  const { argsSchema, handler, name } = props;

  return (request: IRpcRequest<ARGS>) =>
    Effect.gen(function* () {
      // 2 — decode request.args with excess properties rejected
      const validatedArgs = yield* Schema.decodeUnknownEffect(
        Schema.toType(argsSchema),
      )(request.args, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'system-api-arguments-invalid',
          prefix: `${name} received invalid arguments`,
        }),
        Effect.result,
      );

      // 3 — encode the validation failure with a null trace link
      if (Result.isFailure(validatedArgs)) {
        const result = yield* encodeRpc(Effect.fail(validatedArgs.failure));
        return {
          result,
          link: null,
        };
      }

      // 4 — attach systemId and collect method spans before settling the result
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

      // Spec acceptance and inspection must be callable before child Repos are accepted.
      if (props.persistTelemetry === false) {
        return { result, link: null };
      }

      // 5 — flush the collector and record whether appendTelemetryBatch succeeded
      const batch = collector.flush();
      const persisted = yield* appendTelemetryBatch({ batch }).pipe(
        Effect.exit,
      );
      const rootSpan = batch.spans.at(-1);

      // 6 — require caller traceContext, a parentless span, and the exact method name
      const link: ISpanLinkRecord | null =
        Exit.isSuccess(persisted) &&
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

      // 7 — preserve the domain outcome even when telemetry failed
      return {
        result,
        link,
      };
    });
}
