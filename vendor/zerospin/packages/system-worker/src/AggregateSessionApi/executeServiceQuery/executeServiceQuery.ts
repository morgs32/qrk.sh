import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeError, mapParseError } from '@zerospin/error';
import {
  makeRpcEnvelope,
  makeSpanLinkId,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Exit, Result, Schema } from 'effect';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import { executeServiceQuery as executeSystemWorkerServiceQuery } from '../../executeServiceQuery/executeServiceQuery.js';

/*
 * The aggregate definition capability requests a named service query with its
 * admitted definition lock. The worker query path requires complete definition context
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
  'AggregateSessionApi.executeServiceQuery',
)(function* (props: {
  request: IRpcRequest<
    [{ serviceName: string; queryName: string; params: unknown }]
  >;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly claims: Readonly<Record<string, unknown>>;
    actorName: string;
    actorVersion: string;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly aggregateSessionLock: IAggregateSessionLock;
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
      code: 'aggregate-session-api-arguments-invalid',
      prefix:
        'AggregateSessionApi.executeServiceQuery received invalid arguments',
    }),
    Effect.result,
  );

  // 2 — encode the validation failure with a null trace link
  if (Result.isFailure(validatedArgs)) {
    return {
      result: yield* encodeError(validatedArgs.failure).pipe(
        Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
      ),
      link: null,
    };
  }

  // 3 — settle executeSystemWorkerServiceQuery with the admitted lock
  const settled = yield* executeSystemWorkerServiceQuery({
    aggregateVersion: authResults.aggregateVersion,
    aggregateId: authResults.aggregateId,
    aggregateName: authResults.aggregateName,
    claims: authResults.claims,
    aggregateSessionLock: authResults.aggregateSessionLock,
    sessionName: authResults.sessionName,
    params: validatedArgs.success[0].params,
    queryName: validatedArgs.success[0].queryName,
    serviceName: validatedArgs.success[0].serviceName,
  }).pipe(
    Effect.withSpan('AggregateSessionApi.executeServiceQuery', { root: true }),
    makeRpcEnvelope,
  );

  // 4 — preserve success or typed failure before attempting telemetry persistence
  const result = settled.result;

  // 5 — emit a link only after persistence succeeds and the root span matches this method
  const batch = settled.telemetry;
  const persisted = yield* appendTelemetryBatch({ batch }).pipe(Effect.exit);
  const rootSpan = batch.spans.at(-1);
  const link: ISpanLinkRecord | null =
    Exit.isSuccess(persisted) &&
    request.traceContext !== null &&
    rootSpan !== undefined &&
    rootSpan.parentSpanId === null &&
    rootSpan.name === 'AggregateSessionApi.executeServiceQuery'
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
