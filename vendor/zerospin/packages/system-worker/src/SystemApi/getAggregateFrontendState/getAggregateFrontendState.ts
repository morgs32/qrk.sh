import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
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
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Result, Schema } from 'effect';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import { getAggregateFrontendState as getSystemWorkerAggregateFrontendState } from '../../getAggregateFrontendState/getAggregateFrontendState.js';

export const getAggregateFrontendState = Effect.fn(
  'SystemApi.getAggregateFrontendState',
)(function* (props: {
  request: IRpcRequest<
    [
      {
        aggregateId: IAggregateId;
        aggregateName: string;
        userId: string;
        frontendName: string;
        aggregateFrontendLock: Schema.Schema.Type<
          typeof AggregateFrontendLockSchema
        >;
      },
    ]
  >;
  authResults: {
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;
  const validatedArgs = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            aggregateId: makeAbbreviationIdSchema('acct'),
            aggregateName: Schema.String,
            userId: Schema.NonEmptyString,
            frontendName: Schema.String,
            aggregateFrontendLock: AggregateFrontendLockSchema,
          }),
        ]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-api-arguments-invalid',
      prefix: 'SystemApi.getAggregateFrontendState received invalid arguments',
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
  const settled = yield* getSystemWorkerAggregateFrontendState({
    aggregateId: validatedArgs.success[0].aggregateId,
    aggregateName: validatedArgs.success[0].aggregateName,
    userId: validatedArgs.success[0].userId,
    frontendName: validatedArgs.success[0].frontendName,
    aggregateFrontendLock: validatedArgs.success[0].aggregateFrontendLock,
  }).pipe(
    Effect.withSpan('SystemApi.getAggregateFrontendState', { root: true }),
    Effect.annotateSpans({
      systemId: authResults.systemId,
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
    rootSpan.name === 'SystemApi.getAggregateFrontendState'
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
