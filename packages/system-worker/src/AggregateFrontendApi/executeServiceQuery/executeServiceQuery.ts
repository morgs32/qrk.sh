import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { mapParseError } from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Result, Schema } from 'effect';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import { executeServiceQuery as executeSystemWorkerServiceQuery } from '../../executeServiceQuery/executeServiceQuery.js';

/*
 * The aggregate frontend capability requests a named service query with its
 * admitted frontend lock. The worker query path requires complete frontend context
 * and runs the named query in the requested service.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Collect and settle the domain operation.
 * 4. Encode the settled domain outcome.
 * 5. Persist telemetry and determine the trace link.
 * 6. Return the linked RPC envelope.
 */
export const executeServiceQuery = Effect.fn(
  'AggregateFrontendApi.executeServiceQuery',
)(function* (props: {
  request: IRpcRequest<
    [{ serviceName: string; queryName: string; params: unknown }]
  >;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;

  // 1 — decode request.args and reject excess fields
  const validatedArgs = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            serviceName: Schema.String,
            queryName: Schema.String,
            params: Schema.Unknown,
          }),
        ]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'aggregate-frontend-api-arguments-invalid',
      prefix:
        'AggregateFrontendApi.executeServiceQuery received invalid arguments',
    }),
    Effect.result,
  );

  // 2 — encode the validation failure with a null trace link
  if (Result.isFailure(validatedArgs)) {
    return {
      result: yield* encodeRpc(Effect.fail(validatedArgs.failure)),
      link: null,
    };
  }

  // 3 — settle executeSystemWorkerServiceQuery with the admitted lock
  const collector = makeTelemetryCollector();
  const settled = yield* executeSystemWorkerServiceQuery({
    aggregateVersion: authResults.aggregateVersion,
    aggregateId: authResults.aggregateId,
    aggregateName: authResults.aggregateName,
    userId: authResults.userId,
    aggregateFrontendLock: authResults.aggregateFrontendLock,
    frontendName: authResults.frontendName,
    params: validatedArgs.success[0].params,
    queryName: validatedArgs.success[0].queryName,
    serviceName: validatedArgs.success[0].serviceName,
  }).pipe(
    Effect.withSpan('AggregateFrontendApi.executeServiceQuery', { root: true }),
    Effect.provide(makeTelemetryLayer(collector)),
    Effect.result,
  );

  // 4 — preserve success or typed failure before attempting telemetry persistence
  const result = yield* Result.match(settled, {
    onFailure: error => encodeRpc(Effect.fail(error)),
    onSuccess: value => encodeRpc(Effect.succeed(value)),
  });

  // 5 — emit a link only after persistence succeeds and the root span matches this method
  const batch = collector.flush();
  const persisted = yield* appendTelemetryBatch({ batch }).pipe(Effect.result);
  const rootSpan = batch.spans.at(-1);
  const link: ISpanLinkRecord | null =
    Result.isSuccess(persisted) &&
    request.traceContext !== null &&
    rootSpan !== undefined &&
    rootSpan.parentSpanId === null &&
    rootSpan.name === 'AggregateFrontendApi.executeServiceQuery'
      ? {
          linkId: makeSpanLinkId(),
          traceId: rootSpan.traceId,
          spanId: rootSpan.spanId,
          priorTraceId: request.traceContext.traceId,
          priorSpanId: request.traceContext.parentSpanId,
          kind: 'causedBy',
        }
      : null;

  // 6 — return the domain result even when no trace link can be emitted
  return { result, link };
});
