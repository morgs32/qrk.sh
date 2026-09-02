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
import { executeAggregateQuery as executeSystemWorkerAggregateQuery } from '../../executeAggregateQuery/executeAggregateQuery.js';

export const executeAggregateQuery = Effect.fn(
  'AggregateFrontendApi.executeAggregateQuery',
)(function* (props: {
  request: IRpcRequest<[{ queryName: string; params: unknown }]>;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;
  const validatedArgs = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({ queryName: Schema.String, params: Schema.Unknown }),
        ]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'aggregate-frontend-api-arguments-invalid',
      prefix:
        'AggregateFrontendApi.executeAggregateQuery received invalid arguments',
    }),
    Effect.result,
  );
  if (Result.isFailure(validatedArgs)) {
    return {
      result: yield* encodeRpc(Effect.fail(validatedArgs.failure)),
      link: null,
    };
  }

  const collector = makeTelemetryCollector();
  const settled = yield* executeSystemWorkerAggregateQuery({
    aggregateId: authResults.aggregateId,
    aggregateName: authResults.aggregateName,
    userId: authResults.userId,
    aggregateFrontendLock: authResults.aggregateFrontendLock,
    frontendName: authResults.frontendName,
    params: validatedArgs.success[0].params,
    queryName: validatedArgs.success[0].queryName,
  }).pipe(
    Effect.withSpan('AggregateFrontendApi.executeAggregateQuery', {
      root: true,
    }),
    Effect.provide(makeTelemetryLayer(collector)),
    Effect.result,
  );
  const result = yield* Result.match(settled, {
    onFailure: error => encodeRpc(Effect.fail(error)),
    onSuccess: value => encodeRpc(Effect.succeed(value)),
  });

  const batch = collector.flush();
  const persisted = yield* appendTelemetryBatch({ batch }).pipe(Effect.result);
  const rootSpan = batch.spans.at(-1);
  const link: ISpanLinkRecord | null =
    Result.isSuccess(persisted) &&
    request.traceContext !== null &&
    rootSpan !== undefined &&
    rootSpan.parentSpanId === null &&
    rootSpan.name === 'AggregateFrontendApi.executeAggregateQuery'
      ? {
          linkId: makeSpanLinkId(),
          traceId: rootSpan.traceId,
          spanId: rootSpan.spanId,
          priorTraceId: request.traceContext.traceId,
          priorSpanId: request.traceContext.parentSpanId,
          kind: 'causedBy',
        }
      : null;
  return { result, link };
});
